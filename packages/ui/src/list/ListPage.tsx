import cx from 'classnames'
import type { ReactElement, MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { Children, cloneElement, createContext, isValidElement, useContext, useMemo } from 'react'
import { PageHeader, type PageHeaderBreadcrumb } from '../components/PageHeader'
import { useNavigation } from '../components/Provider'
import { Table } from '../components/Table'
import { TOOLTIP_ID } from '../components/Tooltip'
import { ListActionsHeader, NAME_MIN_WIDTH_PX } from './ListTable'
import type { ListView, ListViewChrome } from './listView'
import {
  MoreButton,
  type OpenMenu,
  type RowMenuItem,
  rowContextMenuProps,
  useRowMenuActive,
} from './RowContextMenu'

/** Negative offsets (admin/org) cancel the shell's pt-4 so rows don't peek through the gap above the pinned header. */
const SECTION_STICKY_TOP = {
  main: 'top-0',
  kubernetes: 'top-0',
  admin: '-top-4',
  org: '-top-4',
} as const

/** Whether the shell adds pt-4 padding that the edge-to-edge list must cancel with a negative margin. */
const SECTION_SHELL_PADDED = {
  main: false,
  kubernetes: false,
  admin: true,
  org: true,
} as const

export type ListSection = keyof typeof SECTION_STICKY_TOP

/** Defaults mean rows outside a ListView fully show actions (no view = show everything). */
const RowActionsContext = createContext<{
  show: boolean
  always: boolean
  columnClasses: string[]
}>({ show: true, always: false, columnClasses: [] })

function useRowActions(view?: ListViewChrome) {
  return useMemo(
    () => ({
      show: view?.showActions ?? true,
      always: view?.alwaysShowActions ?? false,
      columnClasses: view?.columnClasses ?? [],
    }),
    [view?.showActions, view?.alwaysShowActions, view?.columnClasses],
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
  /** Rendered inside a route layout that already owns the page header (e.g. a
   * detail page's tab body). Skips this page's own header so the global
   * breadcrumb strip stays visible, keeping only the toolbar. */
  embedded?: boolean
  breadcrumbs?: PageHeaderBreadcrumb[] | undefined
  title?: ReactNode
  titleAction?: ReactNode
  actions?: ReactNode
  toolbar?: ReactNode
  /** Omit on pages without a list view — rows show all actions by default. */
  view?: ListViewChrome | undefined
  children: ReactNode
}

export function ListPage({
  section = 'main',
  shellPadded,
  embedded = false,
  breadcrumbs,
  title,
  titleAction,
  actions,
  toolbar,
  view,
  children,
}: ListPageProps) {
  const cancelShellPadding = shellPadded ?? SECTION_SHELL_PADDED[section]
  return (
    // Fill the shell so the header stays put and only the list body scrolls.
    // FIXME(edge-to-edge): the negative margin cancels a padded route shell's
    // content padding (`pt-4 px-4`); drop it once list routes own a
    // zero-padding container at the layout level.
    <div className={cx('flex h-full min-h-0 flex-col', cancelShellPadding && '-m-4')}>
      {embedded ? (
        toolbar && <div className="px-4 py-1.5">{toolbar}</div>
      ) : (
        <PageHeader
          stickyTopClassName={SECTION_STICKY_TOP[section]}
          breadcrumbs={breadcrumbs}
          title={title}
          titleAction={titleAction}
          actions={actions}
          toolbar={toolbar}
        />
      )}
      {/* The list body is the @container priority columns measure to auto-hide. */}
      <div className="relative @container min-h-0 flex-1 overflow-auto">
        <ListRowActionsProvider view={view}>{children}</ListRowActionsProvider>
      </div>
    </div>
  )
}

export interface PinnedRowAction {
  key: string
  label: string
  icon: ReactNode
  onSelect: () => void
  disabled?: boolean | undefined
  /** Replaces the label on hover when the action is disabled, explaining why. */
  tooltip?: string | undefined
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
  items: RowMenuItem[]
  goTo: (to: string) => void
  openMenu: OpenMenu
  pinnedActions?: PinnedRowAction[] | undefined
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
  } = useContext(RowActionsContext)

  // Apply each column's responsive class to its cell by position. toArray drops
  // the falsy `{isVisible && ...}` entries, so cells line up with columnClasses.
  const styledCells = Children.toArray(children).map((child, i) => {
    const cls = columnClasses[i]
    if (!cls || !isValidElement(child)) {
      return child
    }
    const el = child as ReactElement<{ className?: string }>
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
    (item) => item.kind !== 'divider' && (item.kind === 'submenu' || !pinnedLabels.has(item.label)),
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
                  <button
                    key={action.key}
                    type="button"
                    aria-label={action.label}
                    data-tooltip-id={TOOLTIP_ID}
                    data-tooltip-content={
                      action.disabled && action.tooltip ? action.tooltip : action.label
                    }
                    data-tooltip-place="bottom"
                    aria-disabled={action.disabled}
                    onClick={(e) => {
                      e.stopPropagation()
                      if (action.disabled) {
                        return
                      }
                      action.onSelect()
                    }}
                    className={cx(
                      'rounded p-1 cursor-pointer text-(--theme-muted-text-color) transition-colors hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app) aria-disabled:cursor-not-allowed aria-disabled:opacity-20 aria-disabled:hover:bg-transparent aria-disabled:hover:text-(--theme-muted-text-color) [&>svg]:h-4 [&>svg]:w-4',
                      alwaysShowActions || menuActive
                        ? 'opacity-100'
                        : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
                    )}
                  >
                    {action.icon}
                  </button>
                ))}
              </span>
            )}
            {/* `⋯` opens the full menu; when redundant (all items pinned) hide
             * it at ≥44rem, where the buttons show. */}
            <MoreButton
              active={menuActive || alwaysShowActions}
              onOpen={(x, y) => openRowMenu(x, y, items)}
              className={hasOverflowItems ? undefined : '@[44rem]:hidden'}
            />
          </div>
        </Table.Item>
      )}
    </tr>
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
