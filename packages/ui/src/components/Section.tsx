import { Collapsible } from '@base-ui/react/collapsible'
import { type ReactNode, useId } from 'react'
import { cx } from '../cx'
import { ChevronRightIcon } from '../icons'
import { collapsePanelClassName } from './Disclosure'

export type SectionVariant = 'plain' | 'card'

export interface SectionProps {
  title: ReactNode
  /** Under the title in muted text, saying what the section holds; it describes
   *  the section, and its toggle, to assistive technology. */
  description?: ReactNode
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
  /** On the section, so a link or a scroll can target it. */
  id?: string | undefined
  className?: string | undefined
  children: ReactNode
}

const rootClasses: Record<SectionVariant, string> = {
  plain: 'flex w-full flex-col',
  card: 'panel mb-1 flex w-full flex-col',
}

const headerClasses: Record<SectionVariant, string> = {
  plain: 'mb-2 flex w-full items-center gap-2 border-b border-(--theme-border) pb-1',
  card: 'flex w-full items-center gap-2 px-3 py-3',
}

// A card frames its content, so it pads it in line with the header. The padding sits
// inside the folding panel, whose own height animates to nothing.
const cardBodyClassName = 'px-3 pb-3'

const titleClasses: Record<SectionVariant, string> = {
  plain: 'text-lg font-semibold',
  card: 'text-sm font-bold',
}

// A folded card's title recedes, so the open ones stand out in a long page. A
// card that can't fold is always open, so its title never recedes.
const foldedTitleClasses: Record<SectionVariant, string> = {
  plain: '',
  card: 'not-data-panel-open:text-(--theme-muted-text-color)',
}

// Lines the description up with the title's text, past the toggle's chevron
// (a 1.25rem box, its padding inside) and the 0.25rem gap after it.
const chevronIndent = 'pl-6'

/** A titled part of a page or form, its title a heading in the page's outline,
 *  that can fold away. Folding keeps the content mounted, so fields hold their
 *  values and validation while closed. For a line inside content that reveals
 *  more detail, use Disclosure. */
export function Section({
  title,
  description,
  beside,
  actions,
  variant = 'plain',
  collapsible = true,
  open,
  onOpenChange,
  defaultOpen = true,
  headingLevel = 3,
  id,
  className,
  children,
}: SectionProps) {
  const Heading = `h${headingLevel}` as const
  const descriptionId = useId()
  const describedBy = description ? descriptionId : undefined
  // Marks the title for hosts that treat it as a handle, such as the inputs editor's drag.
  const titleProps = { 'data-section-title': '' }
  // With nothing else in the header, the whole row folds the section.
  const fill = !beside && !actions
  const header = (heading: ReactNode) => (
    <div className={headerClasses[variant]}>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <div className="flex min-w-0 items-center gap-2">
          {heading}
          {beside}
        </div>
        {description && (
          <p
            id={descriptionId}
            className={cx('text-sm theme-muted-text', collapsible && chevronIndent)}
          >
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )

  if (!collapsible) {
    return (
      <section
        id={id}
        aria-describedby={describedBy}
        className={cx(rootClasses[variant], className)}
      >
        {header(
          <Heading {...titleProps} className={cx('flex items-center', titleClasses[variant])}>
            {title}
          </Heading>,
        )}
        {variant === 'card' ? <div className={cardBodyClassName}>{children}</div> : children}
      </section>
    )
  }
  return (
    <Collapsible.Root
      id={id}
      aria-describedby={describedBy}
      open={open}
      onOpenChange={(next) => onOpenChange?.(next)}
      defaultOpen={defaultOpen}
      className={cx(rootClasses[variant], className)}
    >
      {header(
        <Heading className={cx('flex min-w-0', fill && 'flex-1')}>
          <Collapsible.Trigger
            {...titleProps}
            aria-describedby={describedBy}
            className={cx(
              'group flex min-w-0 cursor-pointer items-center gap-1 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--theme-focus)',
              fill && 'w-full',
              titleClasses[variant],
              foldedTitleClasses[variant],
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
        </Heading>,
      )}
      <Collapsible.Panel keepMounted className={collapsePanelClassName}>
        {variant === 'card' ? <div className={cardBodyClassName}>{children}</div> : children}
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}
