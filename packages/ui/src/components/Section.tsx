import { Collapsible } from '@base-ui/react/collapsible'
import { type ReactNode, useContext, useId } from 'react'
import { cx } from '../cx'
import { ChevronRightIcon } from '../icons'
import { collapsePanelClassName } from './Disclosure'
import { InDescriptionListGroup } from './descriptionListGroup'

export type SectionVariant = 'plain' | 'bare' | 'card'
export type SectionTone = 'default' | 'error'
export type SectionSpacing = 'regular' | 'tight'

export interface SectionProps {
  title: ReactNode
  /** Under the title in muted text, saying what the section holds; it describes
   *  the section, and its toggle, to assistive technology. */
  description?: ReactNode
  /** Beside the title, outside the toggle, such as an info tip or a count. */
  beside?: ReactNode
  /** At the header's far end, such as an add button or a range picker. */
  actions?: ReactNode
  /** `plain` rules the title off from the content under it; `bare` sets the title
   *  over the content with no rule; `card` frames the section as a panel. */
  variant?: SectionVariant | undefined
  /** `error` marks a card of irreversible actions, such as deleting what the page
   *  shows: its border and title turn the error color over a clear body. */
  tone?: SectionTone | undefined
  /** A card's content reaches its edges, such as a table or a list ruled to its
   *  sides, instead of sitting inset under the header. */
  flush?: boolean | undefined
  /** The room between a `plain` section's rule and its content. `tight` suits content that
   *  spaces itself tightly, such as a form with its labels over its fields, so the first row
   *  sits as far under the rule as the rows under it sit under one another. */
  spacing?: SectionSpacing | undefined
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
  bare: 'flex w-full flex-col',
  card: 'panel mb-1 flex w-full flex-col',
}

// In a DescriptionListGroup the section, and each box between it and its lists, lays out on the
// group's columns, so the lists in it share the group's label column with the lists outside it.
const groupedRootClasses: Record<SectionVariant, string> = {
  plain: 'col-span-full grid grid-cols-subgrid',
  bare: 'col-span-full grid grid-cols-subgrid',
  card: 'panel mb-1 col-span-full grid grid-cols-subgrid',
}
const passColumns = 'col-span-full grid grid-cols-subgrid'

// A danger zone keeps the card's frame but drops its fill, so its red edge reads
// as the warning rather than a tinted block.
const errorCardClassName = 'border-(--theme-error)/30 bg-transparent'

// The header measures itself, so a narrow one (a phone, or a card in a tight
// column) moves actions such as a range picker onto their own line under the title
// instead of squeezing the title into a sliver beside them.
const headerClasses: Record<SectionVariant, string> = {
  plain:
    '@container/section-header flex w-full flex-wrap items-center gap-x-2 gap-y-2 border-b border-(--theme-border) pb-1',
  bare: '@container/section-header flex w-full flex-wrap items-center gap-x-2 gap-y-2',
  // 48px with a one-line title, so a page of folded cards stays short.
  card: '@container/section-header flex w-full flex-wrap items-center gap-x-2 gap-y-2 px-4 py-3',
}

// Below this width the actions take their own line; above it they sit at the far end.
const actionsClassName =
  'flex shrink-0 ms-auto @max-[24rem]/section-header:ms-0 @max-[24rem]/section-header:basis-full'

// Between the title and the content; a card's header pads itself.
const ruleGaps: Record<SectionSpacing, string> = { regular: 'mb-4', tight: 'mb-1.5' }

// A card frames its content, so it pads it in line with the header. The padding sits
// inside the folding panel, whose own height animates to nothing.
const cardBodyClassName = 'px-4 pb-4'

const titleClasses: Record<SectionVariant, string> = {
  plain: 'text-base font-semibold',
  bare: 'text-base font-semibold',
  card: 'text-base font-semibold',
}

// A folded card's title recedes, so the open ones stand out in a long page. A
// card that can't fold is always open, so its title never recedes.
const foldedTitleClasses: Record<SectionVariant, string> = {
  plain: '',
  bare: '',
  card: 'not-data-panel-open:text-(--theme-muted-text-color)',
}

// Lines the description up with the title's text, past the toggle's chevron
// (a 1.25rem box, its padding inside) and the 0.25rem gap after it.
const chevronIndent = 'pl-6'

/** A titled part of a page or form, its title a heading in the page's outline,
 *  that can fold away. Folding keeps the content mounted, so fields hold their
 *  values and validation while closed. For a line inside content that reveals
 *  more detail, use Disclosure. In a `DescriptionListGroup`, the description lists
 *  in it share the group's label column. */
export function Section({
  title,
  description,
  beside,
  actions,
  variant = 'plain',
  tone = 'default',
  flush = false,
  spacing = 'regular',
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
  const grouped = useContext(InDescriptionListGroup)
  const descriptionId = useId()
  const describedBy = description ? descriptionId : undefined
  // Marks the title for hosts that treat it as a handle, such as the inputs editor's drag.
  const titleProps = { 'data-section-title': '' }
  // With nothing else in the header, the whole row folds the section.
  const fill = !beside && !actions
  const card = variant === 'card'
  const danger = card && tone === 'error'
  const rootClassName = cx(
    (grouped ? groupedRootClasses : rootClasses)[variant],
    danger && errorCardClassName,
    className,
  )
  const titleTone = danger && 'text-(--theme-error-text)'
  const body =
    card && !flush ? (
      <div className={cx(cardBodyClassName, grouped && passColumns)}>{children}</div>
    ) : (
      children
    )
  const header = (heading: ReactNode) => (
    <div
      className={cx(headerClasses[variant], !card && ruleGaps[spacing], grouped && 'col-span-full')}
      data-section-header
    >
      <div className="flex min-w-0 grow basis-0 flex-col gap-0.5">
        <div className="flex min-w-0 items-start gap-2">
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
      {actions && (
        // On their own line they start under the title's text, past the chevron.
        <div className={cx(actionsClassName, collapsible && '@max-[24rem]/section-header:ps-6')}>
          {/* Content width, so a field such as a range picker doesn't stretch across its line. */}
          <div className="flex w-fit items-center gap-2">{actions}</div>
        </div>
      )}
    </div>
  )

  if (!collapsible) {
    return (
      <section id={id} aria-describedby={describedBy} className={rootClassName}>
        {header(
          <Heading
            {...titleProps}
            className={cx('flex items-center', titleClasses[variant], titleTone)}
          >
            {title}
          </Heading>,
        )}
        {body}
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
      className={rootClassName}
    >
      {header(
        <Heading className={cx('flex min-w-0', fill && 'flex-1')}>
          <Collapsible.Trigger
            {...titleProps}
            aria-describedby={describedBy}
            className={cx(
              'group flex min-w-0 cursor-pointer items-start gap-1 rounded-sm text-left select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--theme-focus)',
              fill && 'w-full',
              titleClasses[variant],
              titleTone || foldedTitleClasses[variant],
            )}
          >
            <ChevronRightIcon
              aria-hidden="true"
              className={cx(
                'shrink-0 transition-transform group-data-panel-open:rotate-90 motion-reduce:transition-none',
                // A 1.25rem chevron centred on the title's first 1.5rem line, so a
                // title that wraps keeps its chevron beside its start.
                'mt-0.5 px-1 text-[1.25rem]',
              )}
            />
            {title}
          </Collapsible.Trigger>
        </Heading>,
      )}
      <Collapsible.Panel keepMounted className={cx(collapsePanelClassName, grouped && passColumns)}>
        {body}
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}
