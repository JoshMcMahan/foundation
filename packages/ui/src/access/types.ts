import type { ReactNode } from 'react'
import type { TimeValue } from '../format'

/** A named set of permissions. People and groups are granted roles, never permissions one by
 *  one. */
export interface AccessRole {
  id: string
  name: string
  /** What it lets someone do, in a sentence. */
  description?: string | undefined
  /** The permissions it gives. Two roles that share some are allowed, and only redundant: the
   *  drawer works out the overlap from these and says so as a hint. */
  permissions: readonly string[]
  /** Marks a role with administrative or root-level control. The role picker labels it, and
   *  granting it to everyone confirms with a destructive button. */
  privileged?: boolean | undefined
  /** False for a role held here only through somewhere else, such as an organization's
   *  administrator role: it shows where someone holds it, and isn't offered to grant. */
  grantable?: boolean | undefined
}

/** A permission's name in words, for what someone loses when a role is taken away. */
export interface AccessPermission {
  id: string
  /** What it lets someone do, as a phrase that follows "will no longer be able to": "Sign in". */
  label: string
}

/** Who a role can be granted to: a person, a group, or everyone. */
export interface AccessPrincipal {
  id: string
  name: string
  /** `everyone` is the whole organization, people who join later included. At most one
   *  principal is; leave it out where a resource can't be granted to everyone. */
  kind: 'user' | 'group' | 'everyone'
  /** For a group, how many people are in it; for everyone, the organization's size. */
  memberCount?: number | undefined
  /** For a person, their picture. Until it loads, their initials show. */
  avatarUrl?: string | undefined
  /** For a person, what tells them apart from someone with the same name: an email address. */
  detail?: string | undefined
  /** For a person, the groups they are in. Only groups holding a role here matter, so a host
   *  may pass just those; with them, taking a role from the person says what they keep through
   *  their groups. */
  groupIds?: readonly string[] | undefined
}

/** A role held by a person or group. */
export interface AccessGrant {
  principalId: string
  roleId: string
}

/** A role held through something the resource is part of, such as its organization. It shows,
 *  and counts toward what someone keeps, but changes only where it was granted. */
export interface AccessInheritedGrant extends AccessGrant {
  /** Where it was granted, as a phrase that follows "through": "the organization". */
  from: string
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

/** More about a group than the list needs, loaded when it is highlighted in the picker. */
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

/** A reason someone has access that no grant here changes, such as "Workspace admins always
 *  have access". It shows, locked, ahead of the grants. */
export interface AccessRule {
  id: string
  /** In the leading column, in place of a section's chevron. */
  icon?: ReactNode
  title: string
  /** A line under the title, such as who sets it. */
  detail?: string | undefined
  /** A few of the people it covers, shown as overlapping faces: four, then how many more. */
  people?: readonly AccessMember[] | undefined
  /** The role it gives, when it gives everyone it covers the same one. */
  roleId?: string | undefined
}

/** Whether a resource is open to everyone who can see what it is in, or only to those listed. */
export interface AccessVisibility {
  restricted: boolean
  /** Saves the switch, as `onChange` saves a grant: until the promise settles the switch shows
   *  it is saving, and when it rejects the panel says nothing changed and offers to retry. */
  // biome-ignore lint/suspicious/noConfusingVoidType: accepts sync and async handlers
  onChange: (restricted: boolean) => void | Promise<unknown>
  /** The open choice, which names what it is open to: "Everyone in the workspace". */
  openLabel: string
  /** The restricted choice; defaults to the strings' "Only people with access". */
  restrictedLabel?: string | undefined
}
