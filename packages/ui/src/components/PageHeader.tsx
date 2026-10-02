import cx from 'classnames'
import type { ComponentType, ReactNode } from 'react'
import { Fragment, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { AddIcon, ChevronRightIcon, EditIcon, MoreIcon } from '../icons'
import { type RowMenuItem, useRowMenu } from '../list/RowContextMenu'
import { AddMenu, type HeaderAddMenuItem } from './AddMenu'
import { useBreadcrumb } from './Breadcrumbs'
import { keyedByContent } from './keys'
import { useLink, useSlots, useStrings } from './Provider'
import { TOOLTIP_ID } from './Tooltip'

export interface PageHeaderBreadcrumb {
  label: string
  href?: string
}

/** A rendered crumb row entry, as handed to the breadcrumbPin slot. */
export interface PageHeaderCrumb {
  label: ReactNode
  href?: string
}

export const headerActionButtonClasses =
  'flex items-center justify-center w-6 h-6 rounded-md shrink-0 cursor-pointer text-(--theme-muted-text-color) hover:text-(--theme-app) hover:bg-(--theme-muted-panel-bg) transition-colors'
const headerAddButtonClasses =
  'inline-flex h-[26px] shrink-0 items-center gap-1.5 rounded-md border border-(--theme-border) px-2 text-xs font-medium cursor-pointer text-(--theme-muted-text-color) hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app) transition-colors'

/** With menu, the plus opens a chooser; otherwise navigates to or calls the
 * single action. `word` is the visible verb; `label` stays the full action for
 * the tooltip and screen readers. */
export function HeaderAddButton({
  to,
  onClick,
  label,
  word = 'add',
  menu,
  disabled = false,
  disabledHint,
}: {
  to?: string
  onClick?: () => void
  label: string
  word?: 'add' | 'create'
  menu?: HeaderAddMenuItem[]
  /** Button mode only. */
  disabled?: boolean
  disabledHint?: string
}) {
  const { common } = useStrings()
  const Link = useLink()
  const content = (
    <>
      <AddIcon className="w-3 h-3" />
      <span>{word === 'create' ? common.create : common.add}</span>
    </>
  )
  if (menu) {
    return (
      <AddMenu items={menu} label={label} buttonClassName={headerAddButtonClasses}>
        {content}
      </AddMenu>
    )
  }
  if (to) {
    return (
      <Link to={to} aria-label={label} title={label} className={headerAddButtonClasses}>
        {content}
      </Link>
    )
  }
  const hint = disabled ? disabledHint : undefined
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      aria-label={hint ? `${label}. ${hint}` : label}
      aria-disabled={disabled || undefined}
      {...(hint
        ? { 'data-tooltip-id': TOOLTIP_ID, 'data-tooltip-content': hint }
        : { title: label })}
      className={cx(
        headerAddButtonClasses,
        'aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-transparent aria-disabled:hover:text-(--theme-muted-text-color)',
      )}
    >
      {content}
    </button>
  )
}

export function HeaderActionMenu({
  items,
  label = 'Actions',
}: {
  items: HeaderAddMenuItem[]
  label?: string
}) {
  if (items.length === 0) {
    return null
  }
  return (
    <AddMenu items={items} label={label} buttonClassName={headerActionButtonClasses}>
      <MoreIcon className="w-3.5 h-3.5" />
    </AddMenu>
  )
}

/** The header "…" trigger for a RowMenuItem menu — same rendering (submenus,
 * destructive styling) as the list pages' right-click context menus. */
export function HeaderRowMenu({
  items,
  label = 'Actions',
}: {
  items: RowMenuItem[]
  label?: string
}) {
  const { openMenu, contextMenu } = useRowMenu()
  if (items.length === 0) {
    return null
  }
  return (
    <>
      <button
        type="button"
        aria-label={label}
        title={label}
        className={headerActionButtonClasses}
        onClick={(e) => {
          const r = e.currentTarget.getBoundingClientRect()
          openMenu(r.left, r.bottom + 4, items)
        }}
      >
        <MoreIcon className="w-3.5 h-3.5" />
      </button>
      {contextMenu}
    </>
  )
}

export function HeaderEditButton({
  to,
  onClick,
  label = 'Edit',
  disabled,
  tooltip,
}: {
  to?: string
  onClick?: () => void
  label?: string
  disabled?: boolean
  tooltip?: string | undefined
}) {
  const Link = useLink()
  const tooltipProps = tooltip
    ? { 'data-tooltip-id': TOOLTIP_ID, 'data-tooltip-content': tooltip }
    : {}
  if (to && !disabled) {
    return (
      <Link
        to={to}
        aria-label={label}
        {...(tooltip ? {} : { title: label })}
        className={headerActionButtonClasses}
        {...tooltipProps}
      >
        <EditIcon className="w-3 h-3" />
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={tooltip ? undefined : label}
      className={cx(
        headerActionButtonClasses,
        disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent',
      )}
      {...tooltipProps}
    >
      <EditIcon className="w-3 h-3" />
    </button>
  )
}

/** Renders nothing when the modern breadcrumb strip isn't mounted (classic chrome or self-headered pages). */
export function BreadcrumbsTitleAction({ children }: { children: ReactNode }) {
  const { titleActionSlot } = useBreadcrumb()
  if (!titleActionSlot) {
    return null
  }
  return createPortal(children, titleActionSlot)
}

export function BreadcrumbsRightAction({ children }: { children: ReactNode }) {
  const { rightActionSlot } = useBreadcrumb()
  if (!rightActionSlot) {
    return null
  }
  return createPortal(children, rightActionSlot)
}

const breadcrumbsActionClasses =
  'flex items-center gap-1 link text-xs whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed'

export function BreadcrumbsActionButton({
  icon: Icon,
  label,
  ariaLabel,
  to,
  onClick,
  disabled,
  tooltip,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  ariaLabel?: string
  to?: string
  onClick?: (() => void) | undefined
  disabled?: boolean
  tooltip?: string | undefined
}) {
  const Link = useLink()
  const tip = tooltip ? { 'data-tooltip-id': TOOLTIP_ID, 'data-tooltip-content': tooltip } : {}
  const content = (
    <>
      <Icon className="w-3 h-3" />
      {label}
    </>
  )
  if (to && !disabled) {
    return (
      <Link
        to={to}
        className={breadcrumbsActionClasses}
        {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
        {...tip}
      >
        {content}
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={breadcrumbsActionClasses}
      {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
      {...tip}
    >
      {content}
    </button>
  )
}

interface PageHeaderProps {
  breadcrumbs?: PageHeaderBreadcrumb[] | undefined
  title?: ReactNode
  titleAction?: ReactNode
  actions?: ReactNode
  toolbar?: ReactNode
  className?: string
  sticky?: boolean
  /** Negative offset (e.g. -top-4) prevents rows peeking above the header when the container has top padding. */
  stickyTopClassName?: string
}

export function PageHeader({
  breadcrumbs,
  title,
  titleAction,
  actions,
  toolbar,
  className,
  sticky = true,
  stickyTopClassName = 'top-0',
}: PageHeaderProps) {
  const { setHidden } = useBreadcrumb()
  const Link = useLink()
  const { breadcrumbPin, navToggle } = useSlots()
  // This header is the page's own breadcrumb trail, so keep the global strip out
  // of the way while it's mounted — pages no longer need useClearBreadcrumbs().
  useLayoutEffect(() => {
    setHidden(true)
    return () => setHidden(false)
  }, [setHidden])

  const crumbs: PageHeaderCrumb[] = [...(breadcrumbs ?? [])]
  const lastLabel = crumbs[crumbs.length - 1]?.label
  if (title !== null && title !== undefined && title !== lastLabel) {
    crumbs.push({ label: title })
  }

  const crumbRow = crumbs.length > 0 && (
    <div className="flex items-center gap-1.5 min-w-0">
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 min-w-0 text-[13px]">
        {keyedByContent(
          crumbs,
          (c) => c.href ?? (typeof c.label === 'string' ? c.label : 'crumb'),
        ).map(({ key, item: crumb }, idx) => {
          const isLast = idx === crumbs.length - 1
          if (isLast) {
            return (
              <h1
                key={key}
                className="m-0 text-[13px] font-medium leading-none text-(--theme-app) truncate"
              >
                {crumb.label}
              </h1>
            )
          }
          return (
            <Fragment key={key}>
              {crumb.href ? (
                <Link
                  to={crumb.href}
                  className="text-(--theme-muted-text-color) hover:text-(--theme-app) transition-colors cursor-pointer whitespace-nowrap"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-(--theme-muted-text-color) whitespace-nowrap">
                  {crumb.label}
                </span>
              )}
              <ChevronRightIcon className="w-3 h-3 opacity-60 shrink-0 text-(--theme-muted-text-color)" />
            </Fragment>
          )
        })}
      </nav>
      {titleAction}
      {breadcrumbPin?.({ crumbs })}
    </div>
  )
  const actionCluster = actions && (
    <div className="flex items-center gap-1.5 shrink-0">{actions}</div>
  )
  const toggle = navToggle?.()
  const hasLeading = !!crumbRow || !!toggle
  const leading = hasLeading ? (
    <div className="flex items-center gap-2 min-w-0">
      {toggle}
      {crumbRow}
    </div>
  ) : (
    <div />
  )

  return (
    <div
      className={cx(
        sticky && cx('sticky z-20', stickyTopClassName),
        'w-full bg-(--theme-app-bg)',
        className,
      )}
    >
      <div
        className={cx(
          'flex items-center justify-between gap-6 px-4 h-11',
          hasLeading && 'border-b border-(--theme-border)',
        )}
      >
        {leading}
        {actionCluster}
      </div>
      {toolbar && <div className="px-4">{toolbar}</div>}
    </div>
  )
}
