import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup as BaseToggleGroup } from '@base-ui/react/toggle-group'
import type { ReactNode } from 'react'
import { cx } from '../cx'
import { formatCount } from '../format'
import { CheckIcon } from '../icons'
import { buttonClasses } from './buttonClasses'
import { useLocale, useStrings } from './Provider'

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
  /** The All option's words, for one that names what it covers, such as "All types". */
  allLabel?: ReactNode
  size?: 'sm' | 'md' | undefined
  disabled?: boolean | undefined
  /** Names an element that says more about the group, such as a live summary
   *  of what the filter lets through. */
  'aria-describedby'?: string | undefined
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
  allLabel,
  size = 'sm',
  disabled = false,
  'aria-describedby': describedBy,
  testId,
}: ToggleGroupProps<T>) {
  const strings = useStrings()
  const allCount = typeof all === 'object' ? all.count : undefined
  const pressed: readonly string[] = all && value.length === 0 ? [ALL] : value
  return (
    <BaseToggleGroup<string>
      aria-label={label}
      aria-describedby={describedBy}
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
      {all && (
        <Chip value={ALL} label={allLabel ?? strings.common.all} count={allCount} size={size} />
      )}
      {/* All clears the others rather than joining them, so a rule sets it apart. */}
      {all && options.length > 0 && (
        <span aria-hidden="true" className="mx-0.5 h-5 w-px shrink-0 bg-(--theme-border)" />
      )}
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
}: Omit<ToggleGroupOption<string>, 'label'> & { label: ReactNode; size: 'sm' | 'md' }) {
  const locale = useLocale()
  return (
    <Toggle
      value={value}
      disabled={disabled}
      data-testid={testId}
      // The outline button's pressed border alone reads faintly across a row of
      // chips; the selection tint says which are on at a glance, and the check
      // says it without color. A toggle doesn't rise on hover as a button does
      // (see buttonClasses). Its focus ring draws inside it, so a row of
      // options at a card's clipped top edge or on a wrapped line never has it
      // cut off or laid over a neighbor.
      className={cx(
        buttonClasses({ variant: 'outline', size }),
        'group focus-visible:-outline-offset-2 aria-pressed:bg-(--theme-accent-subtle)',
      )}
    >
      {/* An option that's off dims its icon, such as a logo or a status dot, so
          the pressed ones lead. */}
      {icon && (
        <span className="inline-flex shrink-0 transition-opacity group-not-aria-pressed:opacity-55">
          {icon}
        </span>
      )}
      {label}
      {count !== undefined && (
        <span className="tabular-nums text-(--theme-muted-text-color) group-aria-pressed:text-(--theme-app)">
          {formatCount(count, locale)}
        </span>
      )}
      <CheckIcon aria-hidden="true" className="hidden shrink-0 group-aria-pressed:block" />
    </Toggle>
  )
}
