import { Collapsible } from '@base-ui/react/collapsible'
import type { ReactNode } from 'react'
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
  children,
}: DisclosureProps) {
  return (
    <Collapsible.Root
      open={open}
      onOpenChange={(next) => onOpenChange?.(next)}
      defaultOpen={defaultOpen}
      disabled={disabled}
      className={className}
    >
      <Collapsible.Trigger
        className={cx(
          'group/disclosure flex min-w-0 items-start gap-2 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--theme-focus)',
          disabled ? 'cursor-default' : 'cursor-pointer',
          summaryClassName,
        )}
      >
        {summary}
        {!disabled && (
          <ChevronRightIcon
            aria-hidden="true"
            className="mt-1 h-3.5 w-3.5 shrink-0 opacity-70 transition-transform group-data-panel-open/disclosure:rotate-90 motion-reduce:transition-none"
          />
        )}
      </Collapsible.Trigger>
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
