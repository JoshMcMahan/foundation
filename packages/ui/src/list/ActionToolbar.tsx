import { Button as BaseButton } from '@base-ui/react/button'
import { Menu } from '@base-ui/react/menu'
import { Toggle } from '@base-ui/react/toggle'
import { Toolbar } from '@base-ui/react/toolbar'
import {
  cloneElement,
  createContext,
  Fragment,
  isValidElement,
  use,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { AppLink } from '../components/AppLink'
import { buttonClasses } from '../components/buttonClasses'
import { MenuPopup, MenuSeparator } from '../components/Menu'
import { MenuEntries, useRunAction, warnIfInert } from '../components/MenuEntries'
import { useStrings } from '../components/Provider'
import { stickyClasses, useStickyTop } from '../components/stickyTop'
import { Tooltip } from '../components/Tooltip'
import { cx } from '../cx'
import { isDev } from '../dev'
import { MoreIcon } from '../icons'
import type { RowAction } from './rowMenu'

/** Where a ToolbarButton renders: one of an ActionToolbar's items, a row of its
 *  `…` menu, or a plain button with no toolbar around it. */
type Placement = 'toolbar' | 'menu' | 'alone'

// Pre-rendered element items can render a ToolbarButton, which then fits
// wherever the toolbar put the element: an item, or a row once it overflows.
const PlacementContext = createContext<Placement>('alone')

// Whether the toolbar folded this item's label to its icon to fit its row,
// which a ToolbarButton in an element item follows too.
const FoldedContext = createContext(false)

/** A toolbar button's classes: outlined unless it's the view's one primary
 *  action, so the toolbar has a hierarchy; a toggle shows its state by
 *  `aria-pressed` instead of a fill. A destructive one reads in the error
 *  color, as it does in a menu. */
function actionClasses(action: ToolbarAction, iconOnly: boolean) {
  const primary = action.primary && action.checked === undefined
  return cx(
    buttonClasses({ variant: primary ? 'primary' : 'outline', size: 'sm', iconOnly }),
    action.destructive && !primary && 'text-(--theme-error-text)',
  )
}

/** A toolbar button, which moves into the `…` menu as a row when the toolbar runs out of room. */
export type ToolbarAction = RowAction & {
  /** A hint on the enabled button. */
  tooltip?: string | undefined
  /** The one action the view leads to, filled in the accent. Give it to one
   *  action at most: the rest are outlined, so it stands out. */
  primary?: boolean | undefined
  hidden?: boolean
}

/** A pre-rendered element (e.g. a button component that owns its modal). */
interface ToolbarElement {
  key: string
  element: React.ReactNode
  hidden?: boolean
}

export type ToolbarItem = ToolbarAction | ToolbarElement

/** A toolbar action as a button: a link with `href`, a toggle with `checked`.
 *  In an ActionToolbar it is one of its items, reached with the arrow keys. */
export function ToolbarButton({ action }: { action: ToolbarAction }) {
  const placement = use(PlacementContext)
  const runAction = useRunAction()
  const folded = use(FoldedContext)
  if (placement === 'menu') {
    return <MenuEntries entries={[action]} />
  }
  warnIfInert(action, 'ActionToolbar')
  const iconOnly = Boolean(action.icon) && placement === 'toolbar' && folded
  const className = actionClasses(action, iconOnly)
  const reason = action.disabled ? action.disabledReason : undefined
  const content = (
    <>
      {action.icon}
      {/* Folded, the label stays the name, and the tooltip shows it. */}
      {iconOnly ? <span className="sr-only">{action.label}</span> : action.label}
      {/* The tooltip is only seen, so the reason is also part of the name. */}
      {reason && <span className="sr-only">. {reason}</span>}
    </>
  )
  const run = () => runAction(action)
  const inToolbar = placement === 'toolbar'
  let control: React.ReactElement
  if (action.href) {
    // A disabled link stays a link, without its href and still focusable.
    const link = (
      <AppLink
        href={action.href}
        reloadDocument={action.reloadDocument}
        target={action.target}
        disabled={action.disabled}
        className={className}
      />
    )
    control = inToolbar ? (
      <Toolbar.Link render={link}>{content}</Toolbar.Link>
    ) : (
      cloneElement(link, undefined, content)
    )
  } else if (action.checked !== undefined) {
    const toggle = (
      <Toggle
        pressed={action.checked}
        onPressedChange={run}
        disabled={action.disabled}
        className={className}
      />
    )
    control = inToolbar ? (
      <Toolbar.Button render={toggle} disabled={action.disabled}>
        {content}
      </Toolbar.Button>
    ) : (
      cloneElement(toggle, undefined, content)
    )
  } else {
    // Focusable while disabled, so keyboard users can reach the reason.
    const Control = inToolbar ? Toolbar.Button : BaseButton
    control = (
      <Control onClick={run} disabled={action.disabled} focusableWhenDisabled className={className}>
        {content}
      </Control>
    )
  }
  return (
    <Tooltip
      content={reason ?? (iconOnly ? (action.tooltip ?? action.label) : action.tooltip)}
      side="bottom"
    >
      {control}
    </Tooltip>
  )
}

function OverflowMenu({ items }: { items: ToolbarItem[][] }) {
  const { list: t } = useStrings()
  return (
    <Menu.Root>
      <Tooltip content={t.moreActions}>
        <Toolbar.Button
          render={<Menu.Trigger />}
          aria-label={t.moreActions}
          className={buttonClasses({ variant: 'outline', size: 'sm', iconOnly: true })}
          data-testid="action-toolbar-menu-button"
        >
          <MoreIcon />
        </Toolbar.Button>
      </Tooltip>
      {/* Element items own their modal state (e.g. delete confirmations), and
          opening one closes the menu, so unmounting on close would destroy it. */}
      <MenuPopup keepMounted align="end" className="min-w-56">
        <PlacementContext value="menu">
          {items.map((group, i) => (
            <Fragment key={group[0]?.key ?? i}>
              {i > 0 && <MenuSeparator />}
              {group.map((item) =>
                'element' in item ? (
                  <Fragment key={item.key}>{item.element}</Fragment>
                ) : (
                  <MenuEntries key={item.key} entries={[item]} />
                ),
              )}
            </Fragment>
          ))}
        </PlacementContext>
      </MenuPopup>
    </Menu.Root>
  )
}

/** How the toolbar fits its row: the items whose labels fold to their icons,
 *  and those moved into the `…` menu, by key. */
export interface ToolbarFit {
  folded: readonly string[]
  overflow: readonly string[]
}

const FITS_ALL: ToolbarFit = { folded: [], overflow: [] }

/** An item's widths with its label and folded to its icon. */
export interface ItemWidth {
  key: string
  full: number
  folded: number
  primary: boolean
}

// The toolbar's spacing, in pixels: gap-2.5 between groups, either side of
// their 1px separator; gap-1 between a group's items; and the size-7 `…` button.
const GROUP_GAP = 10
const SEPARATOR_WIDTH = 1
const ITEM_GAP = 4
const MENU_BUTTON_WIDTH = 28

function rowWidth(groups: ItemWidth[][], right: ItemWidth[], fit: ToolbarFit) {
  const hidden = new Set(fit.overflow)
  const folded = new Set(fit.folded)
  const width = (item: ItemWidth) => (folded.has(item.key) ? item.folded : item.full)
  const run = (items: ItemWidth[]) =>
    items.reduce((sum, item) => sum + width(item), 0) + ITEM_GAP * (items.length - 1)
  const shownGroups = groups
    .map((group) => group.filter((item) => !hidden.has(item.key)))
    .filter((group) => group.length > 0)
  let total = shownGroups.reduce((sum, group) => sum + run(group), 0)
  total += (shownGroups.length - 1) * (GROUP_GAP + SEPARATOR_WIDTH + GROUP_GAP)
  const shownRight = right.filter((item) => !hidden.has(item.key))
  const end =
    (shownRight.length > 0 ? run(shownRight) : 0) +
    (hidden.size > 0 ? MENU_BUTTON_WIDTH + (shownRight.length > 0 ? ITEM_GAP : 0) : 0)
  if (end > 0) {
    total += end + (shownGroups.length > 0 ? GROUP_GAP : 0)
  }
  return Math.max(total, 0)
}

/**
 * Fits a toolbar to `available` pixels one item at a time, stopping as soon as
 * it fits, so it keeps every label the width allows. Items go lowest priority
 * first: the right-hand ones, then the last group's, and so on, each from the
 * end. First their labels fold to their icons, one by one; then, all folded,
 * they move into the `…` menu in the same order; the primary action never
 * moves, and its label folds only once nothing else is left to try.
 */
export function fitToolbar(
  groups: ItemWidth[][],
  right: ItemWidth[],
  available: number,
): ToolbarFit {
  // Rounding in the measured widths, so a toolbar that just fits isn't folded.
  const fits = (fit: ToolbarFit) => rowWidth(groups, right, fit) <= available + 0.5
  if (fits(FITS_ALL)) {
    return FITS_ALL
  }
  const byPriority = [...right]
    .reverse()
    .concat(...[...groups].reverse().map((g) => [...g].reverse()))
  const rest = byPriority.filter((item) => !item.primary)
  const folded: string[] = []
  for (const item of rest) {
    if (item.folded >= item.full) {
      // Nothing to fold, such as an action without an icon.
      continue
    }
    folded.push(item.key)
    const fit = { folded: [...folded], overflow: [] }
    if (fits(fit)) {
      return fit
    }
  }
  const overflow: string[] = []
  for (const item of rest) {
    overflow.push(item.key)
    const fit = { folded: [...folded], overflow: [...overflow] }
    if (fits(fit)) {
      return fit
    }
  }
  const primary = byPriority.filter((item) => item.primary).map((item) => item.key)
  return { folded: [...folded, ...primary], overflow }
}

const sameFit = (a: ToolbarFit, b: ToolbarFit) =>
  a.folded.join('\n') === b.folded.join('\n') && a.overflow.join('\n') === b.overflow.join('\n')

const isPrimary = (item: ToolbarItem) => 'label' in item && Boolean(item.primary)

/**
 * Fits the toolbar to its own width. It measures a hidden copy of the actions,
 * each with its label and folded, and caches the widths of element items as
 * they render, so the answer doesn't depend on how the toolbar is folded at the
 * moment and settles within one paint.
 */
function useToolbarFit(
  root: HTMLElement | null,
  copy: HTMLElement | null,
  groups: ToolbarItem[][],
  right: ToolbarItem[],
): ToolbarFit {
  const [fit, setFit] = useState(FITS_ALL)
  const elementWidths = useRef(new Map<string, { full?: number; folded?: number }>())
  const measure = useRef(() => {})
  measure.current = () => {
    const available = root?.clientWidth ?? 0
    if (!root || !copy || available === 0) {
      // Not laid out, as in a test without layout: everything shows.
      setFit((prev) => (sameFit(prev, FITS_ALL) ? prev : FITS_ALL))
      return
    }
    const measured = new Map<string, { full?: number; folded?: number }>()
    for (const el of copy.querySelectorAll<HTMLElement>('[data-measure]')) {
      const key = el.dataset['measure'] ?? ''
      const widths = measured.get(key) ?? {}
      widths[el.dataset['fold'] === 'folded' ? 'folded' : 'full'] = el.getBoundingClientRect().width
      measured.set(key, widths)
    }
    for (const el of root.querySelectorAll<HTMLElement>('[data-toolbar-element]')) {
      const key = el.dataset['toolbarElement'] ?? ''
      const widths = elementWidths.current.get(key) ?? {}
      widths[fit.folded.includes(key) ? 'folded' : 'full'] = el.getBoundingClientRect().width
      elementWidths.current.set(key, widths)
    }
    const widthsOf = (item: ToolbarItem): ItemWidth => {
      const w = ('element' in item ? elementWidths.current : measured).get(item.key) ?? {}
      const full = w.full ?? w.folded ?? 0
      return { key: item.key, full, folded: w.folded ?? full, primary: isPrimary(item) }
    }
    const next = fitToolbar(
      groups.map((g) => g.map(widthsOf)),
      right.map(widthsOf),
      available,
    )
    setFit((prev) => (sameFit(prev, next) ? prev : next))
  }

  // Each render, since an element item's width is only known once it renders.
  useLayoutEffect(() => measure.current())

  useLayoutEffect(() => {
    if (!root || !copy) {
      return
    }
    const observer = new ResizeObserver(() => measure.current())
    observer.observe(root)
    // A label changing, such as a count that loads, resizes the copy.
    observer.observe(copy)
    return () => observer.disconnect()
  }, [root, copy])

  return fit
}

/** The hidden copy `useToolbarFit` measures: each action with its label and
 *  folded to its icon, styled as its button is. */
function MeasuringCopy({ items, ref }: { items: ToolbarItem[]; ref: React.Ref<HTMLDivElement> }) {
  return (
    // Clipped to nothing, so its width never scrolls the toolbar.
    <div
      aria-hidden
      inert
      className="pointer-events-none invisible absolute top-0 left-0 size-0 overflow-hidden"
    >
      <div ref={ref} className="flex w-max gap-1">
        {items.map((item) =>
          'element' in item ? null : (
            <Fragment key={item.key}>
              <span data-measure={item.key} data-fold="full" className={actionClasses(item, false)}>
                {item.icon}
                {item.label}
              </span>
              {item.icon && (
                <span
                  data-measure={item.key}
                  data-fold="folded"
                  className={actionClasses(item, true)}
                >
                  {item.icon}
                </span>
              )}
            </Fragment>
          ),
        )}
      </div>
    </div>
  )
}

function ItemSlot({ item, folded }: { item: ToolbarItem; folded: boolean }) {
  return (
    <FoldedContext value={folded}>
      {'element' in item ? (
        // Measured as it renders, since only the host knows what it draws.
        <span data-toolbar-element={item.key} className="inline-flex shrink-0">
          {item.element}
        </span>
      ) : (
        <ToolbarButton action={item} />
      )}
    </FoldedContext>
  )
}

/** A view's controls in one WAI-ARIA toolbar: a single tab stop, with the arrow
 *  keys moving between its items, the `…` menu and disabled ones included, so
 *  their reasons stay reachable. Action groups sit on the left and `right` holds
 *  secondary actions at the end. It stays one row: when it runs out of room
 *  labels fold to their icons one at a time, then actions move into a `…` menu,
 *  the right-hand ones first and the primary action never. Give each action its
 *  own icon, since a folded one is known by it, and mark the one action the
 *  view leads to `primary`. */
export function ActionToolbar({
  groups,
  right = [],
  sticky = false,
  label,
}: {
  groups: ToolbarItem[][]
  right?: ToolbarItem[]
  /** Pins it as the page scrolls, just below whatever the page's scroller
   *  already pins at the top, such as the page header. */
  sticky?: boolean
  /** Names the toolbar for assistive technology, such as "Log controls";
   *  defaults to "Actions". */
  label?: string | undefined
}) {
  const { common } = useStrings()
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const [copy, setCopy] = useState<HTMLDivElement | null>(null)
  const visibleGroups = groups
    .map((group) => group.filter((a) => !a.hidden))
    .filter((group) => group.length > 0)
  const visibleRight = right.filter((a) => !a.hidden)
  const all = [...visibleGroups.flat(), ...visibleRight]
  warnIfManyPrimary(all)
  warnIfIconsRepeat(all)
  const fit = useToolbarFit(root, copy, visibleGroups, visibleRight)
  useStickyTop(root, sticky)
  const overflow = new Set(fit.overflow)
  const folded = new Set(fit.folded)
  const shown = (items: ToolbarItem[]) => items.filter((item) => !overflow.has(item.key))
  const shownGroups = visibleGroups.map(shown).filter((group) => group.length > 0)
  const shownRight = shown(visibleRight)
  // The menu lists what moved, in the toolbar's order, a line between groups.
  const menu = [...visibleGroups, visibleRight]
    .map((group) => group.filter((item) => overflow.has(item.key)))
    .filter((group) => group.length > 0)
  return (
    <Toolbar.Root
      ref={setRoot}
      aria-label={label ?? common.actions}
      className={cx(
        'relative flex min-w-0 items-center gap-2.5',
        sticky && cx(stickyClasses, 'py-1.5'),
      )}
    >
      <MeasuringCopy ref={setCopy} items={all} />
      <PlacementContext value="toolbar">
        {shownGroups.map((group, i) => (
          <Fragment key={group[0]?.key ?? i}>
            {i > 0 && (
              <Toolbar.Separator
                orientation="vertical"
                className="h-5 w-px shrink-0 bg-(--theme-border)"
              />
            )}
            <Toolbar.Group className="flex shrink-0 items-center gap-1">
              {group.map((item) => (
                <ItemSlot key={item.key} item={item} folded={folded.has(item.key)} />
              ))}
            </Toolbar.Group>
          </Fragment>
        ))}
        {(shownRight.length > 0 || menu.length > 0) && (
          <div className="ml-auto flex shrink-0 items-center gap-1">
            {shownRight.map((item) => (
              <ItemSlot key={item.key} item={item} folded={folded.has(item.key)} />
            ))}
            {menu.length > 0 && <OverflowMenu items={menu} />}
          </div>
        )}
      </PlacementContext>
    </Toolbar.Root>
  )
}

const warnedPrimary = new Set<string>()

/** Warns in development when more than one action is primary: the fill marks
 *  the one next step, so two of them mark none. */
function warnIfManyPrimary(items: ToolbarItem[]) {
  // Checked first and on its own, so a production build drops the rest.
  if (!isDev()) {
    return
  }
  const labels = items.flatMap((item) => ('label' in item && item.primary ? [item.label] : []))
  const names = labels.map((label) => `"${label}"`).join(', ')
  if (labels.length < 2 || warnedPrimary.has(names)) {
    return
  }
  warnedPrimary.add(names)
  console.warn(`ActionToolbar: ${names} are all primary; mark one action at most.`)
}

const warnedIcons = new Set<string>()

/** Warns in development when two actions share an icon: folded to their icons
 *  in a narrow toolbar, they would look the same. */
function warnIfIconsRepeat(items: ToolbarItem[]) {
  // Checked first and on its own, so a production build drops the rest.
  if (!isDev()) {
    return
  }
  const byIcon = new Map<unknown, string[]>()
  for (const item of items) {
    // An icon component, not a bare <svg>, which every inline icon would share.
    if ('element' in item || !isValidElement(item.icon) || typeof item.icon.type === 'string') {
      continue
    }
    byIcon.set(item.icon.type, [...(byIcon.get(item.icon.type) ?? []), item.label])
  }
  for (const labels of byIcon.values()) {
    const names = labels.map((label) => `"${label}"`).join(', ')
    if (labels.length < 2 || warnedIcons.has(names)) {
      continue
    }
    warnedIcons.add(names)
    console.warn(
      `ActionToolbar: ${names} share an icon, so they look the same once their labels fold; give each its own.`,
    )
  }
}
