import type { TimeValue } from '../format'

/** A named set of permissions. Groups are granted roles, never permissions one by one. */
export interface AccessRole {
  id: string
  name: string
  /** What it lets someone do, in a sentence. */
  description?: string | undefined
  /** The permissions it gives. Two roles that share some are allowed, and only redundant: the
   *  drawer works out the overlap from these and says so as a hint. */
  permissions: readonly string[]
  /** Marks a role that reaches far, such as root on every node. It carries a tag, and granting
   *  it to everyone says so before asking to confirm. */
  highImpact?: boolean | undefined
}

/** A permission's name in words, for what a group loses when a role is taken away. */
export interface AccessPermission {
  id: string
  /** What it lets someone do, as a phrase that follows "will no longer be able to": "Sign in". */
  label: string
}

/** Who a role can be granted to. */
export interface AccessGroup {
  id: string
  name: string
  /** How many people are in it; for everyone, the organization's size. */
  memberCount?: number | undefined
  /** `everyone` is the whole organization, people who join later included. At most one group
   *  is; leave it out where a resource can't be granted to everyone. */
  kind?: 'everyone' | 'group' | undefined
}

/** A role held by a group. */
export interface AccessGrant {
  groupId: string
  roleId: string
}

/** What one change grants and takes away; neither list holds a grant that changes nothing. */
export interface AccessChange {
  grant: AccessGrant[]
  revoke: AccessGrant[]
}

/** A person, as a group's details show its first few members. */
export interface AccessMember {
  name: string
  avatarUrl?: string | undefined
}

/** More about a group than the list needs, loaded when it is highlighted in the group picker. */
export interface AccessGroupDetails {
  description?: string | undefined
  /** `synced` comes from an identity provider; `manual` is kept by hand. */
  source?: 'synced' | 'manual' | undefined
  /** The first few, in the order to show them. */
  members: readonly AccessMember[]
  memberCount: number
  /** When its membership last changed. */
  updatedAt?: TimeValue
}
