// A cluster's access, shared by the access drawer's stories and tests.

import type {
  AccessChange,
  AccessGrant,
  AccessGroupDetails,
  AccessInheritedGrant,
  AccessPermission,
  AccessPrincipal,
  AccessRole,
} from '../access/types'

export const RESOURCE = 'gpu-cluster-east'

export const PERMISSIONS: AccessPermission[] = [
  { id: 'access:manage', label: 'Change who has access' },
  { id: 'cluster:root', label: 'Run commands as root' },
  { id: 'cluster:power', label: 'Start and stop the cluster' },
  { id: 'cluster:login', label: 'Sign in' },
  { id: 'cluster:view', label: 'See the cluster' },
]

export const ROLES: AccessRole[] = [
  {
    id: 'admin',
    name: 'Admin',
    description: 'Full control, including who has access.',
    permissions: [
      'access:manage',
      'cluster:root',
      'cluster:power',
      'cluster:login',
      'cluster:view',
    ],
    privileged: true,
  },
  {
    id: 'sudo',
    name: 'Sudo',
    description: 'Run commands as root on cluster nodes.',
    permissions: ['cluster:root', 'cluster:login', 'cluster:view'],
    privileged: true,
  },
  {
    id: 'power',
    name: 'Start and stop',
    description: 'Start the cluster, stop it and change its size.',
    permissions: ['cluster:power', 'cluster:view'],
  },
  {
    id: 'login',
    name: 'Login',
    description: 'Sign in to the cluster over SSH and in the browser.',
    permissions: ['cluster:login', 'cluster:view'],
  },
  {
    id: 'view',
    name: 'View',
    description: 'See the cluster, its nodes and its usage.',
    permissions: ['cluster:view'],
  },
  {
    id: 'org-admin',
    name: 'Organization admin',
    description: 'Administers everything in the organization.',
    permissions: [
      'access:manage',
      'cluster:root',
      'cluster:power',
      'cluster:login',
      'cluster:view',
    ],
    privileged: true,
    grantable: false,
  },
]

const NAMED: AccessPrincipal[] = [
  { id: 'everyone', name: 'Everyone', kind: 'everyone', memberCount: 214 },
  { id: 'g-ml-platform', name: 'ml-platform', kind: 'group', memberCount: 12 },
  { id: 'g-analytics-admins', name: 'analytics-admins', kind: 'group', memberCount: 4 },
  { id: 'g-bio-admins', name: 'bio-admins', kind: 'group', memberCount: 5 },
  { id: 'g-research-team', name: 'research-team', kind: 'group', memberCount: 38 },
  { id: 'g-contractors', name: 'contractors', kind: 'group', memberCount: 3 },
  { id: 'g-data-eng', name: 'data-eng', kind: 'group', memberCount: 24 },
  { id: 'g-bio-lab', name: 'bio-lab', kind: 'group', memberCount: 17 },
  { id: 'g-org-admins', name: 'org-admins', kind: 'group', memberCount: 3 },
]

const TEAMS = [
  'genomics',
  'climate',
  'finance',
  'imaging',
  'robotics',
  'physics',
  'chem',
  'vision',
  'speech',
  'ops',
]
const KINDS = ['lab', 'users', 'admins', 'readers', 'interns', 'oncall', 'reviewers', 'leads']

/** The organization's 240 groups, everyone and the named ones first, then the rest by name. */
export const ALL_GROUPS: AccessPrincipal[] = [
  ...NAMED,
  ...TEAMS.flatMap((team, t) =>
    KINDS.flatMap((kind, k) =>
      [0, 1, 2].map(
        (n): AccessPrincipal => ({
          id: `g-${team}-${kind}-${n}`,
          name: n === 0 ? `${team}-${kind}` : `${team}-${kind}-${n + 1}`,
          kind: 'group',
          memberCount: ((t * 7 + k * 5 + n * 3) % 40) + 2,
        }),
      ),
    ),
  ),
]
  .slice(0, 241)
  .sort((a, b) =>
    a.kind === 'everyone' ? -1 : b.kind === 'everyone' ? 1 : a.name.localeCompare(b.name),
  )

const NAMES = [
  'Ana Ruiz',
  'Tom Becker',
  'Priya Nair',
  'Jun Kim',
  'Maya Lopez',
  'Omar Haddad',
  'Lena Fischer',
  'Sam Okafor',
]

const person = (id: string, name: string, groupIds: string[]): AccessPrincipal => ({
  id,
  name,
  kind: 'user',
  detail: `${name.toLowerCase().replace(' ', '.')}@example.com`,
  groupIds,
})

/** People in the organization, and the groups among the named ones they are in. */
export const PEOPLE: AccessPrincipal[] = [
  person('u-maya', 'Maya Lopez', ['g-ml-platform']),
  person('u-tom', 'Tom Becker', ['g-research-team']),
  person('u-priya', 'Priya Nair', ['g-data-eng']),
  person('u-jun', 'Jun Kim', []),
  person('u-ana', 'Ana Ruiz', ['g-research-team', 'g-data-eng']),
  person('u-omar', 'Omar Haddad', ['g-contractors']),
  person('u-lena', 'Lena Fischer', ['g-bio-admins']),
  person('u-sam', 'Sam Okafor', []),
]

/** Everyone a grant can go to: people, then groups. */
export const ALL_PRINCIPALS: AccessPrincipal[] = [...PEOPLE, ...ALL_GROUPS]

/** Owns the cluster. */
export const OWNER = 'u-maya'

export const GRANTS: AccessGrant[] = [
  { principalId: 'g-ml-platform', roleId: 'admin' },
  { principalId: 'g-analytics-admins', roleId: 'admin' },
  { principalId: 'g-bio-admins', roleId: 'sudo' },
  { principalId: 'g-bio-admins', roleId: 'power' },
  { principalId: 'g-bio-admins', roleId: 'login' },
  { principalId: 'g-research-team', roleId: 'power' },
  { principalId: 'g-research-team', roleId: 'login' },
  { principalId: 'g-contractors', roleId: 'login' },
  { principalId: 'g-data-eng', roleId: 'login' },
  { principalId: 'everyone', roleId: 'view' },
  { principalId: 'u-tom', roleId: 'sudo' },
  { principalId: 'u-priya', roleId: 'login' },
]

/** Granted to the organization, so it shows here locked. */
export const INHERITED: AccessInheritedGrant[] = [
  { principalId: 'g-org-admins', roleId: 'org-admin', from: 'the organization' },
]

export const RECENT = ['g-research-team', 'g-data-eng', 'g-contractors']

const DESCRIPTIONS: Record<string, string> = {
  'g-data-eng': 'Data engineering: pipelines and the warehouse.',
  'g-research-team': 'Researchers running training jobs.',
  'g-contractors': 'Outside contributors, on fixed-term contracts.',
  'g-bio-admins': 'Administrators of the biology clusters.',
}

/** What a host's group lookup would answer, from the fixtures. */
export function detailsOf(groupId: string): AccessGroupDetails {
  const group = ALL_GROUPS.find((g) => g.id === groupId)
  const count = group?.memberCount ?? 0
  const offset = groupId.length % NAMES.length
  const members = Array.from({ length: Math.min(count, 5) }, (_, i) => ({
    name: NAMES[(offset + i) % NAMES.length] ?? 'Someone',
  }))
  return {
    description: DESCRIPTIONS[groupId],
    source: group?.kind === 'everyone' ? undefined : groupId.length % 2 === 0 ? 'synced' : 'manual',
    members: groupId === 'g-data-eng' ? NAMES.slice(0, 5).map((name) => ({ name })) : members,
    memberCount: count,
    updatedAt: Date.now() - 2 * 60 * 60 * 1000,
  }
}

/** The principals a host that searches passes up front: everyone, the owner, everyone who
 *  holds a role, and the groups those people are in. */
export function principalsFor(grants: readonly AccessGrant[]): AccessPrincipal[] {
  const holding = new Set([
    OWNER,
    ...grants.map((grant) => grant.principalId),
    ...INHERITED.map((grant) => grant.principalId),
  ])
  const people = PEOPLE.filter((person) => holding.has(person.id))
  const theirGroups = new Set(people.flatMap((person) => person.groupIds ?? []))
  return ALL_PRINCIPALS.filter(
    (principal) =>
      principal.kind === 'everyone' || holding.has(principal.id) || theirGroups.has(principal.id),
  )
}

/** Applies a change to grants, as the host does once it is saved. */
export function applyChange(grants: readonly AccessGrant[], change: AccessChange): AccessGrant[] {
  const same = (a: AccessGrant) => (b: AccessGrant) =>
    a.principalId === b.principalId && a.roleId === b.roleId
  return [
    ...grants.filter((grant) => !change.revoke.some(same(grant))),
    ...change.grant.filter((grant) => !grants.some(same(grant))),
  ]
}

/** Resolves after `ms`, or rejects once `signal` aborts. */
export function wait(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })
}
