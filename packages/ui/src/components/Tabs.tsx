import { Tabs as BaseTabs } from '@base-ui/react/tabs'
import { type ReactNode, useState } from 'react'
import { cx } from '../cx'
import { AppLink } from './AppLink'
import {
  SegmentContent,
  type SegmentLayout,
  type SegmentTone,
  segmentClassName,
  segmentGroupClassName,
} from './segmented'
import { stickyClasses, useStickyTop } from './stickyTop'
import { Tooltip } from './Tooltip'

export interface TabItem<Value extends string = string> {
  value: Value
  label: string
  icon?: ReactNode
  /** Beside the label, or in the corner when only the icon shows. */
  badge?: ReactNode
  /** How many things the view holds, as a pill after the label. */
  count?: number | undefined
  /** Colors the label and the count, for a view that needs attention, such
   *  as what failed or what has been left behind. */
  tone?: SegmentTone | undefined
  /** Navigates instead of showing a panel, for tabs that are pages. */
  href?: string
  disabled?: boolean
  testId?: string
}

export interface TabsProps<Value extends string> extends SegmentLayout {
  /** Names the set of tabs for assistive technology. */
  label: string
  items: TabItem<Value>[]
  /** The current tab. For tabs that are pages, the page being shown. */
  value?: Value | undefined
  defaultValue?: Value | undefined
  onValueChange?: ((value: Value) => void) | undefined
  /** `line` underlines the current tab across a page; `segmented` matches a
   *  SegmentedControl, for a few views in a small space. `fill`, `iconOnly`
   *  and `size` apply to `segmented`. */
  variant?: 'line' | 'segmented' | undefined
  /** At the tab row's far end, such as a picker for what the tabs show. */
  end?: ReactNode
  /** Pins the tab row as the page scrolls, just below whatever the page's
   *  scroller already pins at the top, such as the page header and a toolbar. */
  sticky?: boolean | undefined
  /** On the tab row. */
  className?: string | undefined
  testId?: string | undefined
  /** The `TabPanel`s; tabs that are pages leave this to the router. */
  children?: ReactNode
}

// A toned tab keeps its tone while current; the underline still marks it.
const lineTone: Record<SegmentTone, string> = {
  warning: 'text-(--theme-warning)',
  danger: 'text-(--theme-error-text)',
}

/** Views of one thing, one shown at a time: panels below the tabs, or pages
 *  the tabs link to. A lone tab would only repeat the page's title, so the row
 *  hides unless there are two or more, or something at its end. */
export function Tabs<Value extends string>({
  label,
  items,
  value,
  defaultValue,
  onValueChange,
  variant = 'line',
  fill = false,
  iconOnly = false,
  size = 'md',
  end,
  sticky,
  className,
  testId,
  children,
}: TabsProps<Value>) {
  const segmented = variant === 'segmented'
  const layout = { fill, iconOnly: segmented && iconOnly, size }
  // Held here as well as in Base UI, since a segmented tab's look follows it.
  const [own, setOwn] = useState(defaultValue ?? items[0]?.value)
  const current = value ?? own
  const showRow = items.length > 1 || !!end
  const [row, setRow] = useState<HTMLDivElement | null>(null)
  useStickyTop(row, !!sticky)

  const tabs = items.map((item) => {
    const tab = (
      <BaseTabs.Tab
        key={item.value}
        value={item.value}
        disabled={item.disabled}
        data-testid={item.testId}
        {...(item.href ? { nativeButton: false, render: <AppLink href={item.href} /> } : {})}
        className={
          segmented
            ? segmentClassName(item.value === current, layout, item.tone)
            : cx(
                'flex cursor-pointer select-none items-center gap-1.5 whitespace-nowrap px-2 py-2 text-sm font-semibold transition-colors focus-visible:rounded-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--theme-focus) data-disabled:cursor-not-allowed data-disabled:opacity-50',
                item.tone
                  ? lineTone[item.tone]
                  : 'theme-muted-text hover:theme-text data-active:text-(--theme-link)',
              )
        }
      >
        <SegmentContent {...item} iconOnly={layout.iconOnly} />
      </BaseTabs.Tab>
    )
    // A labeled tab shows its name already; only an icon needs the tooltip.
    return layout.iconOnly ? (
      <Tooltip key={item.value} content={item.label} side="right">
        {tab}
      </Tooltip>
    ) : (
      tab
    )
  })

  return (
    <BaseTabs.Root
      value={current ?? null}
      onValueChange={(next) => {
        setOwn(next as Value)
        onValueChange?.(next as Value)
      }}
      orientation={layout.iconOnly ? 'vertical' : 'horizontal'}
      data-testid={testId}
      // Without panels the root holds only the row, so a sticky row would have
      // no room to stick in and would scroll away with it. Dropping the root's
      // box lets the row stick within the page that holds it.
      className={children ? undefined : 'contents'}
    >
      {showRow && (
        <div
          ref={setRow}
          className={cx(
            'flex items-center justify-between gap-2',
            !segmented && 'border-b border-(--theme-border)',
            sticky && stickyClasses,
            className,
          )}
        >
          <BaseTabs.List
            aria-label={label}
            className={cx(
              segmented ? segmentGroupClassName(layout) : 'relative flex min-w-0 overflow-x-auto',
            )}
          >
            {tabs}
            {!segmented && (
              <BaseTabs.Indicator className="absolute bottom-0 left-0 h-0.5 w-(--active-tab-width) translate-x-(--active-tab-left) bg-(--theme-link) transition-[translate,width] duration-200 ease-in-out motion-reduce:transition-none" />
            )}
          </BaseTabs.List>
          {end}
        </div>
      )}
      {children}
    </BaseTabs.Root>
  )
}

/** One tab's content, shown while its tab is current. */
export function TabPanel({
  value,
  keepMounted,
  className,
  children,
}: {
  value: string
  /** Keeps the content, and its state, while another tab is shown. */
  keepMounted?: boolean | undefined
  className?: string | undefined
  children: ReactNode
}) {
  return (
    <BaseTabs.Panel
      value={value}
      keepMounted={keepMounted}
      className={cx(
        'rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--theme-focus)',
        className,
      )}
    >
      {children}
    </BaseTabs.Panel>
  )
}
