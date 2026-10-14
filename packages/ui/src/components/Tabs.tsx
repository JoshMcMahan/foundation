import { Tabs as BaseTabs } from '@base-ui/react/tabs'
import { type ReactNode, useState } from 'react'
import { cx } from '../cx'
import { useLink } from './Provider'
import {
  SegmentContent,
  type SegmentLayout,
  segmentClassName,
  segmentGroupClassName,
} from './segmented'
import { Tooltip } from './Tooltip'

export interface TabItem<Value extends string = string> {
  value: Value
  label: string
  icon?: ReactNode
  /** Beside the label, or in the corner when only the icon shows. */
  badge?: ReactNode
  /** Navigates instead of showing a panel, for tabs that are pages. */
  href?: string
  disabled?: boolean
  testId?: string
}

// Detail pages pin their tabs under the breadcrumb strip (40px), or under the
// strip and a pinned toolbar below it (40px + 48px).
const stickyClasses = {
  underHeader: 'sticky top-10 z-(--layer-sticky) bg-(--theme-app-bg)',
  underToolbar: 'sticky top-22 z-(--layer-sticky) bg-(--theme-app-bg)',
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
   *  SegmentedControl, for a few views in a small space. `fill` and `iconOnly`
   *  apply to `segmented`. */
  variant?: 'line' | 'segmented' | undefined
  /** At the tab row's far end, such as a picker for what the tabs show. */
  end?: ReactNode
  /** Pins the tab row as the page scrolls. */
  sticky?: keyof typeof stickyClasses | undefined
  /** On the tab row. */
  className?: string | undefined
  testId?: string | undefined
  /** The `TabPanel`s; tabs that are pages leave this to the router. */
  children?: ReactNode
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
  end,
  sticky,
  className,
  testId,
  children,
}: TabsProps<Value>) {
  const Link = useLink()
  const segmented = variant === 'segmented'
  const layout = { fill, iconOnly: segmented && iconOnly }
  // Held here as well as in Base UI, since a segmented tab's look follows it.
  const [own, setOwn] = useState(defaultValue ?? items[0]?.value)
  const current = value ?? own
  const showRow = items.length > 1 || !!end

  const tabs = items.map((item) => {
    const tab = (
      <BaseTabs.Tab
        key={item.value}
        value={item.value}
        disabled={item.disabled}
        data-testid={item.testId}
        {...(item.href ? { nativeButton: false, render: <Link href={item.href} /> } : {})}
        className={
          segmented
            ? segmentClassName(item.value === current, layout)
            : 'flex cursor-pointer select-none items-center gap-1.5 whitespace-nowrap px-2 py-2 text-sm font-semibold theme-muted-text outline-none transition-colors hover:theme-text focus-visible:rounded-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--theme-link) data-active:text-(--theme-link) data-disabled:cursor-not-allowed data-disabled:opacity-50'
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
          className={cx(
            'flex items-center justify-between gap-2',
            !segmented && 'border-b border-(--theme-border)',
            sticky && stickyClasses[sticky],
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
      className={cx('outline-none', className)}
    >
      {children}
    </BaseTabs.Panel>
  )
}
