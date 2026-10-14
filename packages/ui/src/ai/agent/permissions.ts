// Plan is entered from the session itself, never asked for from outside it.
const REQUESTABLE_PERMISSION_MODES = [
  'read-only',
  'accept-edits',
  'auto',
  'bypass-permissions',
] as const

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
  auto: 3,
  'bypass-permissions': 4,
}

export function isNamedPermissionMode(mode: string | undefined): mode is NamedPermissionMode {
  return NAMED_PERMISSION_MODES.some((m) => m === mode)
}

/** What a machine that does not list its modes accepts: it predates auto. */
const LEGACY_PERMISSION_MODES: readonly string[] = [
  'read-only',
  'accept-edits',
  'bypass-permissions',
  'plan',
]

/** The daemon clamps a remote request to its owner's remoteMaxPermissionMode
 *  and refuses a mode it does not know, so a menu offers only what that
 *  machine will honor. */
export function permissionModesUpTo(
  ceiling: string | undefined,
  accepted: readonly string[] | undefined = undefined,
): PermissionMode[] {
  const max = isNamedPermissionMode(ceiling)
    ? PERMISSION_RANK[ceiling]
    : PERMISSION_RANK[DEFAULT_PERMISSION_MODE]
  const known = accepted?.length ? accepted : LEGACY_PERMISSION_MODES
  return REQUESTABLE_PERMISSION_MODES.filter((m) => PERMISSION_RANK[m] <= max && known.includes(m))
}

export function clampPermissionMode(
  mode: PermissionMode,
  ceiling: string | undefined,
  accepted: readonly string[] | undefined = undefined,
): PermissionMode {
  const offered = permissionModesUpTo(ceiling, accepted)
  return offered.includes(mode) ? mode : (offered[offered.length - 1] ?? 'read-only')
}
