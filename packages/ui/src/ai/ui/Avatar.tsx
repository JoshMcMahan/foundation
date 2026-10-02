import cx from 'classnames'
import { useMemo, useState } from 'react'

interface AvatarProps {
  src?: string | undefined
  name?: string
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl'
  className?: string
}

const sizeClasses = {
  sm: 'w-6 h-6 text-xs',
  md: 'w-8 h-8 text-sm',
  lg: 'w-10 h-10 text-base',
  xl: 'w-12 h-12 text-lg',
  '2xl': 'w-16 h-16 text-xl',
}

export function Avatar({ src, name, size = 'md', className }: AvatarProps) {
  const [erroredUrl, setErroredUrl] = useState<string | null>(null)

  // Track the failed URL rather than a sticky boolean so a changed URL retries
  // instead of pinning to the initials fallback after a prior load error.
  const errored = erroredUrl !== null && erroredUrl === src

  const initials = useMemo(() => {
    if (!name) {
      return '?'
    }
    const parts = name.split(/[\s.]+/).filter(Boolean)
    if (parts.length >= 2) {
      return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
    }
    return parts[0]?.[0]?.toUpperCase() || '?'
  }, [name])

  return (
    <div className={cx('relative inline-flex', className)}>
      {!src || errored ? (
        <div
          className={cx(
            'rounded-full flex items-center justify-center font-medium',
            'bg-(--theme-element,#3b82f6) text-(--theme-element-text,#ffffff)',
            sizeClasses[size],
          )}
        >
          {initials}
        </div>
      ) : (
        <img
          src={src}
          alt={name || 'User avatar'}
          onError={() => setErroredUrl(src)}
          className={cx('rounded-full object-cover', sizeClasses[size])}
        />
      )}
    </div>
  )
}
