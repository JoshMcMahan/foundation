import cx from 'classnames'
import type { MouseEvent as ReactMouseEvent, ReactNode } from 'react'
import { positionKeys } from '../components/keys'
import { useLink, useStrings } from '../components/Provider'
import { Table } from '../components/Table'
import { ErrorIcon } from '../icons'

const NAME_TEXT = 'font-medium text-[13px] leading-tight text-(--theme-app) truncate'
const SUBTITLE_TEXT = 'text-xs leading-tight text-(--theme-muted-text-color) truncate'

/** table-auto + horizontal scroll; the name column has a min-width floor so it can't be crushed. */
export const listTableProps = {
  borderless: true,
  panel: false,
  rounded: false,
  theadClassName: 'text-(--theme-muted-text-color)',
  tbodyClassName: 'divide-y border-b border-(--theme-border) divide-(--theme-border)',
  className:
    'table-auto w-full [&_td:first-child]:pl-4 [&_th:first-child]:pl-4 [&_td:last-child]:pr-4 [&_th:last-child]:pr-4',
} as const

/** Widths come only from the header row, so a windowed body cannot shift the
 *  columns as different content scrolls into view. */
export const listTableFixedProps = {
  ...listTableProps,
  className: listTableProps.className.replace('table-auto', 'table-fixed'),
} as const

export function NameCell({
  icon,
  name,
  subtitle,
  href,
  badge,
  title,
}: {
  icon: ReactNode
  name: string
  subtitle?: string | undefined
  href: string | null
  badge?: ReactNode
  title?: string | undefined
}) {
  const Link = useLink()
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
        <Link to={href} className="group/namecell flex items-center gap-2.5 min-w-0 cursor-pointer">
          {inner}
        </Link>
      ) : (
        <div className="flex items-center gap-2.5 min-w-0">{inner}</div>
      )}
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

export function ListError({ error, noun = 'data' }: { error: unknown; noun?: string }) {
  const { list: t } = useStrings()
  const message =
    error && typeof error === 'object' && 'message' in error
      ? String((error as { message?: unknown }).message)
      : undefined
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-center">
      <ErrorIcon className="h-10 w-10 text-red-400 opacity-80" />
      <div className="space-y-1">
        <p className="text-sm font-medium text-(--theme-app)">{t.couldNotLoad(noun)}</p>
        {message && <p className="max-w-md text-xs text-(--theme-muted-text-color)">{message}</p>}
      </div>
    </div>
  )
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  const { loading } = useStrings()
  return (
    <div
      role="status"
      aria-label={loading}
      className="divide-y border-b border-(--theme-border) divide-(--theme-border)"
    >
      {positionKeys(rows, 'skeleton').map((key) => (
        <div
          key={key}
          aria-hidden="true"
          className="flex items-center gap-3 px-4 py-2.5 animate-pulse"
        >
          <div className="h-5 w-5 rounded bg-(--theme-muted-panel-bg)" />
          <div className="space-y-1.5">
            <div className="h-3 w-40 rounded bg-(--theme-muted-panel-bg)" />
            <div className="h-2.5 w-24 rounded bg-(--theme-muted-panel-bg)" />
          </div>
          <div className="ml-auto h-3 w-20 rounded bg-(--theme-muted-panel-bg)" />
        </div>
      ))}
      <span className="sr-only">{loading}</span>
    </div>
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
  onToggle: (e: ReactMouseEvent) => void
}) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={() => {}}
      onClick={(e) => {
        e.stopPropagation()
        onToggle(e)
      }}
      onMouseDown={(e) => {
        if (e.shiftKey) {
          e.preventDefault()
        }
      }}
      className="h-4 w-4 shrink-0 rounded border-(--theme-border) text-blue-500 focus:ring-blue-500 focus:ring-offset-0 cursor-pointer"
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
        'relative py-2 text-right @max-[43rem]:w-[52px]! @max-[43rem]:min-w-[52px]!',
        className,
      )}
    >
      <span className="sr-only">Actions</span>
    </Table.Header>
  )
}
// Hoisted into <thead> (see Table getHeaders).
ListActionsHeader.isTableHeader = true
