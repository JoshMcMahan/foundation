import { clsx as cx } from 'clsx'
import { Fragment, type ReactNode, useEffect, useRef, useState } from 'react'
import { positionKeys } from '../../components/keys'
import {
  SIDEBAR_DEFAULT_WIDTH_PX,
  SidebarDrawer,
  SidebarGroupHeading,
  SidebarPanel,
  SidebarToggle,
} from './sidebar'

export const SIDEBAR_MIN_WIDTH_PX = 200
// Every list that takes turns beside the thread shares one width, so moving
// between them leaves the thread where it was.
const SHARED_WIDTH_STORAGE_KEY = 'aiChatSidebarWidth'
export const SIDEBAR_MAX_WIDTH_PX = 480

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH_PX, Math.max(SIDEBAR_MIN_WIDTH_PX, width))
}

function readStoredSidebarWidth(storageKey: string): number {
  try {
    const stored = Number(window.localStorage.getItem(storageKey))
    return Number.isFinite(stored) && stored > 0
      ? clampSidebarWidth(stored)
      : SIDEBAR_DEFAULT_WIDTH_PX
  } catch {
    return SIDEBAR_DEFAULT_WIDTH_PX
  }
}

function storeSidebarWidth(storageKey: string, width: number) {
  try {
    window.localStorage.setItem(storageKey, String(width))
  } catch {
    // Storage unavailable (SSR, disabled storage): width simply doesn't persist.
  }
}

/** A sidebar width the reader drags, nudges or resets, kept per list under
 *  its own storage key. */
export function useResizableSidebarWidth(storageKey: string) {
  const [width, setWidth] = useState(() => readStoredSidebarWidth(storageKey))
  const [resizing, setResizing] = useState(false)
  const widthRef = useRef(width)
  widthRef.current = width

  const startResize = (e: React.PointerEvent<HTMLElement>) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = widthRef.current
    setResizing(true)
    const onMove = (ev: PointerEvent) => {
      setWidth(clampSidebarWidth(startWidth + ev.clientX - startX))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setResizing(false)
      storeSidebarWidth(storageKey, widthRef.current)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const reset = () => {
    setWidth(SIDEBAR_DEFAULT_WIDTH_PX)
    storeSidebarWidth(storageKey, SIDEBAR_DEFAULT_WIDTH_PX)
  }

  const nudge = (delta: number) => {
    const next = clampSidebarWidth(widthRef.current + delta)
    setWidth(next)
    storeSidebarWidth(storageKey, next)
  }

  return { width, resizing, startResize, reset, nudge }
}

export interface ConversationSidebarGroup<T> {
  key: string
  label: ReactNode
  tone?: 'default' | 'attention'
  items: T[]
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

/** A list of conversations beside the thread: headed groups of rows that
 *  collapse to a rail, with an optional drag handle for the width. The host
 *  decides what is listed, how it is grouped and how each row reads. */
export function ConversationSidebar<T>({
  label,
  collapsed: collapsedProp,
  onToggle,
  toggleLabels,
  resize,
  fill: fillProp = false,
  drawer,
  groups,
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
  const sized = useResizableSidebarWidth(resize?.storageKey ?? SHARED_WIDTH_STORAGE_KEY)
  useItemCycling(
    groups.flatMap((g) => g.items),
    cycle,
  )

  const fill = fillProp || !!drawer
  const collapsed = collapsedProp && !fill
  const resizable = resize && !fill
  const panel = (
    <SidebarPanel
      collapsed={collapsed}
      label={label}
      {...(resizable ? { width: sized.width, resizing: sized.resizing } : {})}
      {...(fill ? { style: { width: '100%' } } : {})}
    >
      {resizable && !collapsed && (
        // biome-ignore lint/a11y/useSemanticElements: a window splitter must be focusable and full height; <hr> is reset to height 0 and cannot host the drag surface.
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label={resize.label}
          aria-valuemin={SIDEBAR_MIN_WIDTH_PX}
          aria-valuemax={SIDEBAR_MAX_WIDTH_PX}
          aria-valuenow={sized.width}
          title={resize.hint}
          onPointerDown={sized.startResize}
          onDoubleClick={sized.reset}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              sized.nudge(-16)
            } else if (e.key === 'ArrowRight') {
              sized.nudge(16)
            }
          }}
          className={cx(
            'absolute inset-y-0 right-0 z-10 w-1 cursor-col-resize touch-none',
            sized.resizing ? 'bg-(--theme-element)' : 'hover:bg-(--theme-border)',
          )}
        />
      )}

      {top}

      {collapsed && rail ? (
        <ul className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto py-1">
          {rail}
        </ul>
      ) : (
        <div
          className={cx(
            'min-h-0 flex-1 overflow-y-auto px-2 pb-2 transition-opacity duration-200',
            collapsed ? 'pointer-events-none opacity-0' : 'opacity-100',
          )}
        >
          {loading ? (
            <div className="space-y-3 px-2 pt-2">
              {positionKeys(5, 'skeleton').map((key, i) => (
                <div key={key} className="animate-pulse">
                  <div
                    className="h-4 rounded theme-muted-panel"
                    style={{ width: `${70 - i * 10}%` }}
                  />
                </div>
              ))}
            </div>
          ) : groups.length === 0 ? (
            placeholder
          ) : (
            groups.map((group) => (
              <div key={group.key} className="mb-2">
                <SidebarGroupHeading tone={group.tone ?? 'default'} testId={groupTestId}>
                  {group.label}
                </SidebarGroupHeading>
                <ul className="space-y-0.5">
                  {group.items.map((item) => (
                    <Fragment key={getKey(item)}>{renderRow(item)}</Fragment>
                  ))}
                </ul>
              </div>
            ))
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
    <SidebarDrawer open={drawer.open} onClose={drawer.onClose} label={drawer.label}>
      {panel}
    </SidebarDrawer>
  ) : (
    panel
  )
}
