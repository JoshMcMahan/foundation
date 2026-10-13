import { Select } from '../../../components/Select'
import {
  DEFAULT_PERMISSION_MODE,
  isNamedPermissionMode,
  type NamedPermissionMode,
  type PermissionMode,
  permissionModesUpTo,
} from '../../agent/permissions'
import { useChatConfig } from '../../core/config'
import type { ChatStrings } from '../../strings'
import { smallChipClassName } from '../../ui/chip'

const LABEL_KEY = {
  'read-only': 'readOnly',
  'accept-edits': 'acceptEdits',
  auto: 'auto',
  'bypass-permissions': 'bypassPermissions',
  plan: 'plan',
} as const satisfies Record<NamedPermissionMode, keyof ChatStrings['permissions']>

/** What the agent may do, as a toolbar chip: the choices stop at the machine's
 *  ceiling, and a mode set elsewhere (plan, or one past the ceiling) still
 *  shows by name. */
export default function PermissionPicker({
  mode,
  onPick,
  ceiling,
  accepted,
  disabled = false,
}: {
  mode: string | undefined
  onPick: (mode: PermissionMode) => void
  /** The machine's remoteMaxPermissionMode; unknown offers the daemon default. */
  ceiling: string | undefined
  /** The machine's permissionModes; unknown offers what a machine that predates the list accepts. */
  accepted?: readonly string[] | undefined
  disabled?: boolean
}) {
  const t = useChatConfig().strings.permissions
  const current = mode ?? DEFAULT_PERMISSION_MODE
  const named = isNamedPermissionMode(current) ? current : undefined
  const items = permissionModesUpTo(ceiling, accepted).map((m) => ({
    value: m,
    label: t[LABEL_KEY[m]],
    description: t[`${LABEL_KEY[m]}Hint`],
  }))
  return (
    <Select<string>
      aria-label={t.choose}
      items={items}
      value={current}
      onValueChange={(value) => value && onPick(value as PermissionMode)}
      disabled={disabled}
      triggerTooltip={named ? t[`${LABEL_KEY[named]}Hint`] : undefined}
      trigger={
        <button type="button" className={smallChipClassName}>
          {named ? t[LABEL_KEY[named]] : current}
        </button>
      }
    />
  )
}
