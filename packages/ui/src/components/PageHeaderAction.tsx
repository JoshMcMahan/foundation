import type { ComponentType, ReactNode } from 'react'
import { cx } from '../cx'
import { AddIcon, MoreIcon } from '../icons'
import { ActionMenu } from './ActionMenu'
import { buttonClasses } from './buttonClasses'
import type { MenuEntry } from './MenuEntries'
import { useLink, useStrings } from './Provider'
import { Tooltip } from './Tooltip'

type Target =
  | { href: string; external?: boolean | undefined; onClick?: never; menu?: never }
  | { onClick: () => void; href?: never; external?: never; menu?: never }
  | { menu: MenuEntry[]; href?: never; external?: never; onClick?: never }

interface ControlProps {
  /** The accessible name. */
  name: string
  /** Shown on hover and focus while the control can be pressed. */
  tooltip: string | undefined
  disabled: boolean
  /** Why it can't be pressed: the tooltip while disabled, and part of its name. */
  disabledReason: string | undefined
  pressed?: boolean | undefined
  className: string
  children: ReactNode
}

/**
 * The one control under every header action, so links, buttons and menus share
 * the look, the disabled behavior and the tooltip. A disabled control stays
 * focusable (`aria-disabled`, not `disabled`), so its reason is reachable by
 * keyboard and pointer, where a disabled button would swallow both.
 */
function HeaderControl({
  name,
  tooltip,
  disabled,
  disabledReason,
  pressed,
  className,
  children,
  href,
  external,
  onClick,
  menu,
}: ControlProps & Partial<Target>) {
  const Link = useLink()
  const { common } = useStrings()
  if (menu && !disabled) {
    return (
      <ActionMenu items={menu} label={name} triggerClassName={className}>
        {children}
      </ActionMenu>
    )
  }
  if (href && !disabled) {
    return (
      <Tooltip content={tooltip}>
        {external ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${name} (${common.opensInNewTab})`}
            className={className}
          >
            {children}
          </a>
        ) : (
          <Link href={href} aria-label={name} className={className}>
            {children}
          </Link>
        )}
      </Tooltip>
    )
  }
  const reason = disabled ? disabledReason : undefined
  return (
    <Tooltip content={disabled ? (disabledReason ?? tooltip) : tooltip}>
      <button
        type="button"
        onClick={disabled ? undefined : onClick}
        aria-label={reason ? `${name}. ${reason}` : name}
        aria-disabled={disabled || undefined}
        aria-pressed={pressed}
        className={className}
      >
        {children}
      </button>
    </Tooltip>
  )
}

export type PageHeaderActionProps = Target & {
  icon: ComponentType<{ className?: string }>
  /** The visible text, or with `iconOnly` the name its tooltip shows. */
  label: string
  /** A fuller name for assistive technology than the visible label, such as
   *  "Save organization flags" for "Save". */
  ariaLabel?: string | undefined
  /** The icon alone, named by its tooltip, such as an edit pencil beside the title. */
  iconOnly?: boolean | undefined
  disabled?: boolean | undefined
  disabledReason?: string | undefined
  /** A hint shown on hover and focus while it can be pressed. */
  tooltip?: string | undefined
  /** In the error color, as a destructive menu entry is, for an action that
   *  removes or breaks something. */
  destructive?: boolean | undefined
  /** A toggle's state, such as a favorite: set, it reads as pressed. Buttons only. */
  pressed?: boolean | undefined
}

/**
 * An action in the page header: a link (`href`, `external` for a new tab), a
 * button (`onClick`) or a menu (`menu`). Labeled actions read in the link
 * color, so the page's commands stand apart from the trail.
 */
export function PageHeaderAction({
  icon: Icon,
  label,
  ariaLabel,
  iconOnly = false,
  disabled = false,
  disabledReason,
  tooltip,
  destructive = false,
  pressed,
  ...target
}: PageHeaderActionProps) {
  // The tone colors the icon and label rather than the control, so it can't
  // lose to the button recipe's own text color by stylesheet order.
  const tone = destructive
    ? '*:text-(--theme-error-text)'
    : iconOnly
      ? undefined
      : '*:text-(--theme-link)'
  return (
    <HeaderControl
      {...target}
      name={ariaLabel ?? label}
      // The label folds away in a narrow bar, so the tooltip carries it.
      tooltip={tooltip ?? label}
      disabled={disabled}
      disabledReason={disabledReason}
      pressed={pressed}
      className={cx(buttonClasses({ variant: 'ghost', size: 'xs', iconOnly }), tone)}
    >
      <Icon />
      {!iconOnly && <span className="@max-md:sr-only">{label}</span>}
    </HeaderControl>
  )
}

export type PageHeaderAddButtonProps = Target & {
  /** The full action, such as "New cluster": the tooltip and accessible name. */
  label: string
  /** The visible verb. */
  word?: 'add' | 'create' | undefined
  disabled?: boolean | undefined
  disabledReason?: string | undefined
}

/** The page's "+ Add" or "+ Create": with `menu`, a chooser of what to make. */
export function PageHeaderAddButton({
  label,
  word = 'add',
  disabled = false,
  disabledReason,
  ...target
}: PageHeaderAddButtonProps) {
  const { common } = useStrings()
  return (
    <HeaderControl
      {...target}
      name={label}
      tooltip={label}
      disabled={disabled}
      disabledReason={disabledReason}
      className={buttonClasses({ variant: 'outline', size: 'xs' })}
    >
      <AddIcon />
      <span className="@max-md:sr-only">{word === 'create' ? common.create : common.add}</span>
    </HeaderControl>
  )
}

/** The "…" menu of actions on the page's subject. Renders nothing without items. */
export function PageHeaderMenu({
  items,
  label,
}: {
  items: MenuEntry[]
  /** Defaults to the strings' "Actions". */
  label?: string | undefined
}) {
  const { common } = useStrings()
  if (items.length === 0) {
    return null
  }
  return <PageHeaderAction icon={MoreIcon} iconOnly label={label ?? common.actions} menu={items} />
}
