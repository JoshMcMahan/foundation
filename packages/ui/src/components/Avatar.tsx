import { Avatar as BaseAvatar } from '@base-ui/react/avatar'
import {
  Children,
  type ComponentPropsWithRef,
  type CSSProperties,
  createContext,
  type ReactNode,
  use,
  useMemo,
} from 'react'
import { cx } from '../cx'
import { categoryClasses } from './category'
import { useAvatarColoring, useLocale, useStrings } from './Provider'
import { Tooltip } from './Tooltip'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
export type AvatarStatus = 'online' | 'offline' | 'busy' | 'away'
/** Who an avatar stands for. An agent's avatar is a rounded square, so its shape, and not only
 *  its color, tells it from a person's. */
export type AvatarKind = 'person' | 'agent'
export type AvatarShape = 'circle' | 'square'

export interface AvatarProps {
  /** Image URL. Until it loads, or when it fails, the initials of `name` show. */
  src?: string | null | undefined
  name?: string | undefined
  /** A person (a circle, the default) or an agent (a rounded square). Under UIProvider's
   *  `avatarColoring="kind"` it also picks the fill: `--avatar-person` or `--avatar-agent`. */
  kind?: AvatarKind | undefined
  /** Overrides the shape `kind` gives, such as a square for an organization. */
  shape?: AvatarShape | undefined
  /** Picks the fallback's color from the theme's categorical palette, so the same key gets the
   *  same color everywhere. Defaults to `name`; pass a stable id when names can repeat or
   *  change, or `null` for the accent fill whatever the name. Without either, the accent fills it.
   *  Ignored under `avatarColoring="kind"`. */
  colorKey?: string | null | undefined
  /** Classes for the initials' fill and text in place of the palette's or the kind's, such as a
   *  neutral fill for something that is neither a person nor an agent. */
  colorClassName?: string | undefined
  /** Defaults to the group's size inside an `AvatarGroup`, else `md`. */
  size?: AvatarSize | undefined
  status?: AvatarStatus | undefined
  /** Hides it from assistive technology, for an avatar beside the name it shows, which a
   *  screen reader would otherwise read twice. */
  decorative?: boolean | undefined
  /** Names it on hover: `true` shows the name, with the presence when it has a status dot, and
   *  anything else shows that instead, such as what the person is doing. */
  tooltip?: boolean | ReactNode
  /** On the avatar's shape, rounded as it is, so a ring or a shadow follows the circle or the
   *  square: its margin, ring or hover effect. */
  className?: string | undefined
}

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'size-4 text-[9px]',
  sm: 'size-5 text-[9px]',
  md: 'size-7 text-xs',
  lg: 'size-10 text-base',
  xl: 'size-12 text-lg',
  '2xl': 'size-16 text-xl',
}

// Two letters even at the smallest sizes, set a little smaller there so they fit.
const KIND_TEXT_CLASSES: Partial<Record<AvatarSize, string>> = {
  xs: 'text-[8px]',
  md: 'text-[11px]',
}

// The corner grows with the square, so a large one still reads as a square, not a circle.
const SQUARE_CLASSES: Record<AvatarSize, string> = {
  xs: 'rounded-[5px]',
  sm: 'rounded-[5px]',
  md: 'rounded-[5px]',
  lg: 'rounded-lg',
  xl: 'rounded-[10px]',
  '2xl': 'rounded-xl',
}

// Opaque, so an avatar overlapping another in a group hides it. A host sets the variables to its
// own person and agent colors.
const KIND_CLASSES: Record<AvatarKind, string> = {
  person:
    'bg-(--avatar-person,color-mix(in_oklab,var(--theme-info)_12%,var(--theme-panel-bg))) text-(--avatar-person-text,var(--theme-info-text))',
  agent:
    'bg-(--avatar-agent,var(--theme-category-2)) text-(--avatar-agent-text,var(--theme-category-2-text))',
}

// An agent's square keeps a faint edge, over its picture as well as its initials.
const AGENT_EDGE =
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] after:inset-ring after:inset-ring-(--avatar-agent-ring,color-mix(in_oklab,var(--avatar-agent-text,var(--theme-category-2-text))_40%,transparent))"

const STATUS_CLASSES: Record<AvatarStatus, string> = {
  online: 'bg-(--theme-success)',
  offline: 'bg-(--theme-muted-text-color)',
  busy: 'bg-(--theme-error)',
  away: 'bg-(--theme-warning)',
}

// User-perceived characters: a name can start with an emoji, a flag or a letter and its
// accent, which span several UTF-16 units, and half of one renders as a replacement box.
const graphemes =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : undefined
function leadingCharacters(text: string | undefined, count: number): string {
  if (!text) {
    return ''
  }
  const out: string[] = []
  // Whole code points at least, where segmenting by grapheme isn't available.
  for (const part of graphemes ? Array.from(graphemes.segment(text), (s) => s.segment) : text) {
    if (out.length === count) {
      break
    }
    out.push(part)
  }
  return out.join('')
}
function firstCharacter(text: string | undefined): string | undefined {
  return leadingCharacters(text, 1) || undefined
}

export interface AvatarInitialsOptions {
  /** Two letters for a one-word name ("maya" reads "MA"), splitting a handle on `_` and `-`
   *  too and leaving out an email's domain. Default false: one letter, "M". */
  twoLetters?: boolean | undefined
}

/** Up to two initials: the first and last word of a name split on spaces and dots. */
export function avatarInitials(
  name: string | undefined,
  { twoLetters = false }: AvatarInitialsOptions = {},
): string {
  let text = (name ?? '').trim()
  if (twoLetters && /^[^\s@]+@\S+$/.test(text)) {
    text = text.slice(0, text.indexOf('@'))
  }
  const parts = text.split(twoLetters ? /[\s.@_-]+/ : /[\s.]+/).filter(Boolean)
  const first = firstCharacter(parts[0])
  const last = firstCharacter(parts.at(-1))
  if (parts.length >= 2 && first && last) {
    return (first + last).toUpperCase()
  }
  if (twoLetters && parts.length === 1) {
    return leadingCharacters(parts[0], 2).toUpperCase()
  }
  return first?.toUpperCase() || '?'
}

interface AvatarGroupContextValue {
  size: AvatarSize
  ring: boolean
}

const AvatarGroupContext = createContext<AvatarGroupContextValue | null>(null)

/** A person's or an agent's picture, or their initials while it loads or when it fails. It is
 *  one image to assistive technology, named for them, whichever shows, and their presence when
 *  it has a status dot, unless it is `decorative`.
 *
 *  Without a picture the fill follows UIProvider's `avatarColoring`: by name from the
 *  categorical palette (the default), or by kind, where people share `--avatar-person` (with
 *  `--avatar-person-text`) and agents `--avatar-agent` (with `--avatar-agent-text`, and the
 *  edge `--avatar-agent-ring`). */
export function Avatar({
  src,
  name,
  kind = 'person',
  shape = kind === 'agent' ? 'square' : 'circle',
  colorKey,
  colorClassName,
  size: sizeProp,
  status,
  decorative = false,
  tooltip = false,
  className,
}: AvatarProps) {
  const { common } = useStrings()
  const byKind = useAvatarColoring() === 'kind'
  const group = use(AvatarGroupContext)
  const size = sizeProp ?? group?.size ?? 'md'
  const who = name || common.userAvatar
  // The dot's color is its only sign of the status, so the name says it too.
  const named = status ? common.withPresence(who, common.presence[status]) : who
  // A nameless avatar shows "?", which a color would only make look like someone's.
  const colorBy = colorKey === undefined ? name?.trim() : colorKey
  const initials = avatarInitials(name, { twoLetters: byKind })
  const radius = shape === 'square' ? SQUARE_CLASSES[size] : 'rounded-full'
  const fill =
    colorClassName ??
    (byKind
      ? KIND_CLASSES[kind]
      : colorBy
        ? categoryClasses(colorBy)
        : 'bg-gradient-to-br from-[var(--gradient-start,var(--theme-accent))] to-[var(--gradient-mid,var(--theme-link))] text-(--theme-accent-text)')
  const avatar = (
    <span
      {...(decorative ? { 'aria-hidden': true } : { role: 'img', 'aria-label': named })}
      data-shape={shape}
      // Exactly the shape's box, rounded as it is, so a ring here traces it; the status dot
      // overflows it unclipped.
      className={cx(
        'relative inline-flex shrink-0',
        radius,
        // In a group each one cuts itself out of the one it overlaps.
        group?.ring && 'ring-2 ring-(--avatar-ring)',
        className,
      )}
    >
      <BaseAvatar.Root
        className={cx(
          'relative inline-flex items-center justify-center overflow-hidden select-none',
          byKind ? 'font-semibold' : 'font-medium',
          radius,
          SIZE_CLASSES[size],
          byKind && KIND_TEXT_CLASSES[size],
          byKind && kind === 'agent' && !colorClassName && AGENT_EDGE,
        )}
      >
        {src && (
          <BaseAvatar.Image
            // A changed URL starts loading afresh rather than keeping the last one's failure.
            key={src}
            src={src}
            alt=""
            loading="lazy"
            decoding="async"
            keepMounted
            className="absolute inset-0 size-full object-cover data-error:hidden data-loading:invisible"
          />
        )}
        <BaseAvatar.Fallback
          aria-hidden="true"
          className={cx('flex size-full items-center justify-center', fill)}
        >
          {/* Centring a line box leaves capitals high, over the room it keeps for
              descenders; trimming it to the cap height and the baseline centres
              the letters themselves. */}
          <span className="leading-none [text-box:trim-both_cap_alphabetic]">
            {/* Two palette letters crowd a 16px circle and sit under the status dot; the
                kind's two are set smaller to fit. */}
            {size === 'xs' && !byKind ? firstCharacter(initials) : initials}
          </span>
        </BaseAvatar.Fallback>
      </BaseAvatar.Root>
      {status && (
        <span
          data-testid="online-indicator"
          className={cx(
            'absolute right-0 bottom-0 block rounded-full ring-2 ring-(--theme-app-bg)',
            STATUS_CLASSES[status],
            size === 'xs' || size === 'sm' ? 'size-1.5' : size === 'md' ? 'size-2' : 'size-2.5',
          )}
        />
      )}
    </span>
  )
  if (tooltip === false || tooltip === null || tooltip === undefined) {
    return avatar
  }
  return <Tooltip content={tooltip === true ? named : tooltip}>{avatar}</Tooltip>
}

/** Any other span attribute and the ref reach the stack's element, so the group can be a
 *  Tooltip's or a popover's direct child. */
export interface AvatarGroupProps
  extends Omit<ComponentPropsWithRef<'span'>, 'children' | 'className'> {
  /** Avatars, each possibly wrapped, such as in a hover card. Each child counts as one. */
  children: ReactNode
  /** Shows at most this many; the rest become a "+N" chip. */
  max?: number | undefined
  /** How many there are in all, when the children are already a slice of them: the chip counts
   *  the rest. Defaults to the number of children. */
  total?: number | undefined
  /** Shows the "+N" chip for those left out. Default true; false for a stack whose count is
   *  printed beside it. */
  showOverflow?: boolean | undefined
  /** Every avatar's size, and the chip's. Default `sm`. */
  size?: AvatarSize | undefined
  /** Rings each avatar in the color behind the stack, so overlapping faces read apart. Default
   *  true. */
  ring?: boolean | undefined
  /** The ring's color, a CSS color: the surface the stack sits on. Defaults to the panel's. One
   *  avatar can set its own, such as a highlight, by setting `--avatar-ring` in its `className`. */
  ringColor?: string | undefined
  /** The group's accessible name, such as "3 people here". */
  label?: string | undefined
  className?: string | undefined
}

// Each one overlaps the last by less than its ring and overlap would eat into the initials.
const OVERLAP_CLASSES: Record<AvatarSize, string> = {
  xs: '-space-x-px',
  sm: '-space-x-0.5',
  md: '-space-x-1',
  lg: '-space-x-1.5',
  xl: '-space-x-1.5',
  '2xl': '-space-x-1.5',
}

const CHIP_SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'h-4 min-w-4 px-0.5 text-[8px]',
  sm: 'h-5 min-w-5 px-1 text-[9px]',
  md: 'h-7 min-w-7 px-1 text-[11px]',
  lg: 'h-10 min-w-10 px-1.5 text-sm',
  xl: 'h-12 min-w-12 px-2 text-base',
  '2xl': 'h-16 min-w-16 px-2 text-lg',
}

// Built once per locale; the browser's without one.
const numberFormats = new Map<string | undefined, Intl.NumberFormat>()
function formatNumber(n: number, locale: string | undefined) {
  let format = numberFormats.get(locale)
  if (!format) {
    format = new Intl.NumberFormat(locale)
    numberFormats.set(locale, format)
  }
  return format.format(n)
}

/** Overlapping avatars, such as a task's assignees or who is here, with a "+N" chip for the
 *  rest. Each avatar inside takes the group's size and a ring in the color behind it, which
 *  follows its shape, round or square. */
export function AvatarGroup({
  children,
  max,
  total,
  showOverflow = true,
  size = 'sm',
  ring = true,
  ringColor,
  label,
  className,
  style,
  ...spanProps
}: AvatarGroupProps) {
  const { common } = useStrings()
  const locale = useLocale()
  const items = Children.toArray(children)
  const shown = max === undefined ? items : items.slice(0, Math.max(0, max))
  const rest = Math.max(0, (total ?? items.length) - shown.length)
  const context = useMemo(() => ({ size, ring }), [size, ring])
  return (
    <AvatarGroupContext value={context}>
      <span
        {...spanProps}
        {...(label ? { role: 'group', 'aria-label': label } : {})}
        style={{ '--avatar-ring': ringColor ?? 'var(--theme-panel-bg)', ...style } as CSSProperties}
        className={cx('inline-flex shrink-0 items-center', OVERLAP_CLASSES[size], className)}
      >
        {shown}
        {showOverflow && rest > 0 && (
          <span
            className={cx(
              'relative inline-flex shrink-0 items-center justify-center rounded-full bg-(--theme-muted-panel-bg) font-medium text-(--theme-muted-text-color) tabular-nums select-none',
              CHIP_SIZE_CLASSES[size],
              ring && 'ring-2 ring-(--avatar-ring)',
            )}
          >
            <span aria-hidden="true" className="leading-none [text-box:trim-both_cap_alphabetic]">
              +{formatNumber(rest, locale)}
            </span>
            <span className="sr-only">{common.moreCount(rest)}</span>
          </span>
        )}
      </span>
    </AvatarGroupContext>
  )
}
