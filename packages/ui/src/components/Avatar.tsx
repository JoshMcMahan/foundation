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
  className?: string | undefined
}

const SIZE_CLASSES: Record<AvatarSize, string> = {
  xs: 'size-4 text-[9px]',
  sm: 'size-6 text-xs',
  md: 'size-8 text-sm',
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

/** Up to two initials: the first and last word of a name split on spaces and dots. */
export function avatarInitials(name: string | undefined): string {
  const parts = (name ?? '').split(/[\s.]+/).filter(Boolean)
  const first = parts[0]?.charAt(0)
  const last = parts.at(-1)?.charAt(0)
  if (parts.length >= 2 && first && last) {
    return (first + last).toUpperCase()
  }
  return first?.toUpperCase() || '?'
}

/** A person's picture, or their initials while it loads or when it fails. It is
 *  one image to assistive technology, named for the person, whichever shows,
 *  and their presence when it has a status dot. */
export function Avatar({ src, name, colorKey, size = 'md', status, className }: AvatarProps) {
  const { common } = useStrings()
  const who = name || common.userAvatar
  // A nameless avatar shows "?", which a color would only make look like someone's.
  const colorBy = colorKey === undefined ? name?.trim() : colorKey
  return (
    <span
      role="img"
      // The dot's color is its only sign of the status, so the name says it too.
      aria-label={status ? common.withPresence(who, common.presence[status]) : who}
      className={cx('relative inline-flex shrink-0', className)}
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
          {/* Two letters crowd a 16px circle and sit under the status dot. */}
          {size === 'xs' ? avatarInitials(name).charAt(0) : avatarInitials(name)}
        </BaseAvatar.Fallback>
      </BaseAvatar.Root>
      {status && (
        <span
          data-testid="online-indicator"
          className={cx(
            'absolute right-0 bottom-0 block rounded-full ring-2 ring-(--theme-app-bg)',
            STATUS_CLASSES[status],
            size === 'xs' || size === 'sm' ? 'size-1.5' : 'size-2.5',
          )}
        />
      )}
    </span>
  )
}
