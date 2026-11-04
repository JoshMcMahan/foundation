import { Collapsible } from '@base-ui/react/collapsible'
import { type MouseEventHandler, type ReactNode, useRef } from 'react'
import { cx } from '../cx'
import { ChevronRightIcon } from '../icons'

/** The height a collapsible panel animates as it opens and closes. It clips
 *  only while it moves, so focus rings and overflowing content show once open. */
export const collapsePanelClassName =
  'h-(--collapsible-panel-height) transition-[height,opacity] duration-200 ease-out motion-reduce:transition-none data-starting-style:h-0 data-starting-style:overflow-hidden data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:overflow-hidden data-ending-style:opacity-0'

export interface DisclosureProps {
  /** The line that toggles the detail: a label, or a row of status and label. */
  summary: ReactNode
  open?: boolean | undefined
  onOpenChange?: ((open: boolean) => void) | undefined
  defaultOpen?: boolean | undefined
  /** Nothing to reveal: the summary shows without a toggle. */
  disabled?: boolean | undefined
  /** Keep the detail mounted while folded, so its own state survives. */
  keepMounted?: boolean | undefined
  className?: string | undefined
  /** On the toggle: its width (`w-full` for a whole row), text size and color. */
  summaryClassName?: string | undefined
  /** On the revealed detail: its indent and spacing. */
  panelClassName?: string | undefined
  /** False drops the chevron, for a row that reads as a toggle on its own, such as a whole
   *  list row that opens its detail. */
  chevron?: boolean | undefined
  /** Controls beside the summary, outside the toggle, so a row can hold buttons without
   *  nesting them in it. */
  actions?: ReactNode
  /** Controls that read as part of the summary, right after it on its line, such as a button
   *  that says why a row failed. They sit outside the toggle, so no button holds another and
   *  each is its own stop for Tab; a click on the rest of the line still toggles. */
  summaryControls?: ReactNode
  /** Text beside the summary that gives way to it, such as a cluster's address beside its name.
   *  It fills the room the summary and actions leave, ends in an ellipsis when that room runs
   *  short, and hides when the room is too narrow to read (under 5rem). The summary shortens
   *  only once it and the actions no longer fit. */
  aside?: ReactNode
  /** On the whole disclosure, summary and detail, such as a row's own menu. */
  onContextMenu?: MouseEventHandler<HTMLDivElement> | undefined
  children: ReactNode
}

/** A line inside content that reveals more detail beneath it, such as a tool
 *  call's arguments or a model's reasoning. For a titled part of a page or
 *  form, which belongs in the page's outline, use Section. */
export function Disclosure({
  summary,
  open,
  onOpenChange,
  defaultOpen = false,
  disabled = false,
  keepMounted = false,
  className,
  summaryClassName,
  panelClassName,
  chevron = true,
  actions,
  summaryControls,
  aside,
  onContextMenu,
  children,
}: DisclosureProps) {
  const trigger = useRef<HTMLButtonElement>(null)
  const hasControls =
    summaryControls !== undefined && summaryControls !== null && summaryControls !== false
  const toggle = (
    <Collapsible.Trigger
      ref={trigger}
      className={cx(
        'group/disclosure flex min-w-0 items-start gap-2 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--theme-focus)',
        disabled ? 'cursor-default' : 'cursor-pointer',
        summaryClassName,
      )}
    >
      {summary}
      {!disabled && chevron && (
        <ChevronRightIcon
          aria-hidden="true"
          className="mt-[calc((1lh-0.875rem)/2)] h-3.5 w-3.5 shrink-0 opacity-70 transition-transform group-data-panel-open/disclosure:rotate-90 motion-reduce:transition-none"
        />
      )}
    </Collapsible.Trigger>
  )
  // The rest of the line, a pointer's way to toggle as the line was before. The toggle itself
  // is the keyboard's and the screen reader's.
  const rest = (
    <div
      aria-hidden="true"
      className={cx('min-w-0 flex-1 self-stretch', !disabled && 'cursor-pointer')}
      onClick={() => trigger.current?.click()}
    />
  )
  // The aside takes only the room left over, so it never pushes the summary: its width comes
  // from the line, not its text, and the container query hides the text when that room is too
  // narrow to read.
  const asideSlot =
    aside !== undefined && aside !== null && aside !== false ? (
      <div className="@container flex min-w-0 flex-1 items-center self-stretch">
        {rest}
        <div className="min-w-0 truncate @max-[5rem]:hidden">{aside}</div>
      </div>
    ) : null
  return (
    <Collapsible.Root
      open={open}
      onOpenChange={(next) => onOpenChange?.(next)}
      defaultOpen={defaultOpen}
      disabled={disabled}
      className={className}
      onContextMenu={onContextMenu}
    >
      {hasControls ? (
        <div className="flex min-w-0 items-center gap-2">
          {toggle}
          <div className="flex shrink-0 items-center gap-1">{summaryControls}</div>
          {asideSlot ?? rest}
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
      ) : asideSlot ? (
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0">{toggle}</div>
          {asideSlot}
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
      ) : actions ? (
        <div className="flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1">{toggle}</div>
          <div className="flex shrink-0 items-center gap-1">{actions}</div>
        </div>
      ) : (
        toggle
      )}
      <Collapsible.Panel
        keepMounted={keepMounted}
        className={cx(collapsePanelClassName, panelClassName)}
      >
        {children}
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}

/** The revealing panel alone, for a toggle that lives elsewhere, such as a
 *  tree row's chevron that names this panel with `aria-controls`. */
export function DisclosurePanel({
  open,
  id,
  keepMounted = false,
  className,
  children,
}: {
  open: boolean
  id?: string | undefined
  keepMounted?: boolean | undefined
  className?: string | undefined
  children: ReactNode
}) {
  return (
    <Collapsible.Root open={open}>
      <Collapsible.Panel
        id={id}
        keepMounted={keepMounted}
        className={cx(collapsePanelClassName, className)}
      >
        {children}
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}
