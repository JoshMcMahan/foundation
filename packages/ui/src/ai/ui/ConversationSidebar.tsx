import {
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
} from 'react'
import { Drawer } from '../../components/Drawer'
import { positionKeys } from '../../components/keys'
import { usePersistedState } from '../../components/Provider'
import { LoadingRegion, Skeleton } from '../../components/Skeleton'
import { useSplitter } from '../../components/splitter'
import { cx } from '../../cx'
import {
  SIDEBAR_DEFAULT_WIDTH_PX,
  SIDEBAR_ROW_SELECTOR,
  SidebarGroupHeading,
  SidebarPanel,
  SidebarToggle,
} from './sidebar'

export const SIDEBAR_MIN_WIDTH_PX = 200

/** A conversation list's drawer on a layout too narrow to keep it beside the
 *  content: it covers the chat's own positioned container, not the window, and
 *  stays mounted so the list keeps its scroll and search between openings. */
export const sidebarDrawerProps = {
  contained: true,
  side: 'left',
  width: 'min(20rem, 85%)',
  modal: 'trap-focus',
  keepMounted: true,
  closeButton: false,
  padded: false,
} as const
// Every list that takes turns beside the thread shares one width, so moving
// between them leaves the thread where it was.
const SHARED_WIDTH_STORAGE_KEY = 'aiChatSidebarWidth'
export const SIDEBAR_MAX_WIDTH_PX = 480

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH_PX, Math.max(SIDEBAR_MIN_WIDTH_PX, width))
}

export interface ConversationSidebarGroup<T> {
  /** Also what remembers the group folded, so keep it the same across renders and visits. */
  key: string
  label: ReactNode
  tone?: 'default' | 'attention'
  items: T[]
}

// Lists that name no key of their own share one, as they share a width.
const SHARED_COLLAPSED_GROUPS_STORAGE_KEY = 'aiChatSidebarCollapsedGroups'

/** The keys of the groups the reader folded. A key stays while its group is gone, emptied or
 *  filtered out, so the group comes back folded. */
function useCollapsedGroups(storageKey: string) {
  const [stored, setStored] = usePersistedState<string[]>(storageKey, [])
  const collapsed = useMemo(() => new Set(storedKeys(stored)), [stored])
  const toggle = useCallback(
    (key: string) =>
      setStored((prev) => {
        const keys = storedKeys(prev)
        return keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]
      }),
    [setStored],
  )
  return { collapsed, toggle }
}

// What was stored is only trusted as a list of keys.
function storedKeys(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((k): k is string => typeof k === 'string') : []
}

/** Steps through the listed items in order and wraps, so moving between
 *  conversations never needs the pointer. */
function useItemCycling<T>(
  ordered: T[],
  cycle: { current: T | undefined; onSelect: (item: T) => void } | undefined,
) {
  const latest = useRef({ ordered, cycle })
  latest.current = { ordered, cycle }
  const enabled = !!cycle
  useEffect(() => {
    if (!enabled) {
      return
    }
    const onKeyDown = (e: KeyboardEvent) => {
      const step = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0
      const { ordered: items, cycle: c } = latest.current
      if (!step || !e.altKey || !(e.metaKey || e.ctrlKey) || !c || items.length === 0) {
        return
      }
      e.preventDefault()
      const at = c.current === undefined ? -1 : items.indexOf(c.current)
      const next =
        at < 0
          ? items[step > 0 ? 0 : items.length - 1]
          : items[(at + step + items.length) % items.length]
      if (next !== undefined) {
        c.onSelect(next)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [enabled])
}

/** ↑ and ↓ move focus to the row above or below, across groups, and Home and End to the first
 *  and last, onto the row's first control, as a list read from the keyboard expects. */
function moveBetweenRows(e: ReactKeyboardEvent<HTMLElement>) {
  const step = ROW_STEPS[e.key]
  if (
    step === undefined ||
    e.defaultPrevented ||
    e.altKey ||
    e.ctrlKey ||
    e.metaKey ||
    e.shiftKey
  ) {
    return
  }
  const from = (e.target as Element).closest(SIDEBAR_ROW_SELECTOR)
  if (!from || !e.currentTarget.contains(from)) {
    return
  }
  const rows = [...e.currentTarget.querySelectorAll(SIDEBAR_ROW_SELECTOR)]
  const at = rows.indexOf(from)
  const to = step === 'first' ? rows[0] : step === 'last' ? rows.at(-1) : rows[at + step]
  const control = to?.querySelector<HTMLElement>(ROW_CONTROL)
  if (!control) {
    return
  }
  e.preventDefault()
  control.focus()
}

const ROW_STEPS: Record<string, 1 | -1 | 'first' | 'last'> = {
  ArrowDown: 1,
  ArrowUp: -1,
  Home: 'first',
  End: 'last',
}

const ROW_CONTROL = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** A list of conversations beside the thread: headed groups of rows that
 *  collapse to a rail, with an optional drag handle for the width. The host
 *  decides what is listed, how it is grouped and how each row reads. A group's
 *  heading folds its rows away, and the list remembers it folded. ↑ and ↓
 *  move focus between its rows. */
export function ConversationSidebar<T>({
  label,
  collapsed: collapsedProp,
  onToggle,
  toggleLabels,
  resize,
  fill: fillProp = false,
  drawer,
  groups,
  groupsStorageKey = SHARED_COLLAPSED_GROUPS_STORAGE_KEY,
  getKey,
  renderRow,
  loading = false,
  placeholder,
  top,
  rail,
  footer,
  cycle,
  groupTestId,
  children,
}: {
  label?: string
  collapsed: boolean
  onToggle: () => void
  toggleLabels: { open: string; close: string }
  /** Omit for a fixed width. A `storageKey` keeps this list's width apart
   *  from the others'. */
  resize?: { storageKey?: string; label: string; hint: string }
  /** Takes the width of its container, as inside a drawer, with no rail and
   *  no drag handle. */
  fill?: boolean
  /** Shows the list in a drawer over the page instead of beside it; it fills
   *  the drawer. */
  drawer?: { open: boolean; onClose: () => void; label: string } | undefined
  groups: ConversationSidebarGroup<T>[]
  /** Where the groups the reader folded are remembered. Lists without one share a key, so give
   *  one to a list whose group keys another list might also use. */
  groupsStorageKey?: string
  getKey: (item: T) => string
  /** One `SidebarRow`. */
  renderRow: (item: T) => ReactNode
  loading?: boolean
  /** Shown instead of the groups when there are none, such as an empty
   *  state, a search with no matches, or an error. */
  placeholder?: ReactNode
  /** Above the list, collapsed or not: new-item buttons and search. */
  top?: ReactNode
  /** What the collapsed rail holds, as `SidebarRailItem`s. */
  rail?: ReactNode
  /** Beside the toggle at the bottom, while expanded. */
  footer?: ReactNode
  /** ⌘⌥↑ and ⌘⌥↓ (Ctrl+Alt elsewhere) select the previous or next item. */
  cycle?: { current: T | undefined; onSelect: (item: T) => void }
  groupTestId?: string
  /** Dialogs and menus that belong to the list. */
  children?: ReactNode
}) {
  const [storedWidth, setStoredWidth] = usePersistedState(
    resize?.storageKey ?? SHARED_WIDTH_STORAGE_KEY,
    SIDEBAR_DEFAULT_WIDTH_PX,
  )
  const splitter = useSplitter({
    width: clampSidebarWidth(storedWidth),
    onWidthChange: setStoredWidth,
    min: SIDEBAR_MIN_WIDTH_PX,
    max: SIDEBAR_MAX_WIDTH_PX,
    side: 'right',
    defaultWidth: SIDEBAR_DEFAULT_WIDTH_PX,
    label: resize?.label,
  })
  const collapsedGroups = useCollapsedGroups(groupsStorageKey)
  const groupsId = useId()
  // A folded group's rows are out of sight, so cycling passes them by too.
  useItemCycling(
    groups.flatMap((g) => (collapsedGroups.collapsed.has(g.key) ? [] : g.items)),
    cycle,
  )

  const fill = fillProp || !!drawer
  const collapsed = collapsedProp && !fill
  const resizable = resize && !fill
  const panel = (
    <SidebarPanel
      collapsed={collapsed}
      label={label}
      {...(resizable ? { width: splitter.width, resizing: splitter.resizing } : {})}
      {...(fill ? { style: { width: '100%' } } : {})}
    >
      {resizable && !collapsed && <div {...splitter.separatorProps} title={resize.hint} />}

      {top}

      {collapsed && rail ? (
        <ul className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-1">
          {rail}
        </ul>
      ) : (
        // biome-ignore lint/a11y/noStaticElementInteractions: it only hears the arrows the rows' own controls let bubble
        <div
          className={cx(
            'min-h-0 flex-1 overflow-y-auto px-2 pb-2 transition-opacity duration-200',
            collapsed ? 'pointer-events-none opacity-0' : 'opacity-100',
          )}
          onKeyDown={moveBetweenRows}
        >
          {loading ? (
            <LoadingRegion className="space-y-3 px-2 pt-2">
              {positionKeys(5, 'skeleton').map((key, i) => (
                <Skeleton key={key} width={`${70 - i * 10}%`} height={16} />
              ))}
            </LoadingRegion>
          ) : groups.length === 0 ? (
            placeholder
          ) : (
            groups.map((group, i) => {
              const folded = collapsedGroups.collapsed.has(group.key)
              const rowsId = `${groupsId}-${i}`
              return (
                <div key={group.key} className="mb-2">
                  <SidebarGroupHeading
                    tone={group.tone ?? 'default'}
                    testId={groupTestId}
                    toggle={{
                      collapsed: folded,
                      onToggle: () => collapsedGroups.toggle(group.key),
                      controls: rowsId,
                      count: group.items.length,
                    }}
                  >
                    {group.label}
                  </SidebarGroupHeading>
                  {/* Folded, the rows unmount, and the list they leave is hidden, so nothing
                      reads it. */}
                  <ul id={rowsId} hidden={folded} className="space-y-0.5">
                    {!folded &&
                      group.items.map((item) => (
                        <Fragment key={getKey(item)}>{renderRow(item)}</Fragment>
                      ))}
                  </ul>
                </div>
              )
            })
          )}
        </div>
      )}

      <div
        className={cx(
          'flex shrink-0 items-center gap-1 p-1.5',
          collapsed ? 'justify-center' : footer ? 'justify-between' : 'justify-end',
        )}
      >
        {!collapsed && footer}
        <SidebarToggle
          collapsed={collapsed}
          onToggle={onToggle}
          openLabel={toggleLabels.open}
          closeLabel={toggleLabels.close}
        />
      </div>

      {children}
    </SidebarPanel>
  )
  return drawer ? (
    <Drawer
      {...sidebarDrawerProps}
      open={drawer.open}
      onClose={drawer.onClose}
      aria-label={drawer.label}
    >
      {panel}
    </Drawer>
  ) : (
    panel
  )
}
