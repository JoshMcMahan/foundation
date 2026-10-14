import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup as BaseToggleGroup } from '@base-ui/react/toggle-group'
import type { ReactNode } from 'react'
import { cx } from '../cx'
import { formatCount } from '../format'
import { buttonClasses } from './buttonClasses'
import { useStrings } from './Provider'

export interface ToggleGroupOption<T extends string> {
  value: T
  label: string
  /** Before the label, such as a `StatusDot` in the status's tone or a provider's logo. */
  icon?: ReactNode
  /** How many items the option matches, after the label. */
  count?: number | undefined
  disabled?: boolean | undefined
  testId?: string
}

export interface ToggleGroupProps<T extends string> {
  /** Names the group for assistive technology. Leave it out inside a
   *  `Field group`, whose legend names it. */
  label?: string | undefined
  options: readonly ToggleGroupOption<T>[]
  /** The pressed options. Empty filters nothing out. */
  value: readonly T[]
  /** Called with the pressed options in the order `options` lists them. */
  onValueChange: (value: T[]) => void
  /** Several options may be pressed at once; `false` allows one or none. */
  multiple?: boolean | undefined
  /** Leads with an "All" option, pressed while nothing else is, that clears
   *  the others. `{ count }` shows the total beside it. */
  all?: boolean | { count?: number | undefined } | undefined
  size?: 'sm' | 'md' | undefined
  disabled?: boolean | undefined
  testId?: string
}

// Stands in for "nothing pressed" so the All option takes part in the group's
// arrow-key focus; a NUL can't appear in a host's option values.
const ALL = '\u0000all'

/** Options that narrow a list, such as run statuses or job states, as a row of
 *  toggle buttons that wraps on a narrow screen. Pressing one adds it to the
 *  filter and pressing it again takes it out, so an empty filter shows
 *  everything; with `multiple={false}` pressing one replaces the last. Each
 *  option may carry an icon, such as a status dot, and a count.
 *
 *  Use `SegmentedControl` instead for a setting that always has exactly one
 *  value, such as a time range, what to group by, or which view of the same
 *  data to show. A filter that may be off, or takes several values, is a
 *  `ToggleGroup`. */
export function ToggleGroup<T extends string>({
  label,
  options,
  value,
  onValueChange,
  multiple = true,
  all = false,
  size = 'sm',
  disabled = false,
  testId,
}: ToggleGroupProps<T>) {
  const strings = useStrings()
  const allCount = typeof all === 'object' ? all.count : undefined
  const pressed: readonly string[] = all && value.length === 0 ? [ALL] : value
  return (
    <BaseToggleGroup<string>
      aria-label={label}
      data-testid={testId}
      className="flex flex-wrap items-center gap-1"
      multiple={multiple}
      disabled={disabled}
      value={pressed}
      onValueChange={(next) => {
        // Pressing All clears the rest; pressing anything else lifts All.
        if (next.includes(ALL) && !pressed.includes(ALL)) {
          onValueChange([])
          return
        }
        // Option order, not press order, so the same set always reads the same,
        // such as in a URL or a stored filter.
        onValueChange(
          options.filter((option) => next.includes(option.value)).map((option) => option.value),
        )
      }}
    >
      {all && <Chip value={ALL} label={strings.common.all} count={allCount} size={size} />}
      {options.map((option) => (
        <Chip key={option.value} {...option} size={size} />
      ))}
    </BaseToggleGroup>
  )
}

function Chip({
  value,
  label,
  icon,
  count,
  disabled,
  testId,
  size,
}: ToggleGroupOption<string> & { size: 'sm' | 'md' }) {
  return (
    <Toggle
      value={value}
      disabled={disabled}
      data-testid={testId}
      // The outline button's pressed border alone reads faintly across a row of
      // chips; the selection tint says which are on at a glance.
      className={cx(
        'group aria-pressed:bg-(--theme-accent-subtle)',
        buttonClasses({ variant: 'outline', size }),
      )}
    >
      {icon}
      {label}
      {count !== undefined && (
        <span className="tabular-nums text-(--theme-muted-text-color) group-aria-pressed:text-(--theme-app)">
          {formatCount(count)}
        </span>
      )}
    </Toggle>
  )
}
