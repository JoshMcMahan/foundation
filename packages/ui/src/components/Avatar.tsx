import { Avatar as BaseAvatar } from '@base-ui/react/avatar'
import { cx } from '../cx'
import { categoryClasses } from './category'
import { useStrings } from './Provider'

export type AvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl'
export type AvatarStatus = 'online' | 'offline' | 'busy' | 'away'

export interface AvatarProps {
  /** Image URL. Until it loads, or when it fails, the initials of `name` show. */
  src?: string | null | undefined
  name?: string | undefined
  /** Picks the fallback's color from the theme's categorical palette, so the same key gets the
   *  same color everywhere. Defaults to `name`; pass a stable id when names can repeat or
   *  change, or `null` for the accent fill whatever the name. Without either, the accent fills it. */
  colorKey?: string | null | undefined
  size?: AvatarSize | undefined
  status?: AvatarStatus | undefined
  /** Hides it from assistive technology, for an avatar beside the name it shows, which a
   *  screen reader would otherwise read twice. */
  decorative?: boolean | undefined
  /** On the avatar's round shape, so a ring or a shadow follows the circle: its margin,
   *  ring or hover effect. */
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

const STATUS_CLASSES: Record<AvatarStatus, string> = {
  online: 'bg-(--theme-success)',
  offline: 'bg-(--theme-muted-text-color)',
  busy: 'bg-(--theme-error)',
  away: 'bg-(--theme-warning)',
}

// One user-perceived character: a name can start with an emoji, a flag or a
// letter and its accent, which span several UTF-16 units, and half of one
// renders as a replacement box.
const graphemes =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : undefined
function firstCharacter(text: string | undefined): string | undefined {
  if (!text) {
    return undefined
  }
  if (graphemes) {
    return graphemes.segment(text)[Symbol.iterator]().next().value?.segment
  }
  // Whole code points at least, where segmenting by grapheme isn't available.
  return Array.from(text)[0]
}

/** Up to two initials: the first and last word of a name split on spaces and dots. */
export function avatarInitials(name: string | undefined): string {
  const parts = (name ?? '').split(/[\s.]+/).filter(Boolean)
  const first = firstCharacter(parts[0])
  const last = firstCharacter(parts.at(-1))
  if (parts.length >= 2 && first && last) {
    return (first + last).toUpperCase()
  }
  return first?.toUpperCase() || '?'
}

/** A person's picture, or their initials while it loads or when it fails. It is
 *  one image to assistive technology, named for the person, whichever shows,
 *  and their presence when it has a status dot, unless it is `decorative`. */
export function Avatar({
  src,
  name,
  colorKey,
  size = 'md',
  status,
  decorative = false,
  className,
}: AvatarProps) {
  const { common } = useStrings()
  const who = name || common.userAvatar
  // A nameless avatar shows "?", which a color would only make look like someone's.
  const colorBy = colorKey === undefined ? name?.trim() : colorKey
  return (
    <span
      {...(decorative
        ? { 'aria-hidden': true }
        : {
            role: 'img',
            // The dot's color is its only sign of the status, so the name says it too.
            'aria-label': status ? common.withPresence(who, common.presence[status]) : who,
          })}
      // Exactly the circle's box, rounded as it is, so a ring here traces the circle;
      // the status dot overflows it unclipped.
      className={cx('relative inline-flex shrink-0 rounded-full', className)}
    >
      <BaseAvatar.Root
        className={cx(
          'relative inline-flex items-center justify-center overflow-hidden rounded-full font-medium select-none',
          SIZE_CLASSES[size],
        )}
      >
        {src && (
          <BaseAvatar.Image
            // A changed URL starts loading afresh rather than keeping the last one's failure.
            key={src}
            src={src}
            alt=""
            loading="lazy"
            keepMounted
            className="absolute inset-0 size-full object-cover data-error:hidden data-loading:invisible"
          />
        )}
        <BaseAvatar.Fallback
          aria-hidden="true"
          className={cx(
            'flex size-full items-center justify-center',
            colorBy
              ? categoryClasses(colorBy)
              : 'bg-gradient-to-br from-[var(--gradient-start,var(--theme-accent))] to-[var(--gradient-mid,var(--theme-link))] text-(--theme-accent-text)',
          )}
        >
          {/* Centring a line box leaves capitals high, over the room it keeps for
              descenders; trimming it to the cap height and the baseline centres
              the letters themselves. */}
          <span className="leading-none [text-box:trim-both_cap_alphabetic]">
            {/* Two letters crowd a 16px circle and sit under the status dot. */}
            {size === 'xs' ? firstCharacter(avatarInitials(name)) : avatarInitials(name)}
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
}
