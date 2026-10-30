import { Tabs as BaseTabs } from '@base-ui/react/tabs'
import {
  type CSSProperties,
  createContext,
  type ReactNode,
  type Ref,
  useContext,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { cx } from '../cx'
import { ChevronLeftIcon, ChevronRightIcon } from '../icons'
import { AppLink } from './AppLink'
import { fadeMask, useHiddenEnds } from './scrollFade'
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
  /** Keeps the panels as tall as the tallest, so changing tabs moves nothing
   *  below them. Every panel stays mounted, so it suits a few light panels. */
  steadyHeight?: boolean | undefined
  /** On the tab row. */
  className?: string | undefined
  testId?: string | undefined
  /** The `TabPanel`s; tabs that are pages leave this to the router. */
  children?: ReactNode
}

// A line row that runs past its width fades over about a short tab's width at the end that
// hides tabs. A narrower fade covers only a letter or two of a tab cut at the edge, which reads
// as the row being clipped rather than as more tabs past it.
const TAB_FADE_PX = 48
// The arrow at an end that hides tabs, over the fade's outer half, where no tab text shows.
const ARROW_PX = 24

// Panels of steady-height tabs share one grid cell, so the cell is as tall as the tallest.
const SteadyHeight = createContext(false)

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
  steadyHeight = false,
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
  // A line row that runs past its width scrolls sideways: it fades at the end that hides tabs,
  // and keeps the current tab in view.
  const scroller = useHiddenEnds(!segmented && showRow)
  const scrolled = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs again when the current tab changes, to find it
  useLayoutEffect(() => {
    const list = scroller.ref.current
    const tab = list?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (!list || !tab || segmented) {
      return
    }
    // In view clear of the fade, with room to see the tab beside it.
    const margin = TAB_FADE_PX
    const left = tab.offsetLeft
    const right = left + tab.offsetWidth
    let to: number | undefined
    if (left - margin < list.scrollLeft) {
      to = Math.max(0, left - margin)
    } else if (right + margin > list.scrollLeft + list.clientWidth) {
      to = right + margin - list.clientWidth
    }
    if (to !== undefined) {
      const smooth =
        scrolled.current && !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      // Moved at once when the row first shows; after, it glides to the tab picked.
      list.scrollTo?.({ left: to, behavior: smooth ? 'smooth' : 'instant' })
    }
    scrolled.current = true
  }, [current, segmented, scroller.ref])

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
          {/* Holds the row's arrows at its ends, over the fade. */}
          <div className={cx('relative flex min-w-0', segmented && 'contents')}>
            <BaseTabs.List
              aria-label={label}
              ref={segmented ? undefined : (scroller.ref as Ref<HTMLDivElement>)}
              onScroll={segmented ? undefined : scroller.onScroll}
              style={
                segmented ? undefined : fadeMask(scroller.ends, `${TAB_FADE_PX}px`, `${ARROW_PX}px`)
              }
              className={cx(
                segmented
                  ? segmentGroupClassName(layout)
                  : 'relative flex min-w-0 overflow-x-auto rtl:[--fade-end:left]',
              )}
            >
              {tabs}
              {!segmented && (
                <BaseTabs.Indicator className="absolute bottom-0 left-0 h-0.5 w-(--active-tab-width) translate-x-(--active-tab-left) bg-(--theme-link) transition-[translate,width] duration-200 ease-in-out motion-reduce:transition-none" />
              )}
            </BaseTabs.List>
            {!segmented && scroller.ends.start && (
              <ScrollArrow side="start" onPress={() => scrollRow(scroller.ref.current, -1)} />
            )}
            {!segmented && scroller.ends.end && (
              <ScrollArrow side="end" onPress={() => scrollRow(scroller.ref.current, 1)} />
            )}
          </div>
          {end}
        </div>
      )}
      {steadyHeight ? (
        <SteadyHeight.Provider value>
          <div className="grid">{children}</div>
        </SteadyHeight.Provider>
      ) : (
        children
      )}
    </BaseTabs.Root>
  )
}

/** Scrolls a tab row most of its width toward one end, keeping a tab of the last view in sight.
 *  A right-to-left row scrolls the other way along x. */
function scrollRow(list: HTMLElement | null, toward: 1 | -1) {
  if (!list) {
    return
  }
  const rtl = getComputedStyle(list).direction === 'rtl'
  const by = Math.max(list.clientWidth - TAB_FADE_PX * 2, TAB_FADE_PX) * toward * (rtl ? -1 : 1)
  const smooth = !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  list.scrollBy?.({ left: by, behavior: smooth ? 'smooth' : 'instant' })
}

/** An arrow at an end of a tab row that hides tabs: the cue that more tabs sit past the edge,
 *  and a way to reach them with a pointer that can't scroll sideways. Keyboards move between
 *  tabs with the arrow keys and screen readers list every tab, so it is for pointers only. */
function ScrollArrow({ side, onPress }: { side: 'start' | 'end'; onPress: () => void }) {
  const Icon = side === 'end' ? ChevronRightIcon : ChevronLeftIcon
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      data-scroll-arrow={side}
      onClick={onPress}
      style={{ '--arrow': `${ARROW_PX}px` } as CSSProperties}
      className={cx(
        'absolute inset-y-0 flex w-(--arrow) cursor-pointer items-center theme-muted-text hover:theme-text',
        side === 'end' ? 'end-0 justify-end' : 'start-0 justify-start',
      )}
    >
      <Icon className="size-4 rtl:rotate-180" />
    </button>
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
  const steady = useContext(SteadyHeight)
  return (
    <BaseTabs.Panel
      value={value}
      keepMounted={steady || keepMounted}
      // A closed panel keeps its space: invisible, and inert as Base UI makes it, rather than
      // `hidden`, which takes it out of the layout. Spread, since an undefined `hidden` would
      // replace Base UI's own.
      {...(steady ? { hidden: false } : {})}
      className={cx(
        'rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--theme-focus)',
        steady && '[grid-area:1/1] data-hidden:invisible',
        className,
      )}
    >
      {children}
    </BaseTabs.Panel>
  )
}
