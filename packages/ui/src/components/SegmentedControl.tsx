import { Toggle } from '@base-ui/react/toggle'
import { ToggleGroup } from '@base-ui/react/toggle-group'
import { clsx as cx } from 'clsx'
import type { ReactNode } from 'react'
import { useLink } from './Provider'
import { Tooltip } from './Tooltip'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  icon?: ReactNode
  /** Beside the label, or in the corner when only the icon shows. */
  badge?: ReactNode
  /** Navigates instead of choosing, for segments that are pages. */
  href?: string
  testId?: string
}

const itemBase =
  'relative flex min-w-0 items-center justify-center rounded-md font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--theme-link)'
const itemCurrent = 'bg-(--theme-panel-bg) theme-text shadow-sm ring-1 ring-(--theme-border)'
const itemIdle = 'theme-muted-text hover:theme-text hover:bg-(--theme-hover)'

/** A few mutually exclusive choices side by side, one always current. With
 *  `iconOnly` the segments stack as icons with their labels in tooltips, for
 *  a collapsed rail. Segments with `href` are pages, so the control becomes
 *  navigation. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onValueChange,
  fill = false,
  iconOnly = false,
  testId,
}: {
  label: string
  options: SegmentedOption<T>[]
  value: T
  onValueChange?: (value: T) => void
  /** Segments share the container's width equally. */
  fill?: boolean
  iconOnly?: boolean
  testId?: string
}) {
  const Link = useLink()
  const links = options.some((o) => o.href)

  const items = options.map((option) => {
    const current = option.value === value
    const className = cx(
      itemBase,
      current ? itemCurrent : itemIdle,
      iconOnly ? 'h-8 w-8' : cx('h-7 gap-1.5 text-[13px]', fill ? 'px-1.5' : 'px-2.5'),
    )
    const content = (
      <>
        {option.icon}
        {iconOnly ? (
          <span className="sr-only">{option.label}</span>
        ) : (
          <span className="truncate">{option.label}</span>
        )}
        {option.badge &&
          (iconOnly ? (
            <span className="absolute top-1 right-1 inline-flex">{option.badge}</span>
          ) : (
            option.badge
          ))}
      </>
    )
    return (
      // A labelled segment shows its name already; only an icon needs the tooltip.
      <Tooltip key={option.value} content={option.label} side="right" disabled={!iconOnly}>
        {option.href ? (
          <Link
            href={option.href}
            aria-current={current ? 'page' : undefined}
            data-testid={option.testId}
            className={className}
          >
            {content}
          </Link>
        ) : (
          <Toggle value={option.value} data-testid={option.testId} className={className}>
            {content}
          </Toggle>
        )}
      </Tooltip>
    )
  })

  const groupClassName = cx(
    'gap-0.5',
    iconOnly
      ? 'flex flex-col items-center'
      : cx(
          'rounded-lg theme-muted-panel p-0.5',
          fill ? 'grid auto-cols-fr grid-flow-col' : 'inline-flex',
        ),
  )
  if (links) {
    return (
      <nav aria-label={label} data-testid={testId} className={groupClassName}>
        {items}
      </nav>
    )
  }
  return (
    <ToggleGroup
      aria-label={label}
      data-testid={testId}
      className={groupClassName}
      orientation={iconOnly ? 'vertical' : 'horizontal'}
      value={[value]}
      // Pressing the current segment again would leave none current; one always is.
      onValueChange={([next]) => {
        if (next !== undefined) {
          onValueChange?.(next as T)
        }
      }}
    >
      {items}
    </ToggleGroup>
  )
}
