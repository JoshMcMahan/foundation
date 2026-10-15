import { isDev } from '../dev'
import type { AccessChange, AccessGrant, AccessGroup, AccessPermission, AccessRole } from './types'

/** The grants indexed for the questions the drawer asks of them. */
export interface AccessModel {
  roles: readonly AccessRole[]
  roleById: ReadonlyMap<string, AccessRole>
  groupById: ReadonlyMap<string, AccessGroup>
  everyone: AccessGroup | undefined
  /** The roles each group holds itself, in the roles' order. */
  held: ReadonlyMap<string, readonly AccessRole[]>
  /** The groups holding each role, in the order the host gave the groups. */
  holders: ReadonlyMap<string, readonly AccessGroup[]>
  permissionLabel: (id: string) => string
}

export function buildModel(
  roles: readonly AccessRole[],
  groups: readonly AccessGroup[],
  grants: readonly AccessGrant[],
  permissions: readonly AccessPermission[] = [],
): AccessModel {
  const roleById = new Map(roles.map((role) => [role.id, role]))
  const groupById = new Map(groups.map((group) => [group.id, group]))
  const granted = new Set(grants.map(key))
  const held = new Map<string, AccessRole[]>()
  const holders = new Map<string, AccessGroup[]>()
  for (const group of groups) {
    const own = roles.filter((role) => granted.has(key({ groupId: group.id, roleId: role.id })))
    if (own.length > 0) {
      held.set(group.id, own)
    }
    for (const role of own) {
      holders.set(role.id, [...(holders.get(role.id) ?? []), group])
    }
  }
  const labels = new Map(permissions.map((p) => [p.id, p.label]))
  return {
    roles,
    roleById,
    groupById,
    everyone: groups.find((group) => group.kind === 'everyone'),
    held,
    holders,
    permissionLabel: (id) => labels.get(id) ?? id,
  }
}

export const key = (grant: AccessGrant) => `${grant.groupId}\u0000${grant.roleId}`

const permissionsOf = (roles: readonly AccessRole[]) =>
  new Set(roles.flatMap((role) => role.permissions))

/** Whether `by` gives every permission `role` does. A role with no permissions covers nothing
 *  and is covered by nothing, so two empty placeholders never read as duplicates. */
export function covers(by: AccessRole, role: AccessRole): boolean {
  if (by.id === role.id || role.permissions.length === 0) {
    return false
  }
  const given = new Set(by.permissions)
  return role.permissions.every((p) => given.has(p))
}

const isEveryone = (model: AccessModel, groupId: string) => model.everyone?.id === groupId

/** The roles a group's members have through everyone, which it doesn't hold itself. */
export function inheritedRoles(model: AccessModel, groupId: string): AccessRole[] {
  if (!model.everyone || isEveryone(model, groupId)) {
    return []
  }
  const own = new Set((model.held.get(groupId) ?? []).map((role) => role.id))
  return (model.held.get(model.everyone.id) ?? []).filter((role) => !own.has(role.id))
}

/** Why a role a group holds is redundant: its other roles that already give everything this one
 *  does, and whether everyone has it already. */
export interface Overlap {
  coveredBy: AccessRole[]
  everyone: boolean
}

export function overlapOf(model: AccessModel, groupId: string, role: AccessRole): Overlap {
  const own = (model.held.get(groupId) ?? []).filter((other) => other.id !== role.id)
  const everyoneRoles =
    model.everyone && !isEveryone(model, groupId) ? (model.held.get(model.everyone.id) ?? []) : []
  return {
    coveredBy: own.filter((other) => covers(other, role)),
    everyone: everyoneRoles.some((other) => other.id === role.id || covers(other, role)),
  }
}

/** What taking roles from a group does to its members. */
export interface Removal {
  /** The permissions they no longer have from any role, in the order the roles list them. */
  lost: string[]
  /** Roles still giving them some of what the removed roles gave: their own others, then
   *  everyone's. */
  keep: AccessRole[]
  keepThroughEveryone: AccessRole[]
}

/** What the group loses: the removed roles' permissions that no role it keeps, its own or
 *  everyone's, still gives. */
export function removalOf(
  model: AccessModel,
  groupId: string,
  roleIds: readonly string[],
): Removal {
  const removing = new Set(roleIds)
  const removed = (model.held.get(groupId) ?? []).filter((role) => removing.has(role.id))
  const keep = (model.held.get(groupId) ?? []).filter((role) => !removing.has(role.id))
  const throughEveryone = inheritedRoles(model, groupId)
  const still = permissionsOf([...keep, ...throughEveryone])
  const taken = permissionsOf(removed)
  const lost = [...taken].filter((p) => !still.has(p))
  // Each kept role's share of what was taken; one whose share another's holds adds nothing to
  // say, so "They keep Sudo" doesn't go on to name every smaller role Sudo already gives.
  const share = new Map(
    [...keep, ...throughEveryone].map((role) => [
      role.id,
      new Set(role.permissions.filter((p) => taken.has(p))),
    ]),
  )
  const worth = (role: AccessRole) => {
    const mine = share.get(role.id) ?? new Set()
    return (
      mine.size > 0 &&
      ![...share].some(
        ([id, theirs]) =>
          id !== role.id &&
          [...mine].every((p) => theirs.has(p)) &&
          (theirs.size > mine.size || id < role.id),
      )
    )
  }
  return { lost, keep: keep.filter(worth), keepThroughEveryone: throughEveryone.filter(worth) }
}

/** Granting each role to each group: the grants that add something, and the pairs held already. */
export function grantPlan(
  model: AccessModel,
  groupIds: readonly string[],
  roleIds: readonly string[],
): { grant: AccessGrant[]; held: AccessGrant[] } {
  const grant: AccessGrant[] = []
  const held: AccessGrant[] = []
  for (const groupId of groupIds) {
    const own = new Set((model.held.get(groupId) ?? []).map((role) => role.id))
    for (const roleId of roleIds) {
      ;(own.has(roleId) ? held : grant).push({ groupId, roleId })
    }
  }
  return { grant, held }
}

/** The change that takes `change` back. */
export function invert(change: AccessChange): AccessChange {
  return { grant: change.revoke, revoke: change.grant }
}

/** Warns, in a development build, about props that would make the drawer wrong in a way that
 *  is easy to miss: a duplicate id shows one of two, and an unknown id shows nothing. */
export function warnAboutMisuse(
  roles: readonly AccessRole[],
  groups: readonly AccessGroup[],
  grants: readonly AccessGrant[],
  permissions: readonly AccessPermission[] | undefined,
): void {
  if (!isDev()) {
    return
  }
  const warn = (message: string) => console.warn(`AccessDrawer: ${message}`)
  for (const id of duplicates(roles.map((role) => role.id))) {
    warn(`two roles share the id "${id}"; ids must be unique.`)
  }
  for (const id of duplicates(groups.map((group) => group.id))) {
    warn(`two groups share the id "${id}"; ids must be unique.`)
  }
  if (groups.filter((group) => group.kind === 'everyone').length > 1) {
    warn('more than one group is everyone; only the first counts.')
  }
  const roleIds = new Set(roles.map((role) => role.id))
  const groupIds = new Set(groups.map((group) => group.id))
  for (const grant of grants) {
    if (!roleIds.has(grant.roleId)) {
      warn(`a grant names the unknown role "${grant.roleId}"; it isn't shown.`)
    }
    if (!groupIds.has(grant.groupId)) {
      warn(`a grant names the unknown group "${grant.groupId}"; pass every granted group.`)
    }
  }
  for (const k of duplicates(grants.map(key))) {
    const [groupId, roleId] = k.split('\u0000')
    warn(`the grant of "${roleId}" to "${groupId}" is listed twice.`)
  }
  if (permissions) {
    const known = new Set(permissions.map((p) => p.id))
    for (const role of roles) {
      for (const p of role.permissions.filter((id) => !known.has(id))) {
        warn(`the role "${role.id}" names the unknown permission "${p}"; it reads as its id.`)
      }
    }
  }
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>()
  const repeated = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) {
      repeated.add(id)
    }
    seen.add(id)
  }
  return [...repeated]
}
