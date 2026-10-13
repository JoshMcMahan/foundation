import { Collapsible } from '@base-ui/react/collapsible'
import type { ReactNode } from 'react'
import { cx } from '../cx'
import { ChevronRightIcon } from '../icons'
import { collapsePanelClassName } from './Disclosure'

export type SectionVariant = 'plain' | 'card'

export interface SectionProps {
  title: ReactNode
  /** Beside the title, outside the toggle, such as an info tip or a count. */
  beside?: ReactNode
  /** At the header's far end, such as an add button or a range picker. */
  actions?: ReactNode
  /** `plain` rules the title off from the content under it; `card` frames the
   *  section as a panel. */
  variant?: SectionVariant | undefined
  /** False shows the content always, under a title that doesn't fold. */
  collapsible?: boolean | undefined
  /** Hold the state, such as a remembered preference, with `open` and
   *  `onOpenChange`; or leave it to the section with `defaultOpen`. */
  open?: boolean | undefined
  onOpenChange?: ((open: boolean) => void) | undefined
  defaultOpen?: boolean | undefined
  /** The heading level the title sits at in the page's outline. */
  headingLevel?: 2 | 3 | 4 | undefined
  className?: string | undefined
  children: ReactNode
}

const rootClasses: Record<SectionVariant, string> = {
  plain: 'flex w-full flex-col',
  card: 'group/section panel mb-1 flex w-full flex-col',
}

const headerClasses: Record<SectionVariant, string> = {
  plain: 'mb-2 flex w-full items-center gap-2 border-b border-(--theme-border) pb-1',
  card: 'flex w-full items-center gap-2 px-2 py-3',
}

const titleClasses: Record<SectionVariant, string> = {
  plain: 'text-lg font-semibold',
  // A folded card's title recedes, so the open ones stand out in a long page.
  card: 'text-sm font-bold text-(--theme-muted-text-color) group-data-open/section:text-inherit',
}

/** A titled part of a page or form, its title a heading in the page's outline,
 *  that can fold away. Folding keeps the content mounted, so fields hold their
 *  values and validation while closed. For a line inside content that reveals
 *  more detail, use Disclosure. */
export function Section({
  title,
  beside,
  actions,
  variant = 'plain',
  collapsible = true,
  open,
  onOpenChange,
  defaultOpen = true,
  headingLevel = 3,
  className,
  children,
}: SectionProps) {
  const Heading = `h${headingLevel}` as const
  const end = actions && <div className="ml-auto flex items-center gap-2">{actions}</div>
  // Marks the title for hosts that treat it as a handle, such as the inputs editor's drag.
  const titleProps = { 'data-section-title': '' }
  // With nothing else in the header, the whole row folds the section.
  const fill = !beside && !actions

  if (!collapsible) {
    return (
      <section className={cx(rootClasses[variant], className)}>
        <div className={headerClasses[variant]}>
          <Heading {...titleProps} className={cx('flex items-center', titleClasses[variant])}>
            {title}
          </Heading>
          {beside}
          {end}
        </div>
        {children}
      </section>
    )
  }
  return (
    <Collapsible.Root
      open={open}
      onOpenChange={(next) => onOpenChange?.(next)}
      defaultOpen={defaultOpen}
      className={cx(rootClasses[variant], className)}
    >
      <div className={headerClasses[variant]}>
        <Heading className={cx('flex min-w-0', fill && 'flex-1')}>
          <Collapsible.Trigger
            {...titleProps}
            className={cx(
              'group flex min-w-0 cursor-pointer items-center gap-1 text-left',
              fill && 'w-full',
              titleClasses[variant],
            )}
          >
            <ChevronRightIcon
              aria-hidden="true"
              className={cx(
                'shrink-0 transition-transform group-data-panel-open:rotate-90 motion-reduce:transition-none',
                'px-1 text-[1.25rem]',
              )}
            />
            {title}
          </Collapsible.Trigger>
        </Heading>
        {beside}
        {end}
      </div>
      <Collapsible.Panel keepMounted className={collapsePanelClassName}>
        {children}
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}
