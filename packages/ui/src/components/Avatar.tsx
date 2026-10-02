import cx from 'classnames'
import { useState } from 'react'
import { useStrings } from './Provider'

export type AvatarSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl'
export type AvatarStatus = 'online' | 'offline' | 'busy' | 'away'

export interface AvatarProps {
  /** Image URL; absent or failing to load shows the initials of `name`. */
  src?: string | null | undefined
  name?: string | undefined
  size?: AvatarSize | undefined
  status?: AvatarStatus | undefined
  className?: string | undefined
}

const SIZE_CLASSES: Record<AvatarSize, string> = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
  xl: 'w-12 h-12 text-lg',
  '2xl': 'w-16 h-16 text-xl',
}

const STATUS_CLASSES: Record<AvatarStatus, string> = {
  online: 'bg-green-500',
  offline: 'bg-(--theme-muted-text-color)',
  busy: 'bg-red-500',
  away: 'bg-yellow-500',
}

/** Up to two initials: the first and last word of a name split on spaces and dots. */
export function avatarInitials(name: string | undefined): string {
  const parts = (name ?? '').split(/[\s.]+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
  }
  return parts[0]?.[0]?.toUpperCase() || '?'
}

export function Avatar({ src, name, size = 'md', status, className }: AvatarProps) {
  const strings = useStrings()
  // Track the failed URL rather than a sticky boolean so a changed URL retries
  // instead of pinning to the initials fallback after a prior load error.
  const [erroredUrl, setErroredUrl] = useState<string | null>(null)
  const showImage = !!src && erroredUrl !== src

  return (
    <div className={cx('relative inline-flex', className)}>
      {showImage ? (
        <img
          src={src}
          alt={name || strings.common.userAvatar}
          onError={() => setErroredUrl(src)}
          className={cx('rounded-full object-cover', SIZE_CLASSES[size])}
        />
      ) : (
        <div
          className={cx(
            'rounded-full flex items-center justify-center font-medium',
            'bg-gradient-to-br from-[var(--gradient-start,var(--theme-element))] to-[var(--gradient-mid,var(--theme-link))] text-white',
            SIZE_CLASSES[size],
          )}
        >
          {avatarInitials(name)}
        </div>
      )}

      {status && (
        <span
          data-testid="online-indicator"
          className={cx(
            'absolute bottom-0 right-0 block rounded-full ring-2 ring-(--theme-app-bg)',
            STATUS_CLASSES[status],
            size === 'sm' ? 'w-1.5 h-1.5' : 'w-2.5 h-2.5',
          )}
        />
      )}
    </div>
  )
}
