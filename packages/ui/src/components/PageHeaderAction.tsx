import {
  type ComponentType,
  type ReactNode,
  use,
  useId,
  useLayoutEffect,
  useSyncExternalStore,
} from 'react'
import { cx } from '../cx'
import { AddIcon, MoreIcon } from '../icons'
import { ActionMenu } from './ActionMenu'
import { AppLink } from './AppLink'
import { buttonClasses } from './buttonClasses'
import { HeaderActionsFitContext } from './headerActionsFit'
import { Loader } from './Loader'
import type { MenuEntry } from './MenuEntries'
import { useStrings } from './Provider'
import { Tooltip } from './Tooltip'

type Target =
  | {
      href: string
      external?: boolean | undefined
      /** Loads the page instead of routing, for paths the host's router doesn't serve. */
      reloadDocument?: boolean | undefined
      onClick?: never
      menu?: never
    }
  | { onClick: () => void; href?: never; external?: never; reloadDocument?: never; menu?: never }
  | { menu: MenuEntry[]; href?: never; external?: never; reloadDocument?: never; onClick?: never }

interface ControlProps {
  /** The accessible name. */
  name: string
  /** Shown on hover and focus while the control can be pressed. */
  tooltip: string | undefined
  disabled: boolean
  /** Why it can't be pressed: the tooltip while disabled, and part of its name. */
  disabledReason: string | undefined
  /** Busy with what it started: it keeps focus and can't be pressed again. */
  loading?: boolean | undefined
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
  loading = false,
  pressed,
  className,
  children,
  href,
  external,
  reloadDocument,
  onClick,
  menu,
}: ControlProps & Partial<Target>) {
  const { common } = useStrings()
  if (menu && !disabled && !loading) {
    return (
      <ActionMenu items={menu} label={name} triggerClassName={className}>
        {children}
      </ActionMenu>
    )
  }
  const reason = disabled ? disabledReason : undefined
  if (href) {
    // A disabled link stays a link, with no href, so its reason is still reachable.
    return (
      <Tooltip content={disabled ? (disabledReason ?? tooltip) : tooltip}>
        <AppLink
          href={href}
          reloadDocument={reloadDocument}
          target={external ? '_blank' : undefined}
          disabled={disabled || loading}
          aria-busy={loading || undefined}
          aria-label={
            reason ? `${name}. ${reason}` : external ? `${name} ${common.opensInNewTab}` : name
          }
          className={className}
        >
          {children}
        </AppLink>
      </Tooltip>
    )
  }
  return (
    <Tooltip content={disabled ? (disabledReason ?? tooltip) : tooltip}>
      <button
        type="button"
        onClick={disabled || loading ? undefined : onClick}
        aria-label={reason ? `${name}. ${reason}` : name}
        aria-disabled={disabled || loading || undefined}
        aria-busy={loading || undefined}
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
  /** Busy with what it started, such as a run starting: a spinner takes the
   *  icon's place, and it keeps focus but can't be pressed again until done. */
  loading?: boolean | undefined
}

/**
 * An action in the page header: a link (`href`, `external` for a new tab,
 * `reloadDocument` for a path the router doesn't serve), a
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
  loading = false,
  ...target
}: PageHeaderActionProps) {
  // The tone colors the icon and label rather than the control, so it can't
  // lose to the button recipe's own text color by stylesheet order.
  const tone = destructive
    ? '*:text-(--theme-error-text)'
    : iconOnly
      ? undefined
      : '*:text-(--theme-link)'
  const icon = loading ? <Loader inline decorative size="1em" /> : <Icon />
  return (
    <Fitted
      entry={menuRow({
        label: ariaLabel ?? label,
        icon,
        disabled: disabled || loading,
        disabledReason,
        destructive,
        pressed,
        target,
      })}
    >
      <HeaderControl
        {...target}
        name={ariaLabel ?? label}
        // The label folds away in a narrow bar, so the tooltip carries it.
        tooltip={tooltip ?? label}
        disabled={disabled}
        disabledReason={disabledReason}
        loading={loading}
        pressed={pressed}
        className={cx(buttonClasses({ variant: 'ghost', size: 'xs', iconOnly }), tone)}
      >
        {icon}
        {!iconOnly && <span className="@max-md:sr-only">{label}</span>}
      </HeaderControl>
    </Fitted>
  )
}

/** An action as a row of the header's "…" menu, for when the bar has no room for it. */
function menuRow({
  label,
  icon,
  disabled,
  disabledReason,
  destructive,
  pressed,
  target,
}: {
  label: string
  icon: ReactNode
  disabled: boolean
  disabledReason: string | undefined
  destructive?: boolean | undefined
  pressed?: boolean | undefined
  target: Target
}): MenuEntry {
  const shared = { label, icon, disabled, disabledReason, destructive }
  if (target.menu) {
    // A menu of its own becomes a submenu, unless it can't be opened now.
    return disabled ? { ...shared, onClick: () => {} } : { label, icon, items: target.menu }
  }
  if (target.href) {
    return {
      ...shared,
      href: target.href,
      reloadDocument: target.reloadDocument,
      target: target.external ? '_blank' : undefined,
    }
  }
  return { ...shared, onClick: target.onClick ?? (() => {}), checked: pressed }
}

/**
 * Lets an action in the header's `actions` move into the bar's "…" menu when
 * the bar runs out of room: it registers its menu row, and hides while it has
 * moved. Anywhere else, such as among the title actions, it is the action alone.
 */
function Fitted({ entry, children }: { entry: MenuEntry; children: ReactNode }) {
  const fit = use(HeaderActionsFitContext)
  const id = useId()
  useLayoutEffect(() => {
    fit?.register(id, entry)
  })
  useLayoutEffect(() => (fit ? () => fit.unregister(id) : undefined), [fit, id])
  const moved = useSyncExternalStore(
    fit?.subscribe ?? subscribeNever,
    () => fit?.isOverflowed(id) ?? false,
    () => false,
  )
  if (!fit) {
    return children
  }
  // `contents` leaves the action the bar's flex item; the bar measures it through this.
  return (
    <span data-header-action={id} hidden={moved} className={moved ? undefined : 'contents'}>
      {children}
    </span>
  )
}

const subscribeNever = () => () => {}

export type PageHeaderAddButtonProps = Target & {
  /** The full action, such as "New cluster": the tooltip and accessible name. */
  label: string
  /** The visible verb. */
  word?: 'add' | 'create' | undefined
  disabled?: boolean | undefined
  disabledReason?: string | undefined
  /** Busy making it: a spinner takes the plus's place, and it can't be pressed again until done. */
  loading?: boolean | undefined
}

/** The page's "+ Add" or "+ Create": with `menu`, a chooser of what to make. */
export function PageHeaderAddButton({
  label,
  word = 'add',
  disabled = false,
  disabledReason,
  loading = false,
  ...target
}: PageHeaderAddButtonProps) {
  const { common } = useStrings()
  const icon = loading ? <Loader inline decorative size="1em" /> : <AddIcon />
  return (
    <Fitted
      entry={menuRow({
        label,
        icon,
        disabled: disabled || loading,
        disabledReason,
        target,
      })}
    >
      <HeaderControl
        {...target}
        name={label}
        tooltip={label}
        disabled={disabled}
        disabledReason={disabledReason}
        loading={loading}
        className={buttonClasses({ variant: 'outline', size: 'xs' })}
      >
        {icon}
        <span className="@max-md:sr-only">{word === 'create' ? common.create : common.add}</span>
      </HeaderControl>
    </Fitted>
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
