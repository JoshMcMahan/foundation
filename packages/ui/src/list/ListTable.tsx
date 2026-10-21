import { createContext, type ReactNode, useContext } from 'react'
import { AppLink } from '../components/AppLink'
import { Checkbox } from '../components/Checkbox'
import { positionKeys } from '../components/keys'
import { useStrings } from '../components/Provider'
import { LoadingRegion, Skeleton } from '../components/Skeleton'
import { CellPlacementContext, Table } from '../components/Table'
import { Tooltip } from '../components/Tooltip'
import { cx } from '../cx'
import { ErrorIcon } from '../icons'

const NAME_TEXT = 'font-medium text-[13px] leading-tight text-(--theme-app) truncate'
const SUBTITLE_TEXT = 'text-xs leading-tight text-(--theme-muted-text-color) truncate'

/** Marks a header cell of a list whose column headers are off; see `listTableProps`. */
export const HEADERS_OFF = 'list-headers-off'

/** table-auto; the name column has a min-width floor so it can't be crushed.
 *  The header row sticks as the rows scroll, so the list's scrolling box
 *  (`ListPage`'s body) scrolls it sideways too. */
export const listTableProps = {
  borderless: true,
  stickyHeader: true,
  panel: false,
  rounded: false,
  // Opaque, as the rows scroll under it. Collapsed while `ListColumns` says
  // the view's headers are off: the row still sizes the columns.
  theadClassName:
    'bg-(--theme-app-bg) text-(--theme-muted-text-color) has-[.list-headers-off]:collapse',
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
// focus ring follows, drawn around the row. Mark the link `data-row-link`.
export const STRETCHED_LINK =
  "after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-(--theme-link)"

/** The row a `STRETCHED_LINK` covers: its box, with the row's other controls
 *  raised above the link so they keep their own clicks. A checkbox is a
 *  `role="checkbox"` span, not an input, so the role names it. */
export const STRETCHED_LINK_ROW =
  'relative [&_:is(a,button,input,label,[role=checkbox]):not([data-row-link])]:relative [&_:is(a,button,input,label,[role=checkbox]):not([data-row-link])]:z-[1]'

export function NameCell({
  icon,
  iconTile = false,
  name,
  subtitle,
  href,
  badge,
  title,
  children,
}: {
  icon: ReactNode
  /** Sets the icon in a small bordered tile, so rows whose icons differ in
   *  weight, such as kinds of token or runner, still line up. The 28px tile
   *  sits beside a name and its subtitle; a row with no subtitle keeps its
   *  icon bare, centered where the tile would be, so a one-line row stays
   *  as short as its text and its name still lines up with tiled rows. */
  iconTile?: boolean | undefined
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
  // What a row stacks under its first cell goes under the name, past the icon, with `children`.
  const placed = useContext(CellPlacementContext)
  const under = placed?.after
  const hasIcon = icon !== null && icon !== undefined && icon !== false
  // The cell is a grid of the icon's column and the name's, so what stacks
  // under the name lines up with it past an icon of any width.
  const columns = hasIcon ? 'col-span-2 grid grid-cols-subgrid items-center' : 'flex items-center'
  const inner = (
    <>
      {hasIcon &&
        (iconTile && subtitle ? (
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-(--theme-border) text-(--theme-muted-text-color) [&>svg]:size-3.5">
            {icon}
          </span>
        ) : iconTile ? (
          <span className="flex w-7 shrink-0 items-center justify-center text-(--theme-muted-text-color) [&>svg]:size-3.5">
            {icon}
          </span>
        ) : (
          icon
        ))}
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
  const cell = (
    <Table.Item className="py-2.5">
      <div
        className={cx(
          'grid min-w-0',
          hasIcon ? 'grid-cols-[auto_minmax(0,1fr)] gap-x-2.5' : 'grid-cols-[minmax(0,1fr)]',
        )}
      >
        {href ? (
          <AppLink
            href={href}
            data-row-link={stretch || undefined}
            className={cx(
              'group/namecell min-w-0 cursor-pointer',
              columns,
              stretch && STRETCHED_LINK,
            )}
          >
            {inner}
          </AppLink>
        ) : (
          <div className={cx('min-w-0', columns)}>{inner}</div>
        )}
        {(!!children || !!under) && (
          <div className={hasIcon ? 'col-start-2 min-w-0' : 'min-w-0'}>
            {children}
            {under}
          </div>
        )}
      </div>
    </Table.Item>
  )
  // The cell keeps the column's classes; what follows its own is shown here instead.
  return placed?.after ? (
    <CellPlacementContext value={{ ...placed, after: undefined }}>{cell}</CellPlacementContext>
  ) : (
    cell
  )
}

/** A row's column text: muted 13px, or monospace for an ID, a path or a
 *  hash. The style sits on the text rather than the cell, so it carries over
 *  when a narrow list stacks the column under the name. Text wider than its
 *  column is cut off with an ellipsis, and shows whole in a tooltip. */
export function ListCellText({
  mono = false,
  className,
  children,
}: {
  mono?: boolean | undefined
  className?: string | undefined
  children: ReactNode
}) {
  const text = (
    <span
      className={cx(
        'block min-w-0 truncate text-(--theme-muted-text-color)',
        mono ? 'font-mono text-xs' : 'text-[13px]',
        className,
      )}
    >
      {children}
    </span>
  )
  return typeof children === 'string' || typeof children === 'number' ? (
    <Tooltip content={children} overflowOnly>
      {text}
    </Tooltip>
  ) : (
    text
  )
}

/** Says a list couldn't load. It never shows the error's own text, which is
 *  the server's words, in its language and not written for the reader. */
export function ListError({
  noun,
  message,
}: {
  /** What failed. It is not shown: pass `message` to say what went wrong. */
  error?: unknown
  /** What failed to load, as the heading names it: "Couldn't load clusters". */
  noun?: string | undefined
  /** What went wrong, in the reader's words, such as the host's own text for the error.
   *  Defaults to a generic line from the strings. */
  message?: ReactNode
}) {
  const { list: t } = useStrings()
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <ErrorIcon aria-hidden="true" className="h-10 w-10 text-(--theme-error)" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-(--theme-app)">{t.couldNotLoad(noun ?? t.data)}</p>
        <p className="max-w-md text-xs text-(--theme-muted-text-color)">
          {message ?? t.couldNotLoadHint}
        </p>
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
/** The lane of a row whose only action is a `⋯` shown on hover. With a mouse
 *  it claims no width: the `⋯` floats over the row's end while hovered, so
 *  the last column ends at the list's edge as the first starts at it, and the
 *  lane's 4px makes up that column's padding to the edge's 16px. On a touch
 *  screen, where the `⋯` always shows, the lane keeps its width. */
export const FLOATING_ACTIONS_LANE =
  'pointer-fine:w-0! pointer-fine:min-w-0! pointer-fine:pl-0! pointer-fine:pr-1!'

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

/** The selection column's header: a checkbox that ticks every row, mixed while
 *  only some are. `onToggle` selects them all, or clears them once all are. */
export function ListSelectAllHeader({
  selected,
  total,
  onToggle,
}: {
  /** How many rows are selected. */
  selected: number
  /** How many rows there are to select. */
  total: number
  onToggle: () => void
}) {
  const t = useStrings().list
  const all = total > 0 && selected >= total
  return (
    <Table.Header caps={false} className="w-10">
      <Checkbox
        aria-label={t.selectAll}
        checked={all}
        indeterminate={selected > 0 && !all}
        disabled={total === 0}
        onCheckedChange={() => onToggle()}
      />
    </Table.Header>
  )
}
// Hoisted into <thead> (see Table getHeaders).
ListSelectAllHeader.isTableHeader = true

/** Sizes to fit pinned buttons + ⋯; below ~44rem only ⋯ remains. Pass a view's
 * chrome (structurally: showActions + actionsWidth) or actionCount. */
export function ListActionsHeader({
  view,
  actionCount = 0,
  className,
}: {
  view?: { showActions: boolean; actionsWidth: number; alwaysShowActions?: boolean }
  actionCount?: number
  className?: string
}) {
  const { common } = useStrings()
  // No actions shown → no header (ListRow drops its matching cell too).
  if (view && !view.showActions) {
    return null
  }
  const width = view ? view.actionsWidth : actionsColumnWidth(actionCount)
  const floating = !!view && !view.alwaysShowActions && view.actionsWidth === actionsColumnWidth(0)
  return (
    <Table.Header
      caps={false}
      style={{ width, minWidth: width }}
      className={cx(
        // Below 44rem, where ListRow folds pinned buttons into ⋯, only ⋯ needs room.
        'relative py-2 text-right @max-[44rem]:w-[52px]! @max-[44rem]:min-w-[52px]!',
        floating && FLOATING_ACTIONS_LANE,
        className,
      )}
    >
      <span className="sr-only">{common.actions}</span>
    </Table.Header>
  )
}
// Hoisted into <thead> (see Table getHeaders).
ListActionsHeader.isTableHeader = true
