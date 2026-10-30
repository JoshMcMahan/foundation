import { isDev } from '../dev'
import type {
  AccessChange,
  AccessGrant,
  AccessInheritedGrant,
  AccessPermission,
  AccessPrincipal,
  AccessRole,
} from './types'

/** A role someone has without holding it here themselves. */
export interface Holding {
  role: AccessRole
  /** The group, or everyone, it comes through; undefined when it is their own. */
  through?: AccessPrincipal | undefined
  /** Where it was granted, when it was granted above the resource. */
  from?: string | undefined
}

/** The grants indexed for the questions the drawer asks of them. */
export interface AccessModel {
  roles: readonly AccessRole[]
  /** The roles that can be granted here, in the roles' order. */
  grantable: readonly AccessRole[]
  roleById: ReadonlyMap<string, AccessRole>
  principalById: ReadonlyMap<string, AccessPrincipal>
  everyone: AccessPrincipal | undefined
  /** Holds every permission and can't be removed. */
  owner: AccessPrincipal | undefined
  /** The roles each principal holds itself, here, in the roles' order. */
  held: ReadonlyMap<string, readonly AccessRole[]>
  /** The principals holding each role here, in the order the host gave the principals. */
  holders: ReadonlyMap<string, readonly AccessPrincipal[]>
  /** The roles each principal holds through somewhere above the resource, in the roles' order. */
  inherited: ReadonlyMap<string, readonly { role: AccessRole; from: string }[]>
  /** The principals holding each role through somewhere above the resource. */
  inheritedHolders: ReadonlyMap<string, readonly { principal: AccessPrincipal; from: string }[]>
  permissionLabel: (id: string) => string
}

export interface ModelInput {
  roles: readonly AccessRole[]
  principals: readonly AccessPrincipal[]
  grants: readonly AccessGrant[]
  permissions?: readonly AccessPermission[] | undefined
  inherited?: readonly AccessInheritedGrant[] | undefined
  owner?: string | undefined
}

export function buildModel({
  roles,
  principals,
  grants,
  permissions = [],
  inherited = [],
  owner,
}: ModelInput): AccessModel {
  const roleById = new Map(roles.map((role) => [role.id, role]))
  const principalById = new Map(principals.map((principal) => [principal.id, principal]))
  const granted = new Set(grants.map(key))
  // The first place each inherited grant comes from, should the host name two.
  const inheritedFrom = new Map<string, string>()
  for (const grant of inherited) {
    if (!inheritedFrom.has(key(grant))) {
      inheritedFrom.set(key(grant), grant.from)
    }
  }
  const held = new Map<string, AccessRole[]>()
  const holders = new Map<string, AccessPrincipal[]>()
  const inheritedOf = new Map<string, { role: AccessRole; from: string }[]>()
  const inheritedHolders = new Map<string, { principal: AccessPrincipal; from: string }[]>()
  for (const principal of principals) {
    for (const role of roles) {
      const k = key({ principalId: principal.id, roleId: role.id })
      if (granted.has(k)) {
        held.set(principal.id, [...(held.get(principal.id) ?? []), role])
        holders.set(role.id, [...(holders.get(role.id) ?? []), principal])
      }
      const from = inheritedFrom.get(k)
      if (from !== undefined) {
        inheritedOf.set(principal.id, [...(inheritedOf.get(principal.id) ?? []), { role, from }])
        inheritedHolders.set(role.id, [
          ...(inheritedHolders.get(role.id) ?? []),
          { principal, from },
        ])
      }
    }
  }
  const labels = new Map(permissions.map((p) => [p.id, p.label]))
  return {
    roles,
    grantable: roles.filter((role) => role.grantable !== false),
    roleById,
    principalById,
    everyone: principals.find((principal) => principal.kind === 'everyone'),
    owner: owner === undefined ? undefined : principalById.get(owner),
    held,
    holders,
    inherited: inheritedOf,
    inheritedHolders,
    permissionLabel: (id) => labels.get(id) ?? id,
  }
}

export const key = (grant: AccessGrant) => `${grant.principalId}\u0000${grant.roleId}`

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

export const isOwner = (model: AccessModel, principalId: string) =>
  model.owner !== undefined && model.owner.id === principalId

/** Who has access in the order the list shows them: the owner, everyone, then the rest in the
 *  host's order. */
export function principalsWithAccess(model: AccessModel): AccessPrincipal[] {
  const rest = [...model.principalById.values()].filter(
    (principal) =>
      principal.id !== model.owner?.id &&
      principal.id !== model.everyone?.id &&
      (model.held.has(principal.id) || model.inherited.has(principal.id)),
  )
  const everyone =
    model.everyone &&
    model.everyone.id !== model.owner?.id &&
    (model.held.has(model.everyone.id) || model.inherited.has(model.everyone.id))
      ? [model.everyone]
      : []
  return [...(model.owner ? [model.owner] : []), ...everyone, ...rest]
}

/** The groups, and everyone, whose roles a principal has as well as its own. */
export function sourcesOf(model: AccessModel, principalId: string): AccessPrincipal[] {
  const principal = model.principalById.get(principalId)
  if (!principal || principal.kind === 'everyone') {
    return []
  }
  const groups =
    principal.kind === 'user'
      ? (principal.groupIds ?? [])
          .map((id) => model.principalById.get(id))
          .filter((group): group is AccessPrincipal => group?.kind === 'group')
      : []
  return model.everyone ? [...groups, model.everyone] : groups
}

/** Every role a principal has besides those it holds here itself: its own granted above the
 *  resource, then its groups', then everyone's. */
export function alsoHas(model: AccessModel, principalId: string): Holding[] {
  const own = (model.inherited.get(principalId) ?? []).map(({ role, from }) => ({ role, from }))
  const through = sourcesOf(model, principalId).flatMap((source) => [
    ...(model.held.get(source.id) ?? []).map((role) => ({ role, through: source })),
    ...(model.inherited.get(source.id) ?? []).map(({ role, from }) => ({
      role,
      through: source,
      from,
    })),
  ])
  return [...own, ...through]
}

/** The first holding of each role, so a role reached two ways is named once. */
export function firstOfEach(holdings: readonly Holding[]): Holding[] {
  const seen = new Set<string>()
  return holdings.filter((holding) => {
    if (seen.has(holding.role.id)) {
      return false
    }
    seen.add(holding.role.id)
    return true
  })
}

/** Why a role a principal holds is redundant: it owns the resource, its other roles here give
 *  everything this one does, or it has this one, or one that covers it, somewhere else. */
export interface Overlap {
  owner: boolean
  coveredBy: AccessRole[]
  elsewhere: Holding[]
}

export function overlapOf(model: AccessModel, principalId: string, role: AccessRole): Overlap {
  const own = (model.held.get(principalId) ?? []).filter((other) => other.id !== role.id)
  return {
    owner: isOwner(model, principalId),
    coveredBy: own.filter((other) => covers(other, role)),
    elsewhere: alsoHas(model, principalId).filter(
      (holding) => holding.role.id === role.id || covers(holding.role, role),
    ),
  }
}

/** What taking roles from a principal does to whoever it stands for. */
export interface Removal {
  /** The permissions no longer given by any role they keep, in the order the roles list them. */
  lost: string[]
  /** Its own roles here still giving some of what the removed roles gave. */
  keep: AccessRole[]
  /** Roles it has elsewhere still giving some of it: granted above, or through its groups or
   *  everyone. */
  keepElsewhere: Holding[]
  /** The owner loses nothing, as owning gives every permission. */
  owner: boolean
}

/** What the principal loses: the removed roles' permissions that nothing it keeps still gives. */
export function removalOf(
  model: AccessModel,
  principalId: string,
  roleIds: readonly string[],
): Removal {
  const removing = new Set(roleIds)
  const own = model.held.get(principalId) ?? []
  const removed = own.filter((role) => removing.has(role.id))
  const keep = own.filter((role) => !removing.has(role.id))
  const elsewhere = firstOfEach(alsoHas(model, principalId)).filter(
    (holding) => !keep.some((role) => role.id === holding.role.id),
  )
  const owner = isOwner(model, principalId)
  const still = permissionsOf([...keep, ...elsewhere.map((holding) => holding.role)])
  const taken = permissionsOf(removed)
  const lost = owner ? [] : [...taken].filter((p) => !still.has(p))
  // Each kept role's share of what was taken; one whose share another's holds adds nothing to
  // say, so "They keep Sudo" doesn't go on to name every smaller role Sudo already gives.
  const share = new Map(
    [...keep, ...elsewhere.map((holding) => holding.role)].map((role) => [
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
  return {
    lost,
    keep: keep.filter(worth),
    keepElsewhere: elsewhere.filter((holding) => worth(holding.role)),
    owner,
  }
}

/** Granting each role to each principal: the grants that add something, and the pairs held
 *  already. The owner holds every role already. */
export function grantPlan(
  model: AccessModel,
  principalIds: readonly string[],
  roleIds: readonly string[],
): { grant: AccessGrant[]; held: AccessGrant[] } {
  const grant: AccessGrant[] = []
  const held: AccessGrant[] = []
  for (const principalId of principalIds) {
    const own = new Set((model.held.get(principalId) ?? []).map((role) => role.id))
    const owner = isOwner(model, principalId)
    for (const roleId of roleIds) {
      ;(owner || own.has(roleId) ? held : grant).push({ principalId, roleId })
    }
  }
  return { grant, held }
}

/** What granting takes from others: each role held by one at a time, from whoever holds it
 *  and isn't getting it. */
export function replacedBy(model: AccessModel, grants: readonly AccessGrant[]): AccessGrant[] {
  const getting = new Set(grants.map(key))
  return [...new Set(grants.map((grant) => grant.roleId))].flatMap((roleId) =>
    model.roleById.get(roleId)?.singleHolder
      ? (model.holders.get(roleId) ?? [])
          .map((holder) => ({ principalId: holder.id, roleId }))
          .filter((held) => !getting.has(key(held)))
      : [],
  )
}

/** The change that takes `change` back. */
export function invert(change: AccessChange): AccessChange {
  return { grant: change.revoke, revoke: change.grant }
}

/** Warns, in a development build, about props that would make the drawer wrong in a way that
 *  is easy to miss: a duplicate id shows one of two, and an unknown id shows nothing. */
export function warnAboutMisuse({
  roles,
  principals,
  grants,
  permissions,
  inherited = [],
  owner,
}: ModelInput): void {
  if (!isDev()) {
    return
  }
  const warn = (message: string) => console.warn(`AccessDrawer: ${message}`)
  for (const id of duplicates(roles.map((role) => role.id))) {
    warn(`two roles share the id "${id}"; ids must be unique.`)
  }
  for (const id of duplicates(principals.map((principal) => principal.id))) {
    warn(`two principals share the id "${id}"; ids must be unique.`)
  }
  if (principals.filter((principal) => principal.kind === 'everyone').length > 1) {
    warn('more than one principal is everyone; only the first counts.')
  }
  const roleIds = new Set(roles.map((role) => role.id))
  const principalIds = new Set(principals.map((principal) => principal.id))
  if (owner !== undefined && !principalIds.has(owner)) {
    warn(`the owner "${owner}" isn't among the principals; pass the owner too.`)
  }
  for (const [kind, list] of [
    ['grant', grants],
    ['inherited grant', inherited],
  ] as const) {
    for (const grant of list) {
      if (!roleIds.has(grant.roleId)) {
        warn(`a ${kind} names the unknown role "${grant.roleId}"; it isn't shown.`)
      }
      if (!principalIds.has(grant.principalId)) {
        warn(
          `a ${kind} names the unknown principal "${grant.principalId}"; pass everyone who holds a role.`,
        )
      }
    }
  }
  for (const k of duplicates(grants.map(key))) {
    const [principalId, roleId] = k.split('\u0000')
    warn(`the grant of "${roleId}" to "${principalId}" is listed twice.`)
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
