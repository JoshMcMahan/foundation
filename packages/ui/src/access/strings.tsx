// English defaults for the access drawer; a host translates them through UIProvider's `access`.
// Counts and lists arrive as numbers and arrays, so a translation applies its own plural rules
// and list conjunction rather than patching English ones.

import { type ReactNode, useMemo } from 'react'
import { type UIStrings, useStrings } from '../components/Provider'

const plural = new Intl.PluralRules('en')
const list = new Intl.ListFormat('en', { type: 'conjunction' })
/** Counts side by side, as a label lists them: "Everyone, 3 people, 7 groups". */
const units = new Intl.ListFormat('en', { type: 'unit', style: 'short' })

/** A count and its noun: "1 group", "1,024 groups". */
const countOf = (n: number, one: string, other: string) =>
  `${n.toLocaleString()} ${plural.select(n) === 'one' ? one : other}`
const and = (names: readonly string[]) => list.format(names)
// "research-team has", "research-team and contractors have".
const has = (names: readonly string[]) => (names.length === 1 ? 'has' : 'have')
const who = (people: number, groups: number, everyone = false) =>
  [
    everyone && 'Everyone',
    people > 0 && countOf(people, 'person', 'people'),
    groups > 0 && countOf(groups, 'group', 'groups'),
  ].filter((part): part is string => typeof part === 'string')

export const ACCESS_STRINGS = {
  title: 'Access',
  /** Under the title: the resource, and who has a role on it. */
  summary: (resource: string, people: number, groups: number, everyone: boolean) => {
    const parts = who(people, groups, everyone)
    return `${resource} · ${parts.length === 0 ? 'No access granted' : units.format(parts)}`
  },
  /** Names the switch between the two ways of listing who has access. */
  arrange: 'List access',
  byRole: 'By role',
  byPrincipal: 'By person or group',
  filter: 'Filter by role, person or group',
  grantAccess: 'Grant access',
  privileged: 'Privileged',
  loading: 'Loading access',
  /** Who holds a role: "1 person, 2 groups". */
  holders: (people: number, groups: number) => units.format(who(people, groups)),
  /** How many of a role's holders a filter left. */
  holdersShown: (shown: number, total: number) =>
    `${shown.toLocaleString()} of ${total.toLocaleString()}`,
  members: (n: number) => countOf(n, 'member', 'members'),
  people: (n: number) => countOf(n, 'person', 'people'),
  /** Everyone, where it is short: a tag or a picker row. */
  everyone: 'Everyone',
  /** Everyone, where it stands as a row of its own. */
  everyoneInOrganization: 'Everyone in your organization',
  everyoneJoinLater: 'Includes people who join later',
  owner: 'Owner',
  /** Under the owner section and row. */
  ownerDescription: 'All permissions, can’t be removed',
  /** Read with the badges a row folds away: "+2". */
  moreRoles: (n: number) => `+${n.toLocaleString()}`,
  moreRolesLabel: (roles: readonly string[]) => `Also ${and(roles)}`,
  /** Beside someone whose other role gives everything this one does. */
  coveredBy: (roles: readonly string[]) => `Included in ${and(roles)}`,
  /** Beside the owner, who has every role's permissions anyway. */
  ownerHasAll: 'Included in Owner',
  /** Beside someone who has this through everyone as well. */
  everyoneHasThisToo: 'Also via Everyone',
  /** Beside someone who has this through their groups, or an inherited role, as well. */
  throughToo: (from: readonly string[]) => `Also via ${and(from)}`,
  /** A role someone holds that another of their roles already gives. */
  redundant: (roles: readonly string[]) => `Redundant, included in ${and(roles)}`,
  redundantOwner: 'Redundant, included in Owner',
  /** A role someone has only because everyone does. */
  throughEveryone: 'Via Everyone',
  /** A role someone has through one of their groups, or an inherited role. */
  through: (from: string) => `Via ${from}`,
  /** A role granted somewhere else, which can't be removed here. */
  inheritedFrom: (from: string) => `Inherited from ${from}`,
  removeRole: (principal: string, role: string) => `Remove ${principal} from ${role}`,
  grantMoreRoles: 'Grant roles',
  removeAllAccess: 'Remove all access',
  removeTitle: (principal: string, roles: readonly string[]) =>
    `Remove ${principal} from ${and(roles)}?`,
  removeAllTitle: (principal: string) => `Remove all access for ${principal}?`,
  /** Heads the list of what is lost; `members` is undefined when a group's size isn't known. */
  losesIntro: (kind: 'user' | 'group' | 'everyone', members: number | undefined) =>
    kind === 'everyone'
      ? 'Permissions lost by people without other access'
      : kind === 'group' && members !== undefined
        ? `Permissions lost by ${countOf(members, 'member', 'members')}`
        : 'Permissions lost',
  /** After the list: what they keep, their own roles and those through their groups, inherited
   *  roles or everyone. Empty when they keep nothing. */
  keeps: (
    own: readonly string[],
    throughEveryone: readonly string[],
    through: readonly { from: string; roles: readonly string[] }[],
  ) => {
    const kept = [
      ...own,
      ...through.flatMap(({ from, roles }) => roles.map((role) => `${role} via ${from}`)),
      ...throughEveryone.map((role) => `${role} via Everyone`),
    ]
    return kept.length > 0 ? `Still has ${and(kept)}` : ''
  },
  /** When the roles they keep give everything the removed ones did. */
  losesNothing: (roles: readonly string[]) =>
    `No permissions lost. Still covered by ${and(roles)}.`,
  ownerLosesNothing: 'No permissions lost. Owners have all permissions.',
  confirmRemove: (roles: readonly string[]) =>
    roles.length === 1 ? `Remove ${roles[0]}` : 'Remove all access',
  removeFailed: (principal: string, roles: readonly string[]) =>
    `Couldn’t remove ${principal} from ${and(roles)}`,
  grantFailed: (principals: readonly string[], roles: readonly string[]) =>
    `Couldn’t grant ${and(roles)} to ${and(principals)}`,
  undoFailed: 'Couldn’t undo the change',
  /** Why a save failed, when the host gives no `errorMessage`. */
  failedReason: 'Something went wrong.',
  /** Under a failed save; `reason` is the host's `errorMessage`, or `failedReason`. */
  nothingChanged: (reason: string | undefined) =>
    reason ? `${reason.replace(/\.?$/, '.')} Nothing changed.` : 'Nothing changed.',
  /** The toast after a grant. */
  granted: (principals: readonly string[], roles: readonly string[]) =>
    `Granted ${and(roles)} to ${and(principals)}`,
  /** The toast after a removal. */
  removed: (principals: readonly string[], roles: readonly string[]) =>
    `Removed ${and(principals)} from ${and(roles)}`,
  undone: 'Change undone',
  readOnly: 'View only.',
  /** A note atop access set somewhere else, when the host gives no reason. */
  managedElsewhere: 'Access here is set somewhere else, so it can’t be changed here.',
  /** The note's link to where access is set, when the host doesn't name it. */
  manageAccess: 'Manage access',
  /** After `readOnly` when the host gives no reason. */
  readOnlyReason: 'Only people who manage access can make changes.',
  /** Names the switch between open to everyone and only those listed. */
  visibility: 'Who can see it',
  /** The switch's choice that limits it to the people and groups listed. */
  restrictedLabel: 'Only people with access',
  /** The toast after the switch saves; `choice` is the label now chosen. */
  visibilityChanged: (choice: string) => `Changed to ${choice}`,
  visibilityFailed: (choice: string) => `Couldn’t change to ${choice}`,
  /** Names the role picker on a row where each person or group holds one role. */
  roleFor: (principal: string) => `Role for ${principal}`,
  /** A row menu's submenu of roles. */
  roleMenu: 'Role',
  /** A row menu's action that takes every role the row holds here. */
  removeAccess: 'Remove access',
  /** The toast after a row's one role is swapped for another. */
  roleChanged: (principal: string, role: string) => `Changed ${principal} to ${role}`,
  roleChangeFailed: (principal: string, role: string) => `Couldn’t change ${principal} to ${role}`,
  /** Read with a rule's faces: the first few by name, and how many more. */
  ruleMembers: (names: readonly string[], more: number) =>
    more > 0
      ? `Includes ${and([...names, `${more.toLocaleString()} more`])}`
      : `Includes ${and(names)}`,
  emptyTitle: 'No access granted',
  emptyDescription: (resource: string) =>
    `Grant a role to a person or group to give them access to ${resource}.`,
  noMatches: 'No matches',
  clearFilter: 'Clear filter',

  // The grant view.
  back: 'Back to access',
  principalsLabel: 'People and groups',
  addPrincipal: 'Add people or groups',
  /** Under the people and groups field; a count is undefined when the host doesn't give it. */
  pickerHint: (people: number | undefined, groups: number | undefined, everyone: boolean) =>
    `Search ${and([
      people === undefined ? 'people' : countOf(people, 'person', 'people'),
      groups === undefined ? 'groups' : countOf(groups, 'group', 'groups'),
    ])}${everyone ? ', or choose Everyone' : ''}`,
  everyoneCoversGroups: 'Everyone includes all people and groups',
  organization: 'Organization',
  recent: 'Recent',
  peopleSection: 'People',
  groupsSection: 'Groups',
  /** On a row in the picker: the roles it holds here. */
  hasRoles: (roles: readonly string[]) => `has ${and(roles)}`,
  /** Read with a group's row: its size, where it comes from and its roles here. */
  groupSummary: (
    members: number | undefined,
    everyone: boolean,
    source: 'synced' | 'manual' | undefined,
    roles: readonly string[],
  ) =>
    [
      members !== undefined &&
        (everyone ? countOf(members, 'person', 'people') : countOf(members, 'member', 'members')),
      source === 'synced' && 'synced',
      roles.length > 0 ? `has ${and(roles)} here` : 'no roles here',
    ]
      .filter(Boolean)
      .join(', '),
  /** Read with a person's row: what tells them apart, and their roles here. */
  personSummary: (detail: string | undefined, owner: boolean, roles: readonly string[]) =>
    [detail, owner ? 'owner' : roles.length > 0 ? `has ${and(roles)} here` : 'no roles here']
      .filter(Boolean)
      .join(', '),
  rolesLabel: 'Roles',
  searchRoles: 'Search roles',
  /** On a role's row in the picker. */
  alreadyHave: (principals: readonly string[]) => `Already granted to ${and(principals)}`,
  alreadyCovered: (roles: readonly string[]) => `Included in ${and(roles)}`,
  everyoneHasIt: 'Already granted to Everyone',
  /** The footer's account of what pressing Grant does. */
  grantSummary: (principals: readonly string[], roles: readonly string[]): ReactNode => (
    <>
      <strong className="font-medium text-(--theme-app)">{and(roles)}</strong>
      {` for ${and(principals)}`}
    </>
  ),
  /** Why Grant can't be pressed: everyone picked has every role picked already. */
  nothingToGrant: (principals: readonly string[], roles: readonly string[]) =>
    `${and(principals)} already ${has(principals)} ${and(roles)}`,
  pickPrincipalsAndRoles: 'Choose people or groups and roles',
  pickPrincipals: 'Choose people or groups',
  pickRoles: 'Choose roles',
  grant: (roles: readonly string[]) =>
    roles.length === 0
      ? 'Grant'
      : roles.length === 1
        ? `Grant ${roles[0]}`
        : `Grant ${countOf(roles.length, 'role', 'roles')}`,
  grantToEveryone: 'Grant to everyone',
  everyoneWarningTitle: (roles: readonly string[], people: number | undefined) =>
    people === undefined
      ? `${and(roles)} for everyone`
      : `${and(roles)} for all ${countOf(people, 'person', 'people')}`,
  everyoneWarning: (resource: string) =>
    `Everyone in your organization gets access to ${resource}, including people who join later.`,
  confirmEveryoneTitle: (roles: readonly string[], people: number | undefined) =>
    people === undefined
      ? `Grant ${and(roles)} to everyone?`
      : `Grant ${and(roles)} to all ${countOf(people, 'person', 'people')}?`,

  // The picker's details pane.
  synced: 'Synced from identity provider',
  syncedShort: 'Synced',
  manual: 'Managed manually',
  wholeOrganization: 'Entire organization',
  joinLater: 'Includes people who join later',
  /** Heads the groups a person is in that hold a role here. */
  inGroups: 'Groups with access',
  /** The first few members by name, and how many more there are. */
  memberNames: (names: readonly string[], more: number) =>
    more > 0 ? and([...names, `${more.toLocaleString()} more`]) : and(names),
  moreMembers: (n: number) => `+${n.toLocaleString()}`,
  /** Heads the roles the highlighted one holds on this resource. */
  currentRoles: 'Current roles',
  noRolesHere: 'No roles',
  /** When a role being granted gives everything one already held does. */
  becomesRedundant: (granting: readonly string[], held: readonly string[]) =>
    `${and(held)} will be redundant, included in ${and(granting)}`,
  alreadyHas: (roles: readonly string[]) => `Already has ${and(roles)}`,
  everyoneReach: (roles: readonly string[], people: number | undefined) =>
    `Grants ${and(roles)} to ${people === undefined ? 'everyone' : `all ${countOf(people, 'person', 'people')}`}, including people who join later. Requires confirmation.`,
  updated: (ago: string) => `Membership updated ${ago}`,
  detailsFailed: 'Couldn’t load group details',
  loadingDetails: 'Loading group details',
  noHighlight: 'Highlight a person or group to see details',
}

/** The drawer's own text, which a host translates through UIProvider's `access`. */
export type AccessText = typeof ACCESS_STRINGS

/** The drawer's text with the shared words, such as Cancel and Retry, beside it. */
export type AccessStrings = AccessText & { common: UIStrings['common'] }

/** The access drawer's strings: the host's translations over the English defaults. */
export function useAccessStrings(): AccessStrings {
  const { access: overrides, common } = useStrings()
  return useMemo(() => ({ ...ACCESS_STRINGS, ...overrides, common }), [overrides, common])
}
