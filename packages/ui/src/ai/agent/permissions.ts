// Plan is entered from the session itself, never asked for from outside it.
const REQUESTABLE_PERMISSION_MODES = ['read-only', 'accept-edits', 'bypass-permissions'] as const

// A session started from the terminal can be in a mode a menu does not offer;
// showing the default in its place would understate what the session may do.
export const NAMED_PERMISSION_MODES = [...REQUESTABLE_PERMISSION_MODES, 'plan'] as const

export type PermissionMode = (typeof REQUESTABLE_PERMISSION_MODES)[number]

export type NamedPermissionMode = (typeof NAMED_PERMISSION_MODES)[number]

export const DEFAULT_PERMISSION_MODE: PermissionMode = 'accept-edits'

const PERMISSION_RANK: Record<NamedPermissionMode, number> = {
  'read-only': 0,
  plan: 1,
  'accept-edits': 2,
  'bypass-permissions': 3,
}

export function isNamedPermissionMode(mode: string | undefined): mode is NamedPermissionMode {
  return NAMED_PERMISSION_MODES.some((m) => m === mode)
}

/** The daemon clamps a remote request to its owner's remoteMaxPermissionMode,
 *  so a menu offers only what that machine will honour. */
export function permissionModesUpTo(ceiling: string | undefined): PermissionMode[] {
  const max = isNamedPermissionMode(ceiling)
    ? PERMISSION_RANK[ceiling]
    : PERMISSION_RANK[DEFAULT_PERMISSION_MODE]
  return REQUESTABLE_PERMISSION_MODES.filter((m) => PERMISSION_RANK[m] <= max)
}

export function clampPermissionMode(
  mode: PermissionMode,
  ceiling: string | undefined,
): PermissionMode {
  const offered = permissionModesUpTo(ceiling)
  return offered.includes(mode) ? mode : (offered[offered.length - 1] ?? 'read-only')
}
