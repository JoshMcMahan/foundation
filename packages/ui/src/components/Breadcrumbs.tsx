import { type ReactNode, useLayoutEffect, useState } from 'react'
import { cx } from '../cx'
import { ChevronRightIcon, MoreIcon } from '../icons'
import { ActionMenu } from './ActionMenu'
import { AppLink } from './AppLink'
import { buttonClasses } from './buttonClasses'
import { keyedByContent } from './keys'
import type { MenuEntry } from './MenuEntries'
import { useStrings } from './Provider'
import { Skeleton } from './Skeleton'
import { Tooltip } from './Tooltip'

/** One step of the trail to the current page. */
export interface Breadcrumb {
  /** Empty while the name is still loading: the trail shows a placeholder. */
  label: string
  href?: string | undefined
  /** Before the label, such as the section a page belongs to; also beside
   *  the crumb's row once it folds into the "…" menu. */
  icon?: ReactNode
}

export interface BreadcrumbsProps {
  /** The trail, ending with where the reader is. A crumb with an empty label,
   *  such as a name still loading, shows a placeholder. */
  crumbs: readonly Breadcrumb[]
  /** Goes to a crumb that has no `href`: a place with no URL, such as a folder
   *  in a view that keeps its path out of the URL. A crumb with a URL takes
   *  `href` instead, so it opens in a new tab. Without either, a crumb is
   *  text. */
  onSelect?: ((crumb: Breadcrumb, index: number) => void) | undefined
  /** What the last crumb is: the page itself, or a place within the page, such
   *  as the open folder. */
  current?: 'page' | 'location' | undefined
  /** Makes the last crumb the page's `h1`, as `PageHeader` does. A page has
   *  one. It wraps rather than truncating: a heading can't take focus, so a
   *  tooltip would leave the rest of the name to a mouse. */
  heading?: boolean | undefined
  /** Names the landmark; the strings' `breadcrumb` by default. */
  label?: string | undefined
  className?: string | undefined
}

/**
 * The trail to where the reader is, as a list in a `nav` landmark. A trail too
 * wide for its room folds its ancestors into a "…" menu, keeping the parent
 * when the whole last crumb fits beside it. Once every ancestor has folded, a
 * last crumb still too wide truncates, with its full name on hover, or wraps
 * when it is the heading. In a flex row its room is what the row's other items
 * leave it; elsewhere it fills its container's width.
 */
export function Breadcrumbs({
  crumbs,
  onSelect,
  current = 'page',
  heading = false,
  label,
  className,
}: BreadcrumbsProps) {
  const { common } = useStrings()
  const [nav, setNav] = useState<HTMLElement | null>(null)
  const [natural, setNatural] = useState<HTMLElement | null>(null)
  const fit = useTrailFit(nav, natural)
  const last = crumbs[crumbs.length - 1]
  const ancestors = crumbs.slice(0, -1)
  // When the trail doesn't fit, every ancestor but the parent, the way back,
  // folds into one menu, and the parent too when the last crumb can't fit
  // whole beside it: where the reader is matters more than the way back, which
  // the menu still holds.
  const folded = fit === 'none' ? ancestors : fit === 'parent' ? ancestors.slice(0, -1) : []
  const shown = ancestors.slice(folded.length)
  const Last = heading ? 'h1' : 'span'

  const menuItem = (crumb: Breadcrumb, index: number): MenuEntry => {
    const name = crumb.label || common.loading
    const icon = crumb.icon
    if (crumb.href) {
      return { label: name, icon, href: crumb.href }
    }
    if (onSelect) {
      return { label: name, icon, onClick: () => onSelect(crumb, index) }
    }
    // Still part of the path, so it shows, but there is nowhere to go.
    return { label: name, icon, disabled: true, onClick: () => {} }
  }

  return (
    <nav
      ref={setNav}
      aria-label={label ?? common.breadcrumb}
      className={cx('relative min-w-0', className)}
    >
      <ol className="m-0 flex min-w-0 list-none items-center gap-1.5 p-0 text-[13px] leading-none">
        {folded.length > 0 && (
          <li className="flex shrink-0 items-center gap-1.5">
            <ActionMenu
              label={common.showFullPath}
              align="start"
              items={folded.map(menuItem)}
              triggerClassName={buttonClasses({ variant: 'ghost', size: 'xs', iconOnly: true })}
            >
              <MoreIcon />
            </ActionMenu>
            <Separator />
          </li>
        )}
        {keyedByContent(shown, (c) => c.href ?? c.label).map(({ key, item: crumb }, i) => {
          const index = folded.length + i
          return (
            <li
              key={key}
              // Once folded, the parent keeps up to 9rem rather than shrinking to
              // a letter beside a long name, which truncates instead.
              className={cx(
                'flex items-center gap-1.5',
                folded.length > 0 ? 'min-w-0 max-w-36 shrink-0' : 'min-w-0',
              )}
            >
              {crumb.label === '' ? (
                <CrumbPlaceholder />
              ) : (
                <Tooltip content={crumb.label} overflowOnly>
                  {crumb.href ? (
                    <AppLink
                      href={crumb.href}
                      className={cx(crumbText, crumbLink, crumb.icon && withIcon, 'max-w-48')}
                    >
                      <CrumbLabel crumb={crumb} />
                    </AppLink>
                  ) : onSelect ? (
                    <button
                      type="button"
                      onClick={() => onSelect(crumb, index)}
                      className={cx(
                        crumbText,
                        crumbLink,
                        crumb.icon && withIcon,
                        'max-w-48 cursor-pointer text-start',
                      )}
                    >
                      <CrumbLabel crumb={crumb} />
                    </button>
                  ) : (
                    <span className={cx(crumbText, crumb.icon && withIcon, 'max-w-48')}>
                      <CrumbLabel crumb={crumb} />
                    </span>
                  )}
                </Tooltip>
              )}
              <Separator />
            </li>
          )
        })}
        {last && (
          <li className="flex min-w-0 items-center">
            {last.label === '' ? (
              <Last aria-current={current} className="m-0">
                <CrumbPlaceholder />
              </Last>
            ) : heading ? (
              // Two lines and their padding fit a 48px bar; a third grows it.
              <h1
                aria-current={current}
                className={cx(
                  'm-0 block min-w-0 py-1.5 text-[13px] font-medium leading-4 wrap-break-word text-(--theme-app)',
                  last.icon && withIcon,
                )}
              >
                <CrumbLabel crumb={last} wrap />
              </h1>
            ) : (
              // The last resort, once every ancestor has folded.
              <Tooltip content={last.label} overflowOnly>
                <span
                  aria-current={current}
                  className={cx(
                    'm-0 block truncate text-[13px] font-medium leading-none text-(--theme-app)',
                    last.icon && withIcon,
                  )}
                >
                  <CrumbLabel crumb={last} />
                </span>
              </Tooltip>
            )}
          </li>
        )}
      </ol>
      {/* The trail at its natural width, for measuring only. Clipped, so it
          takes no room and scrolls nothing. */}
      <div aria-hidden className="pointer-events-none invisible absolute inset-0 overflow-hidden">
        <div
          ref={setNatural}
          className="flex w-max items-center gap-1.5 whitespace-nowrap text-[13px] leading-none"
        >
          {crumbs.map((crumb, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: a static copy that never reorders
            <span key={i} className="flex items-center gap-1.5">
              <span
                className={cx(
                  i < crumbs.length - 1 && 'max-w-48 truncate',
                  i === crumbs.length - 1 && 'font-medium',
                )}
              >
                {crumb.label || ' '.repeat(6)}
              </span>
              {i < crumbs.length - 1 && <Separator />}
            </span>
          ))}
        </div>
      </div>
    </nav>
  )
}

const crumbText = 'block truncate text-(--theme-muted-text-color)'
// A crumb with an icon lays the two out in a row, the label still truncating.
const withIcon = 'flex items-center gap-1'

function CrumbLabel({ crumb, wrap = false }: { crumb: Breadcrumb; wrap?: boolean }) {
  if (!crumb.icon) {
    return crumb.label
  }
  return (
    <>
      <span aria-hidden="true" className="inline-flex shrink-0 [&_svg]:size-3.5">
        {crumb.icon}
      </span>
      <span className={cx('min-w-0', !wrap && 'truncate')}>{crumb.label}</span>
    </>
  )
}
const crumbLink =
  'rounded-sm transition-colors hover:text-(--theme-app) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--theme-focus)'

function Separator() {
  return (
    <ChevronRightIcon className="size-3 shrink-0 text-(--theme-muted-text-color) opacity-60 rtl:rotate-180" />
  )
}

function CrumbPlaceholder() {
  const { common } = useStrings()
  return (
    <span className="flex items-center">
      <Skeleton width="6rem" height="0.8125rem" />
      <span className="sr-only">{common.loading}</span>
    </span>
  )
}

// What a folded trail adds before its crumbs: the "…" button, its chevron and
// their gaps.
const FOLD_WIDTH = 48
// A folded parent's widest (max-w-36), and the gap between it and the last
// crumb (gap-1.5).
const PARENT_MAX_WIDTH = 144
const CRUMB_GAP = 6

/** How many of the trail's ancestors fit: all, the parent alone, or none. */
type TrailFit = 'all' | 'parent' | 'none'

const px = (value: string) => Number.parseFloat(value) || 0

/** The width the trail may take. A flex row sizes the trail to its content, so
 *  its room is what the row leaves beside its other items; anywhere else the
 *  `nav` is a block that fills its container. */
function roomFor(nav: HTMLElement, row: HTMLElement): number {
  const style = getComputedStyle(row)
  if (!style.display.endsWith('flex') || style.flexDirection.startsWith('column')) {
    return nav.clientWidth
  }
  const gap = px(style.columnGap)
  let room = row.clientWidth - px(style.paddingLeft) - px(style.paddingRight)
  for (const child of row.children) {
    if (child !== nav) {
      room -= child.getBoundingClientRect().width + gap
    }
  }
  return room
}

/**
 * Fits the trail to its room. It measures a hidden copy of the trail at its
 * natural width, so the answer doesn't depend on how the trail is folded at the
 * moment.
 */
function useTrailFit(nav: HTMLElement | null, natural: HTMLElement | null): TrailFit {
  const [fit, setFit] = useState<TrailFit>('all')
  useLayoutEffect(() => {
    const row = nav?.parentElement
    if (!nav || !natural || !row) {
      return
    }
    const measure = () => {
      const room = roomFor(nav, row)
      if (natural.scrollWidth <= room) {
        setFit('all')
        return
      }
      const steps = [...natural.children]
      const width = (el: Element | undefined) => el?.getBoundingClientRect().width ?? 0
      const parent = Math.min(width(steps[steps.length - 2]), PARENT_MAX_WIDTH)
      const last = width(steps[steps.length - 1])
      // A trail of two has nothing to fold before its parent, so keeping the
      // parent would be keeping the trail that didn't fit.
      const keepsParent = steps.length > 2 && FOLD_WIDTH + parent + CRUMB_GAP + last <= room
      setFit(keepsParent ? 'parent' : 'none')
    }
    const resize = new ResizeObserver(measure)
    // The row resizing, a sibling growing, such as actions that load, or a
    // label changing, such as a name that loads, each changes the fit.
    const observe = () => {
      for (const el of [row, nav, natural, ...row.children]) {
        resize.observe(el)
      }
    }
    // A sibling that comes later takes room without resizing the row.
    const added = new MutationObserver(() => {
      observe()
      measure()
    })
    measure()
    observe()
    added.observe(row, { childList: true })
    return () => {
      resize.disconnect()
      added.disconnect()
    }
  }, [nav, natural])
  return fit
}
