import type { ReactElement, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { Children, cloneElement, createContext, isValidElement, useContext, useMemo } from 'react'
import type { OpenMenu } from '../components/ContextMenu'
import {
  isMenuDivider,
  isMenuSubmenu,
  type MenuEntry,
  useRunAction,
  warnIfInert,
} from '../components/MenuEntries'
import { useLink, useNavigation } from '../components/Provider'
import { Table } from '../components/Table'
import { Tooltip } from '../components/Tooltip'
import { cx } from '../cx'
import { ListActionsHeader, NAME_MIN_WIDTH_PX } from './ListTable'
import type { ListView, ListViewChrome } from './listView'
import { MoreButton, type RowAction, rowContextMenuProps, useRowMenuActive } from './rowMenu'

/** Whether the shell adds pt-4 padding that the edge-to-edge list must cancel with a negative margin. */
const SECTION_SHELL_PADDED = {
  main: false,
  kubernetes: false,
  admin: true,
  org: true,
} as const

export type ListSection = keyof typeof SECTION_SHELL_PADDED

/** Defaults mean rows outside a ListView fully show actions (no view = show everything). */
const RowActionsContext = createContext<{
  show: boolean
  always: boolean
  columnClasses: string[]
  columnStacks: boolean[]
}>({ show: true, always: false, columnClasses: [], columnStacks: [] })

function useRowActions(view?: ListViewChrome) {
  return useMemo(
    () => ({
      show: view?.showActions ?? true,
      always: view?.alwaysShowActions ?? false,
      columnClasses: view?.columnClasses ?? [],
      columnStacks: view?.columnStacks ?? [],
    }),
    [view?.showActions, view?.alwaysShowActions, view?.columnClasses, view?.columnStacks],
  )
}

export function ListRowActionsProvider({
  view,
  children,
}: {
  view?: ListViewChrome | undefined
  children: ReactNode
}) {
  const rowActions = useRowActions(view)
  return <RowActionsContext.Provider value={rowActions}>{children}</RowActionsContext.Provider>
}

export interface ListPageProps {
  section?: ListSection
  /** Force edge-to-edge negative margin for a main-shell page nested under a padded route layout. */
  shellPadded?: boolean
  /** The list's search, filters and view controls, above the rows. The page's
   *  trail and actions go in its `PageHeader`. */
  toolbar?: ReactNode
  /** Omit on pages without a list view — rows show all actions by default. */
  view?: ListViewChrome | undefined
  children: ReactNode
}

/** A list filling the page: its toolbar stays put while only the rows scroll. */
export function ListPage({
  section = 'main',
  shellPadded,
  toolbar,
  view,
  children,
}: ListPageProps) {
  const cancelShellPadding = shellPadded ?? SECTION_SHELL_PADDED[section]
  return (
    // FIXME(edge-to-edge): the negative margin cancels a padded route shell's
    // content padding (`pt-4 px-4`); drop it once list routes own a
    // zero-padding container at the layout level.
    <div className={cx('flex h-full min-h-0 flex-col', cancelShellPadding && '-m-4')}>
      {toolbar && <div className="shrink-0 px-4">{toolbar}</div>}
      {/* The list body is the @container priority columns measure to auto-hide. */}
      <div className="relative @container min-h-0 flex-1 overflow-auto">
        <ListRowActionsProvider view={view}>{children}</ListRowActionsProvider>
      </div>
    </div>
  )
}

export function ListRow({
  href,
  onActivate,
  items,
  goTo,
  openMenu,
  pinnedActions,
  selected,
  selectionActive,
  onRowSelect,
  leading,
  className,
  children,
}: {
  href: string | null
  /** Plain-click handler for rows that open something in place instead of navigating. */
  onActivate?: (() => void) | undefined
  items: MenuEntry[]
  goTo: (to: string) => void
  openMenu: OpenMenu
  /** Actions shown as buttons on the row, beside the menu. */
  pinnedActions?: RowAction[] | undefined
  className?: string
  /** Tints the whole row to mark it as part of a multi-selection. */
  selected?: boolean
  /** When multi-selection is active, plain row click toggles selection instead of navigating. */
  selectionActive?: boolean
  onRowSelect?: ((e: ReactMouseEvent) => void) | undefined
  /** Non-column cell rendered before the column cells; kept out of `children` so they stay aligned with `columns`. */
  leading?: ReactNode
  children: ReactNode
}) {
  // Hold the row's hover affordance while its menu is open — the menu overlay
  // would otherwise steal the pointer and drop `:hover`/`group-hover`.
  const { active: menuActive, openMenu: openRowMenu } = useRowMenuActive(openMenu)
  const {
    show: showActions,
    always: alwaysShowActions,
    columnClasses,
    columnStacks,
  } = useContext(RowActionsContext)

  // Apply each column's responsive class to its cell by position. toArray drops
  // the falsy `{isVisible && ...}` entries, so cells line up with columnClasses.
  const cells = Children.toArray(children)
  // A stacked column's content also rides under the first cell, shown only
  // where its own cell has given way, so it never leaves the row.
  // A cell with nothing in it (a status only some rows have) adds nothing.
  const stacked = cells.flatMap((child, i) => {
    if (i === 0 || !columnStacks[i] || !isValidElement(child)) {
      return []
    }
    const content = (child as ReactElement<{ children?: ReactNode }>).props.children
    return Children.toArray(content).length > 0 ? [content] : []
  })
  const styledCells = cells.map((child, i) => {
    const cls = columnClasses[i]
    if (!isValidElement(child) || (!cls && !(i === 0 && stacked.length > 0))) {
      return child
    }
    const el = child as ReactElement<{ className?: string; children?: ReactNode }>
    if (i === 0 && stacked.length > 0) {
      return cloneElement(el, {
        className: cx(el.props.className, cls),
        children: (
          <>
            {el.props.children}
            {stacked.map((content, j) => (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: stacked cells keep their column order
                key={j}
                className="mt-1 @[36rem]:hidden"
                data-stacked
              >
                {content}
              </div>
            ))}
          </>
        ),
      })
    }
    return cloneElement(el, { className: cx(el.props.className, cls) })
  })

  const handleRowClick = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest('a,button,input,label')) {
      return
    }
    if (selectionActive && onRowSelect) {
      onRowSelect(e)
      return
    }
    if (href) {
      goTo(href)
    } else {
      onActivate?.()
    }
  }

  // Hide the overflow "..." when every menu item is already shown as a pinned
  // action (e.g. a single pinned action) — the menu would only duplicate it.
  // A submenu (e.g. Copy) can never be pinned, so it always keeps "..." visible.
  const pinnedLabels = new Set((pinnedActions ?? []).map((a) => a.label))
  const hasOverflowItems = items.some(
    (item) => !isMenuDivider(item) && (isMenuSubmenu(item) || !pinnedLabels.has(item.label)),
  )

  return (
    <tr
      className={cx(
        'group',
        selected ? 'bg-blue-500/5' : menuActive ? 'theme-hover' : 'hover:theme-hover',
        (href || onActivate || selectionActive) && 'cursor-pointer',
        className,
      )}
      onClick={handleRowClick}
      {...rowContextMenuProps(openRowMenu, items)}
    >
      {leading}
      {styledCells}
      {/* Actions off by default (Display toggle); right-click still opens the
       * menu. Buttons are absolutely positioned so toggling them never changes
       * row height. */}
      {showActions && (
        <Table.Item className="relative py-2.5">
          <div className="absolute inset-y-0 right-0 flex items-center gap-0.5 pr-4">
            {/* Below ~44rem pinned buttons collapse into `⋯` (even with "always
             * show"), freeing their lane. */}
            {pinnedActions && pinnedActions.length > 0 && (
              <span className="hidden items-center gap-0.5 @[44rem]:flex">
                {pinnedActions.map((action) => (
                  <PinnedActionButton
                    key={action.key}
                    action={action}
                    visible={alwaysShowActions || menuActive}
                  />
                ))}
              </span>
            )}
            {/* `⋯` opens the full menu; when redundant (all items pinned) hide
             * it at ≥44rem, where the buttons show. */}
            <MoreButton
              open={menuActive}
              visible={menuActive || alwaysShowActions}
              onOpen={(button) => openRowMenu(button, items)}
              className={hasOverflowItems ? undefined : '@[44rem]:hidden'}
            />
          </div>
        </Table.Item>
      )}
    </tr>
  )
}

function PinnedActionButton({ action, visible }: { action: RowAction; visible: boolean }) {
  warnIfInert(action, 'ListPage pinned action')
  const Link = useLink()
  const runAction = useRunAction()
  const reason = action.disabled ? action.disabledReason : undefined
  const props = {
    'aria-label': reason ? `${action.label}. ${reason}` : action.label,
    className: cx(
      'rounded p-1 cursor-pointer text-(--theme-muted-text-color) transition-colors hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app) aria-disabled:cursor-not-allowed aria-disabled:opacity-20 aria-disabled:hover:bg-transparent aria-disabled:hover:text-(--theme-muted-text-color) [&>svg]:h-4 [&>svg]:w-4',
      visible ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
    ),
  }
  return (
    <Tooltip content={reason ?? action.label} side="bottom">
      {action.href && !action.disabled ? (
        <Link href={action.href} {...props}>
          {action.icon}
        </Link>
      ) : (
        <button
          type="button"
          aria-disabled={action.disabled}
          onClick={(e) => {
            e.stopPropagation()
            if (!action.disabled) {
              runAction(action)
            }
          }}
          {...props}
        >
          {action.icon}
        </button>
      )}
    </Tooltip>
  )
}

/** Name column min-width is by role, not position, so a leading checkbox doesn't shift it. */
export function ListColumns<T>({ view }: { view: ListView<T> }) {
  return (
    <>
      {view.visibleColumns.map((col, i) => (
        <Table.Header
          key={col.key}
          caps={false}
          className={cx(col.headerClassName, view.columnClasses[i])}
          style={col.alwaysVisible ? { minWidth: NAME_MIN_WIDTH_PX } : undefined}
        >
          {col.label}
        </Table.Header>
      ))}
      <ListActionsHeader view={view} />
    </>
  )
}
// Hoisted into <thead> (see Table getHeaders).
ListColumns.isTableHeader = true

/** Stable `goTo` for whole-row navigation (`rowNavProps`, `ListRow`). */
export function useListNavigate() {
  return useNavigation().goTo
}
