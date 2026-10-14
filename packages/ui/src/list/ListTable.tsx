import { createContext, type ReactNode, useContext } from 'react'
import { AppLink } from '../components/AppLink'
import { Checkbox } from '../components/Checkbox'
import { positionKeys } from '../components/keys'
import { useStrings } from '../components/Provider'
import { LoadingRegion, Skeleton } from '../components/Skeleton'
import { Table } from '../components/Table'
import { cx } from '../cx'
import { ErrorIcon } from '../icons'

const NAME_TEXT = 'font-medium text-[13px] leading-tight text-(--theme-app) truncate'
const SUBTITLE_TEXT = 'text-xs leading-tight text-(--theme-muted-text-color) truncate'

/** table-auto; the name column has a min-width floor so it can't be crushed.
 *  The header row sticks as the rows scroll, so the list's scrolling box
 *  (`ListPage`'s body) scrolls it sideways too. */
export const listTableProps = {
  borderless: true,
  stickyHeader: true,
  panel: false,
  rounded: false,
  // Opaque, as the rows scroll under it.
  theadClassName: 'bg-(--theme-app-bg) text-(--theme-muted-text-color)',
  tbodyClassName: 'divide-y border-b border-(--theme-border) divide-(--theme-border)',
  className:
    'table-auto w-full [&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4',
} as const

/** Widths come only from the header row, so a windowed body cannot shift the
 *  columns as different content scrolls into view. The windowed table scrolls
 *  in its own box, so its header doesn't stick. */
export const listTableFixedProps = {
  ...listTableProps,
  stickyHeader: false,
  className: listTableProps.className.replace('table-auto', 'table-fixed'),
} as const

/** True inside a `ListRow` whose name link should take the whole row's
 *  clicks: it navigates, and no selection claims plain clicks. */
export const StretchRowLinkContext = createContext(false)

// The link's box covers the row (the `ListRow`'s `<tr>` is its containing
// block), so the whole row is the link: it opens in a new tab, shows its URL
// and reads as a link, where a row click handler could do none of these. Its
// focus ring follows, drawn around the row.
const STRETCHED_LINK =
  "after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-(--theme-link)"

export function NameCell({
  icon,
  name,
  subtitle,
  href,
  badge,
  title,
  children,
}: {
  icon: ReactNode
  name: string
  subtitle?: string | undefined
  /** The name's link. Inside a `ListRow` with an `href`, the whole row is
   *  this link, so give both the same URL. */
  href: string | null
  badge?: ReactNode
  title?: string | undefined
  /** More under the name, outside its link: where a stacked column shows on a
   * narrow container (see `ColumnDef.stack`). */
  children?: ReactNode
}) {
  const stretch = useContext(StretchRowLinkContext)
  const inner = (
    <>
      {icon}
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <div
            className={cx(NAME_TEXT, href && 'group-hover/namecell:text-(--theme-link)')}
            title={title}
          >
            {name}
          </div>
          {badge}
        </div>
        {subtitle && <div className={SUBTITLE_TEXT}>{subtitle}</div>}
      </div>
    </>
  )
  return (
    <Table.Item className="py-2.5">
      {href ? (
        <AppLink
          href={href}
          data-row-link={stretch || undefined}
          className={cx(
            'group/namecell flex items-center gap-2.5 min-w-0 cursor-pointer',
            stretch && STRETCHED_LINK,
          )}
        >
          {inner}
        </AppLink>
      ) : (
        <div className="flex items-center gap-2.5 min-w-0">{inner}</div>
      )}
      {/* Lined up with the name, past the icon (h-5 w-5 and the gap-2.5 beside it). */}
      {children && <div className="pl-[1.875rem]">{children}</div>}
    </Table.Item>
  )
}

export function GroupRow({
  label,
  count,
  colSpan,
}: {
  label: string
  count: number
  colSpan: number
}) {
  return (
    <tr>
      <td colSpan={colSpan} className="bg-(--theme-muted-panel-bg) py-1.5 text-xs font-medium">
        <span className="text-(--theme-app)">{label}</span>
        <span className="mx-1.5 opacity-50">·</span>
        <span className="text-(--theme-muted-text-color)">{count}</span>
      </td>
    </tr>
  )
}

export function ListError({
  error,
  noun,
}: {
  error: unknown
  /** What failed to load, as the heading names it: "Couldn't load clusters". */
  noun?: string | undefined
}) {
  const { list: t } = useStrings()
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message)
      : undefined
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <ErrorIcon aria-hidden="true" className="h-10 w-10 text-(--theme-error)" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-(--theme-app)">{t.couldNotLoad(noun ?? t.data)}</p>
        {message && <p className="max-w-md text-xs text-(--theme-muted-text-color)">{message}</p>}
      </div>
    </div>
  )
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <LoadingRegion className="divide-y border-b border-(--theme-border) divide-(--theme-border)">
      {positionKeys(rows, 'skeleton').map((key) => (
        <div key={key} className="flex items-center gap-3 px-4 py-2.5">
          <Skeleton width={20} height={20} />
          <div className="space-y-1.5">
            <Skeleton width={160} height={12} />
            <Skeleton width={96} height={10} />
          </div>
          <Skeleton width={80} height={12} className="ml-auto" />
        </div>
      ))}
    </LoadingRegion>
  )
}

/** Prevents the name column from being crushed under table-auto layout during horizontal overflow. */
export const NAME_MIN_WIDTH_PX = 200

/** Trailing cell geometry: icon-button size + gap + padding, sized to fit exactly its pinned buttons. */
const ACTION_BUTTON_PX = 24
const ACTION_GAP_PX = 2
const ACTIONS_CELL_PAD_PX = 28

/** Width the trailing actions column reserves for `count` always-visible
 * buttons plus the hover `⋯` trigger. */
export function actionsColumnWidth(count: number): number {
  const buttons = count + 1
  return buttons * ACTION_BUTTON_PX + (buttons - 1) * ACTION_GAP_PX + ACTIONS_CELL_PAD_PX
}

/** Shared leading selection checkbox for multi-select rows: stops the row-click
 * and suppresses shift-click text selection. Wrap in <Table.Item> for `leading`. */
export function RowSelectCheckbox({
  checked,
  label,
  onToggle,
}: {
  checked: boolean
  label: string
  /** Gets the press, a click or a key, so a host can extend a range on Shift. */
  onToggle: (event: Event) => void
}) {
  return (
    <Checkbox
      aria-label={label}
      checked={checked}
      onCheckedChange={(_, details) => onToggle(details.event)}
      // The row opens on a click; ticking its box mustn't.
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => {
        if (e.shiftKey) {
          e.preventDefault()
        }
      }}
    />
  )
}

/** Sizes to fit pinned buttons + ⋯; below ~44rem only ⋯ remains. Pass a view's
 * chrome (structurally: showActions + actionsWidth) or actionCount. */
export function ListActionsHeader({
  view,
  actionCount = 0,
  className,
}: {
  view?: { showActions: boolean; actionsWidth: number }
  actionCount?: number
  className?: string
}) {
  const { common } = useStrings()
  // No actions shown → no header (ListRow drops its matching cell too).
  if (view && !view.showActions) {
    return null
  }
  const width = view ? view.actionsWidth : actionsColumnWidth(actionCount)
  return (
    <Table.Header
      caps={false}
      style={{ width, minWidth: width }}
      className={cx(
        // Below 44rem, where ListRow folds pinned buttons into ⋯, only ⋯ needs room.
        'relative py-2 text-right @max-[44rem]:w-[52px]! @max-[44rem]:min-w-[52px]!',
        className,
      )}
    >
      <span className="sr-only">{common.actions}</span>
    </Table.Header>
  )
}
// Hoisted into <thead> (see Table getHeaders).
ListActionsHeader.isTableHeader = true
