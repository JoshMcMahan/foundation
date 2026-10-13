import type { ComponentType, ReactNode } from 'react'
import { Fragment, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { cx } from '../cx'
import { AddIcon, ChevronRightIcon, EditIcon, MoreIcon } from '../icons'
import { ActionMenu } from './ActionMenu'
import { useBreadcrumb } from './Breadcrumbs'
import { buttonClasses } from './buttonClasses'
import { keyedByContent } from './keys'
import type { MenuEntry } from './MenuEntries'
import { useLink, useSlots, useStrings } from './Provider'
import { Tooltip } from './Tooltip'

export interface PageHeaderBreadcrumb {
  label: string
  href?: string
}

/** A rendered crumb row entry, as handed to the breadcrumbPin slot. */
export interface PageHeaderCrumb {
  label: ReactNode
  href?: string
}

const headerActionButtonClasses = buttonClasses({ variant: 'ghost', size: 'xs', iconOnly: true })
const headerAddButtonClasses = buttonClasses({ variant: 'outline', size: 'xs' })

/** With menu, the plus opens a chooser; otherwise navigates to or calls the
 * single action. `word` is the visible verb; `label` stays the full action for
 * the tooltip and screen readers. */
export function HeaderAddButton({
  href,
  onClick,
  label,
  word = 'add',
  menu,
  disabled = false,
  disabledHint,
}: {
  href?: string
  onClick?: () => void
  label: string
  word?: 'add' | 'create'
  menu?: MenuEntry[]
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
      <ActionMenu items={menu} label={label} triggerClassName={headerAddButtonClasses}>
        {content}
      </ActionMenu>
    )
  }
  if (href) {
    return (
      <Tooltip content={label}>
        <Link href={href} aria-label={label} className={headerAddButtonClasses}>
          {content}
        </Link>
      </Tooltip>
    )
  }
  const hint = disabled ? disabledHint : undefined
  return (
    <Tooltip content={hint ?? label}>
      <button
        type="button"
        onClick={disabled ? undefined : onClick}
        aria-label={hint ? `${label}. ${hint}` : label}
        aria-disabled={disabled || undefined}
        className={headerAddButtonClasses}
      >
        {content}
      </button>
    </Tooltip>
  )
}

/** The header's "…" menu of actions on the page's subject. */
export function HeaderActionMenu({ items, label }: { items: MenuEntry[]; label?: string }) {
  const { common } = useStrings()
  if (items.length === 0) {
    return null
  }
  return (
    <ActionMenu
      items={items}
      label={label ?? common.actions}
      triggerClassName={headerActionButtonClasses}
    >
      <MoreIcon className="w-3.5 h-3.5" />
    </ActionMenu>
  )
}

export function HeaderEditButton({
  href,
  onClick,
  label: labelProp,
  disabled,
  tooltip,
}: {
  href?: string
  onClick?: () => void
  label?: string
  disabled?: boolean
  tooltip?: string | undefined
}) {
  const Link = useLink()
  const { common } = useStrings()
  const label = labelProp ?? common.edit
  return (
    <Tooltip content={tooltip ?? label}>
      {href && !disabled ? (
        <Link href={href} aria-label={label} className={headerActionButtonClasses}>
          <EditIcon className="w-3 h-3" />
        </Link>
      ) : (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          aria-label={label}
          className={headerActionButtonClasses}
        >
          <EditIcon className="w-3 h-3" />
        </button>
      )}
    </Tooltip>
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
  href,
  onClick,
  disabled,
  tooltip,
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  ariaLabel?: string
  href?: string
  onClick?: (() => void) | undefined
  disabled?: boolean
  tooltip?: string | undefined
}) {
  const Link = useLink()
  const content = (
    <>
      <Icon className="w-3 h-3" />
      {label}
    </>
  )
  return (
    <Tooltip content={tooltip}>
      {href && !disabled ? (
        <Link href={href} className={breadcrumbsActionClasses} aria-label={ariaLabel}>
          {content}
        </Link>
      ) : (
        <button
          type="button"
          onClick={onClick}
          disabled={disabled}
          className={breadcrumbsActionClasses}
          aria-label={ariaLabel}
        >
          {content}
        </button>
      )}
    </Tooltip>
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
  const { common } = useStrings()
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
      <nav aria-label={common.breadcrumb} className="flex items-center gap-2 min-w-0 text-[13px]">
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
                  href={crumb.href}
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
        sticky && cx('sticky z-(--layer-header)', stickyTopClassName),
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
