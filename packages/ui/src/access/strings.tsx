// English defaults for the access drawer; a host translates them through UIProvider's `access`.
// Counts and lists arrive as numbers and arrays, so a translation applies its own plural rules
// and list conjunction rather than patching English ones.

import { type ReactNode, useMemo } from 'react'
import { type UIStrings, useStrings } from '../components/Provider'

const plural = new Intl.PluralRules('en')
const list = new Intl.ListFormat('en', { type: 'conjunction' })

/** A count and its noun: "1 group", "1,024 groups". */
const countOf = (n: number, one: string, other: string) =>
  `${n.toLocaleString()} ${plural.select(n) === 'one' ? one : other}`
const and = (names: readonly string[]) => list.format(names)
// "research-team has", "research-team and contractors have".
const has = (names: readonly string[]) => (names.length === 1 ? 'has' : 'have')

export const ACCESS_STRINGS = {
  title: 'Access',
  /** Under the title: the resource, and how many groups have a role on it. */
  summary: (resource: string, groups: number, everyone: boolean) =>
    everyone
      ? groups === 0
        ? `${resource} · Everyone has access`
        : `${resource} · Everyone and ${countOf(groups, 'group have access', 'groups have access')}`
      : groups === 0
        ? `${resource} · No groups have access`
        : `${resource} · ${countOf(groups, 'group has access', 'groups have access')}`,
  /** Names the switch between the two ways of listing who has access. */
  arrange: 'List access',
  byRole: 'By role',
  byGroup: 'By group',
  filter: 'Filter by role or group',
  grantAccess: 'Grant access',
  highImpact: 'High impact',
  loading: 'Loading who has access',
  groups: (n: number) => countOf(n, 'group', 'groups'),
  /** How many of a role's groups a filter left. */
  groupsShown: (shown: number, total: number) =>
    `${shown.toLocaleString()} of ${countOf(total, 'group', 'groups')}`,
  members: (n: number) => countOf(n, 'member', 'members'),
  people: (n: number) => countOf(n, 'person', 'people'),
  /** Everyone, where it is short: a tag or a picker row. */
  everyone: 'Everyone',
  /** Everyone, where it stands as a row of its own. */
  everyoneInOrganization: 'Everyone in your organization',
  everyoneJoinLater: 'Including people who join later',
  /** Read with the badges a group row folds away: "+2". */
  moreRoles: (n: number) => `+${n.toLocaleString()}`,
  moreRolesLabel: (roles: readonly string[]) => `Also ${and(roles)}`,
  /** Beside a group whose other role gives everything this one does. */
  coveredBy: (roles: readonly string[]) => `${and(roles)} covers this too`,
  /** Beside a group that has this through everyone as well. */
  everyoneHasThisToo: 'Everyone has this too',
  /** A role a group holds that another of its roles already gives. */
  redundant: (roles: readonly string[]) => `Redundant: ${and(roles)} already covers this.`,
  /** A role a group has only because everyone does. */
  throughEveryone: 'Everyone in your organization has it',
  removeRole: (group: string, role: string) => `Remove ${group} from ${role}`,
  grantMoreRoles: 'Grant more roles',
  removeAllAccess: 'Remove all access',
  removeTitle: (group: string, roles: readonly string[]) => `Remove ${group} from ${and(roles)}?`,
  removeAllTitle: (group: string) => `Remove all of ${group}’s access?`,
  /** Leads the list of what a group loses; `members` is undefined when the count isn't known. */
  losesIntro: (members: number | undefined, everyone: boolean) =>
    everyone
      ? 'People who have it only through everyone will no longer be able to:'
      : members === undefined
        ? 'Its members will no longer be able to:'
        : `Its ${countOf(members, 'member', 'members')} will no longer be able to:`,
  /** After the list: why these are lost, and what they keep. */
  keeps: (own: readonly string[], throughEveryone: readonly string[]) =>
    [
      'No other role of theirs gives these.',
      own.length > 0 && `They keep ${and(own)}.`,
      throughEveryone.length > 0 && `They keep ${and(throughEveryone)}, which everyone has.`,
    ]
      .filter(Boolean)
      .join(' '),
  /** When the roles it keeps give everything the removed ones did. */
  losesNothing: (own: readonly string[], throughEveryone: readonly string[]) =>
    `They lose nothing: ${and([...own, ...throughEveryone])} still ${own.length + throughEveryone.length === 1 ? 'gives' : 'give'} them all of it.`,
  confirmRemove: (roles: readonly string[]) =>
    roles.length === 1 ? `Remove ${roles[0]}` : 'Remove all access',
  removeFailed: (group: string, roles: readonly string[]) =>
    `Couldn’t remove ${group} from ${and(roles)}`,
  grantFailed: (groups: readonly string[], roles: readonly string[]) =>
    `Couldn’t grant ${and(roles)} to ${and(groups)}`,
  undoFailed: 'Couldn’t undo the change',
  /** Under a failed save; `reason` is the host's error message, when it gave one. */
  nothingChanged: (reason: string | undefined) =>
    reason ? `${reason.replace(/\.?$/, '.')} Nothing changed.` : 'Nothing changed.',
  /** The toast after a grant. */
  granted: (groups: readonly string[], roles: readonly string[]) =>
    `Gave ${and(groups)} ${and(roles)}.`,
  /** The toast after a removal. */
  removed: (groups: readonly string[], roles: readonly string[]) =>
    `Removed ${and(groups)} from ${and(roles)}.`,
  undone: 'Change undone.',
  readOnly: 'You can see who has access.',
  /** After `readOnly` when the host gives no reason. */
  readOnlyReason: 'Only people who manage access here can change it.',
  emptyTitle: 'No groups have access yet',
  emptyDescription: (resource: string) =>
    `Give a group a role so its members can see, use or manage ${resource}.`,
  noMatches: 'No roles or groups match',
  clearFilter: 'Clear filter',

  // The grant view.
  back: 'Back to who has access',
  groupsLabel: 'Groups',
  addGroup: 'Add a group',
  /** Under the groups field; `count` is undefined when the host doesn't say how many there are. */
  groupsHint: (count: number | undefined, everyone: boolean) =>
    count === undefined
      ? everyone
        ? 'Search groups, or pick Everyone in your organization.'
        : 'Search groups.'
      : `Search ${countOf(count, 'group', 'groups')}${everyone ? ', or pick Everyone in your organization' : ''}.`,
  everyoneCoversGroups: 'Everyone covers every group, so there’s no need to add others.',
  organization: 'Organization',
  recent: 'Recent',
  allGroups: 'All groups',
  /** On a group's row in the picker: the roles it holds here. */
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
  rolesLabel: 'Roles',
  searchRoles: 'Search roles',
  /** On a role's row in the picker. */
  alreadyHave: (groups: readonly string[]) => `${and(groups)} already ${has(groups)} it.`,
  alreadyCovered: (roles: readonly string[]) => `${and(roles)} already covers this.`,
  everyoneHasIt: 'Everyone already has it.',
  /** The footer's account of what pressing Grant does. */
  grantSummary: (groups: readonly string[], roles: readonly string[]): ReactNode => (
    <>
      <strong className="font-medium text-(--theme-app)">{and(groups)}</strong>{' '}
      {groups.length === 1 ? 'gets' : 'get'} {and(roles)}.
    </>
  ),
  /** Why Grant can't be pressed: every group has every role already. */
  nothingToGrant: (groups: readonly string[], roles: readonly string[]) =>
    `${and(groups)} already ${has(groups)} ${and(roles)}, so there’s nothing to grant.`,
  pickGroupsAndRoles: 'Pick the groups and the roles to grant.',
  pickGroups: 'Pick a group to grant to.',
  pickRoles: 'Pick a role to grant.',
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
    `Everyone in your organization, and everyone who joins later, will have it on ${resource}.`,
  confirmEveryoneTitle: (roles: readonly string[], people: number | undefined) =>
    people === undefined
      ? `Grant ${and(roles)} to everyone?`
      : `Grant ${and(roles)} to all ${countOf(people, 'person', 'people')}?`,

  // The group picker's details pane.
  synced: 'Synced from your identity provider',
  syncedShort: 'Synced',
  manual: 'Members added by hand',
  wholeOrganization: 'Your whole organization',
  joinLater: 'And anyone who joins later gets it automatically.',
  /** The first few members by name, and how many more there are. */
  memberNames: (names: readonly string[], more: number) =>
    more > 0 ? and([...names, `${more.toLocaleString()} more`]) : and(names),
  moreMembers: (n: number) => `+${n.toLocaleString()}`,
  onResource: (resource: string) => `On ${resource}`,
  noRolesHere: 'No roles here yet.',
  /** When a role being granted gives everything one the group holds does. */
  becomesRedundant: (granting: readonly string[], held: readonly string[]) =>
    `${and(granting)} also ${granting.length === 1 ? 'gives' : 'give'} them ${and(held)}, so ${and(held)} becomes redundant. Nothing is removed.`,
  alreadyHas: (roles: readonly string[]) => `Already has ${and(roles)}.`,
  everyoneReach: (roles: readonly string[], people: number | undefined) =>
    `${and(roles)} for everyone reaches ${people === undefined ? 'every person' : `all ${countOf(people, 'person', 'people')}`} in your organization, and anyone who joins later. You’ll be asked to confirm.`,
  updated: (ago: string) => `Membership updated ${ago}`,
  detailsFailed: 'Couldn’t load this group’s details.',
  loadingDetails: 'Loading the group’s details',
  noHighlight: 'Highlight a group to see who is in it.',
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
