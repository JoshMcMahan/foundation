import {
  Children,
  type CSSProperties,
  createContext,
  isValidElement,
  type MouseEventHandler,
  type ReactElement,
  type ReactNode,
  useContext,
} from 'react'
import { cx } from '../cx'
import { formatInteger } from '../format'
import type { LinkTarget } from './AppLink'
import { Card } from './Card'
import { type BarTone, ProgressBar, type ProgressSegment } from './Meter'
import { useLocale, useStrings } from './Provider'
import { Skeleton } from './Skeleton'
import { type BadgeVariant, StatusDot } from './StatusBadge'

/** A tile's lamp, as a status's: lit in a tone, unlit with `off`, or an icon in its place. Its
 *  tone says what the state means, as every status lamp's does: work under way is `info` with
 *  `pulse`, something waiting its turn or off (pending jobs, idle nodes) is `off`, a failure is
 *  `error`, work done is `success`, and `warning` is only for a state that needs a look. */
export interface StatTileLamp {
  variant?: BadgeVariant | undefined
  /** Unlit, a hollow ring, for a count of something waiting or off, such as pending jobs or idle
   *  nodes. */
  off?: boolean | undefined
  /** A ping from the lamp, for work under way. It pings only while the count is above zero. */
  pulse?: boolean | undefined
  /** An icon in place of the lamp, such as a `RunStatusIcon`. */
  icon?: ReactNode | undefined
}

/** A tile's bar: a `ProgressBar` in one or more stretches, such as nodes in use, then partly in
 *  use, then down, on a track whose empty rest is the idle ones. */
export interface StatTileBar {
  value: number
  max?: number
  tone?: BarTone
  segments?: ReadonlyArray<ProgressSegment> | undefined
  /** What the bar shows, read by assistive technology, such as "60 of 102 nodes in use". */
  'aria-label': string
  getAriaValueText?: ((formatted: string | null, value: number | null) => string) | undefined
}

export interface StatTileProps extends LinkTarget {
  /** The count. A number reads in the app's locale, grouped as it groups digits; anything else,
   *  such as a dash for a count not known, shows as given. */
  value: ReactNode
  /** Quieter text after the value, such as "/ 102 free". */
  suffix?: ReactNode
  /** What the value counts, under it, such as "Running". A long one wraps. */
  label: ReactNode
  /** A status lamp level with the label, for a count of things in one state. */
  lamp?: StatTileLamp | undefined
  /** A bar under the label: a `ProgressBar`'s value and stretches, or a bar of the host's own,
   *  such as one in a tooltip. */
  bar?: StatTileBar | ReactElement | undefined
  /** How a number is written, such as `{ notation: 'compact' }` for 1.3M; whole and grouped
   *  by default. */
  format?: Intl.NumberFormatOptions | undefined
  /** What assistive technology reads for the tile, when the value, suffix and label in a row
   *  don't read well, such as "35 of 102 nodes free". */
  spoken?: string | undefined
  /** Makes the tile a button. With `href` it is a link instead. */
  onClick?: MouseEventHandler<HTMLButtonElement> | undefined
  /** In a `StatTileGroup`, the tile takes a row of its own on a phone, such as one with a bar. */
  wide?: boolean | undefined
  /** Sketches the value while it loads; the label shows, since it is known. */
  loading?: boolean | undefined
  /** The locale numbers are written in; the provider's `locale`, then the browser's, without it. */
  locale?: string | undefined
  className?: string | undefined
}

// Set by a group on each tile: whether it spans both columns on a phone.
const PhoneSpanContext = createContext(false)

const numberFormats = new Map<string, Intl.NumberFormat>()

function formatValue(
  value: number,
  locale: string | undefined,
  format: Intl.NumberFormatOptions | undefined,
) {
  if (!format) {
    return formatInteger(value, locale)
  }
  const key = `${locale ?? ''}|${JSON.stringify(format)}`
  let formatter = numberFormats.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, format)
    numberFormats.set(key, formatter)
  }
  return formatter.format(value)
}

/** A count and what it counts, as a tile at the top of a page, such as a queue's running jobs:
 *  a large value, a label under it, and optionally a status lamp beside the label and a bar
 *  under it. With `href` or `onClick`, the whole tile is a link or a button, such as to the list
 *  the count is of. Lay several out with `StatTileGroup`.
 *
 *  Assistive technology reads the value and label as one phrase, such as "3 Running", not as two
 *  lines; `spoken` words it otherwise. */
export function StatTile({
  value,
  suffix,
  label,
  lamp,
  bar,
  format,
  spoken,
  onClick,
  wide,
  loading = false,
  locale: localeProp,
  href,
  reloadDocument,
  target,
  className,
}: StatTileProps) {
  const providerLocale = useLocale()
  const { loading: loadingText } = useStrings().common
  const locale = localeProp ?? providerLocale
  const groupSpan = useContext(PhoneSpanContext)
  const shown = typeof value === 'number' ? formatValue(value, locale, format) : value
  // A pulse says work is under way; at zero there is none.
  const pulse = lamp?.pulse === true && !(typeof value === 'number' && value <= 0)
  return (
    <Card
      size="fill"
      href={href}
      reloadDocument={reloadDocument}
      target={target}
      render={
        href === undefined && onClick ? <button type="button" onClick={onClick} /> : undefined
      }
      className={cx(
        'flex h-full min-w-0 flex-col px-4 py-3',
        // In a group, a wide tile or the one that would sit alone takes the phone's row.
        (groupSpan || wide) && 'col-span-2 @2xl/stat-tiles:col-span-1',
        className,
      )}
    >
      {/* One phrase for assistive technology; the lines it sees are hidden from it. */}
      {loading ? (
        <>
          <span className="sr-only">{label}</span>
          <span className="sr-only">{loadingText}</span>
        </>
      ) : (
        <span className="sr-only">
          {spoken ?? (
            <>
              {shown}
              {suffix != null && <> {suffix}</>} {label}
            </>
          )}
        </span>
      )}
      <span aria-hidden="true" className="flex min-w-0 items-baseline gap-1.5">
        {loading ? (
          <Skeleton width="3ch" height={24} className="my-1 text-2xl" />
        ) : (
          <>
            {/* Proportional figures: the UI face's tabular 1 has a slab foot, and a tile's
                value stands alone, never in a column of others to line up with. */}
            <span className="min-w-0 truncate text-2xl leading-8 font-semibold tracking-tight text-(--theme-app)">
              {shown}
            </span>
            {suffix != null && (
              <span className="min-w-0 truncate text-sm text-(--theme-muted-text-color)">
                {suffix}
              </span>
            )}
          </>
        )}
      </span>
      <span
        aria-hidden="true"
        className="flex min-w-0 items-start gap-1.5 text-[13px] leading-5 text-(--theme-muted-text-color)"
      >
        {lamp &&
          // Centered on the label's first line, so it stays level with a label that wraps.
          (lamp.icon != null ? (
            <span className="inline-flex h-lh shrink-0 items-center">{lamp.icon}</span>
          ) : (
            <span className="inline-flex h-lh shrink-0 items-center">
              <StatusDot variant={lamp.variant} off={lamp.off} pulse={pulse} />
            </span>
          ))}
        <span className="min-w-0 break-words">{label}</span>
      </span>
      {bar !== undefined && (
        <div className="mt-2">
          {isValidElement(bar) ? (
            bar
          ) : (
            <ProgressBar {...bar} size="sm" showValue="none" locale={locale} />
          )}
        </div>
      )}
    </Card>
  )
}

/** Which tiles, by place, would sit alone in half a row of two, laid out in order with each wide
 *  one on a row of its own. */
function loneTiles(wide: ReadonlyArray<boolean>): Set<number> {
  const lone = new Set<number>()
  let second = false
  wide.forEach((isWide, index) => {
    if (isWide) {
      second = false
    } else if (second) {
      second = false
    } else if (index === wide.length - 1 || wide[index + 1]) {
      lone.add(index)
    } else {
      second = true
    }
  })
  return lone
}

export interface StatTileGroupProps {
  /** `StatTile`s, each a direct child, so the group reads their `wide`. */
  children: ReactNode
  className?: string | undefined
}

/** Tiles in a row as wide as the content around them, edge to edge with it. Where the row is
 *  too narrow for them, such as on a phone, they take two columns, with a `wide` tile across
 *  both, and any tile that would sit alone in half a row across both too:
 *  four counts and a wide tile read as two rows of two and the wide one under them. */
export function StatTileGroup({ children, className }: StatTileGroupProps) {
  const tiles = Children.toArray(children).filter(isValidElement)
  const lone = loneTiles(tiles.map((tile) => (tile.props as { wide?: boolean }).wide === true))
  return (
    <div className={cx('@container/stat-tiles w-full', className)}>
      <div
        className="grid grid-cols-2 gap-3 @2xl/stat-tiles:grid-cols-(--stat-tile-columns)"
        style={
          {
            '--stat-tile-columns': `repeat(${Math.max(tiles.length, 1)}, minmax(0, 1fr))`,
          } as CSSProperties
        }
      >
        {tiles.map((tile, index) => (
          <PhoneSpanContext.Provider key={tile.key} value={lone.has(index)}>
            {tile}
          </PhoneSpanContext.Provider>
        ))}
      </div>
    </div>
  )
}
