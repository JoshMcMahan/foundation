// A cluster's access, shared by the access drawer's stories and tests.

import type {
  AccessChange,
  AccessGrant,
  AccessGroup,
  AccessGroupDetails,
  AccessPermission,
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
    highImpact: true,
  },
  {
    id: 'sudo',
    name: 'Sudo',
    description: 'Run commands as root on cluster nodes.',
    permissions: ['cluster:root', 'cluster:login', 'cluster:view'],
    highImpact: true,
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
]

const NAMED: AccessGroup[] = [
  { id: 'everyone', name: 'Everyone', kind: 'everyone', memberCount: 214 },
  { id: 'g-ml-platform', name: 'ml-platform', memberCount: 12 },
  { id: 'g-analytics-admins', name: 'analytics-admins', memberCount: 4 },
  { id: 'g-bio-admins', name: 'bio-admins', memberCount: 5 },
  { id: 'g-research-team', name: 'research-team', memberCount: 38 },
  { id: 'g-contractors', name: 'contractors', memberCount: 3 },
  { id: 'g-data-eng', name: 'data-eng', memberCount: 24 },
  { id: 'g-bio-lab', name: 'bio-lab', memberCount: 17 },
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

/** The organization's 240 groups, the named ones first and then the rest by name. */
export const ALL_GROUPS: AccessGroup[] = [
  ...NAMED,
  ...TEAMS.flatMap((team, t) =>
    KINDS.flatMap((kind, k) =>
      [0, 1, 2].map(
        (n): AccessGroup => ({
          id: `g-${team}-${kind}-${n}`,
          name: n === 0 ? `${team}-${kind}` : `${team}-${kind}-${n + 1}`,
          memberCount: ((t * 7 + k * 5 + n * 3) % 40) + 2,
        }),
      ),
    ),
  ),
]
  .slice(0, 240)
  .sort((a, b) =>
    a.kind === 'everyone' ? -1 : b.kind === 'everyone' ? 1 : a.name.localeCompare(b.name),
  )

export const GRANTS: AccessGrant[] = [
  { groupId: 'g-ml-platform', roleId: 'admin' },
  { groupId: 'g-analytics-admins', roleId: 'admin' },
  { groupId: 'g-bio-admins', roleId: 'sudo' },
  { groupId: 'g-bio-admins', roleId: 'power' },
  { groupId: 'g-bio-admins', roleId: 'login' },
  { groupId: 'g-research-team', roleId: 'power' },
  { groupId: 'g-research-team', roleId: 'login' },
  { groupId: 'g-contractors', roleId: 'login' },
  { groupId: 'g-data-eng', roleId: 'login' },
  { groupId: 'everyone', roleId: 'view' },
]

export const RECENT = ['g-research-team', 'g-data-eng', 'g-contractors']

const PEOPLE = [
  'Ana Ruiz',
  'Tom Becker',
  'Priya Nair',
  'Jun Kim',
  'Maya Lopez',
  'Omar Haddad',
  'Lena Fischer',
  'Sam Okafor',
]

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
  const offset = groupId.length % PEOPLE.length
  const members = Array.from({ length: Math.min(count, 5) }, (_, i) => ({
    name: PEOPLE[(offset + i) % PEOPLE.length] ?? 'Someone',
  }))
  return {
    description: DESCRIPTIONS[groupId],
    source: group?.kind === 'everyone' ? undefined : groupId.length % 2 === 0 ? 'synced' : 'manual',
    members: groupId === 'g-data-eng' ? PEOPLE.slice(0, 5).map((name) => ({ name })) : members,
    memberCount: count,
    updatedAt: Date.now() - 2 * 60 * 60 * 1000,
  }
}

/** The groups a host passes up front: everyone, and every group that holds a role. */
export const GRANTED_GROUPS = ALL_GROUPS.filter(
  (group) => group.kind === 'everyone' || GRANTS.some((grant) => grant.groupId === group.id),
)

/** Applies a change to grants, as the host does once it is saved. */
export function applyChange(grants: readonly AccessGrant[], change: AccessChange): AccessGrant[] {
  const same = (a: AccessGrant) => (b: AccessGrant) =>
    a.groupId === b.groupId && a.roleId === b.roleId
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
