import {
  DEFAULT_PERMISSION_MODE,
  isNamedPermissionMode,
  type NamedPermissionMode,
  type PermissionMode,
  permissionModesUpTo,
} from '../../agent/permissions'
import { useChatConfig } from '../../core/config'
import Dropdown from '../../ui/Dropdown'

const LABEL_KEY: Record<
  NamedPermissionMode,
  'readOnly' | 'acceptEdits' | 'bypassPermissions' | 'plan'
> = {
  'read-only': 'readOnly',
  'accept-edits': 'acceptEdits',
  'bypass-permissions': 'bypassPermissions',
  plan: 'plan',
}

/** What the agent may do, as a toolbar chip: the choices stop at the machine's
 *  ceiling, and a mode set elsewhere (plan, or one past the ceiling) still
 *  shows by name. */
export default function PermissionPicker({
  mode,
  onPick,
  ceiling,
  disabled = false,
}: {
  mode: string | undefined
  onPick: (mode: PermissionMode) => void
  /** The machine's remoteMaxPermissionMode; unknown offers the daemon default. */
  ceiling: string | undefined
  disabled?: boolean
}) {
  const t = useChatConfig().strings.permissions
  const current = mode ?? DEFAULT_PERMISSION_MODE
  const named = isNamedPermissionMode(current) ? current : undefined
  const options = permissionModesUpTo(ceiling).map((m) => ({
    value: m,
    label: t[LABEL_KEY[m]],
    description: t[`${LABEL_KEY[m]}Hint`],
  }))
  return (
    <Dropdown
      options={options}
      value={current}
      onChange={(value) => onPick(value as PermissionMode)}
      disabled={disabled}
      variant="bare"
      ariaLabel={t.choose}
      {...(named ? { hint: t[`${LABEL_KEY[named]}Hint`] } : {})}
      {...(options.some((o) => o.value === current)
        ? {}
        : { valueLabel: named ? t[LABEL_KEY[named]] : current })}
      textBoxClassName="rounded-md px-1.5 py-0.5 text-[11px] theme-muted-text transition-colors hover:theme-muted-panel hover:theme-text"
      listClassName="w-64"
    />
  )
}
