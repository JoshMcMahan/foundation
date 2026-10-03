import cx from 'classnames'
import { useState } from 'react'
import { avatarInitials } from '../../components/Avatar'

interface AvatarProps {
  src?: string | undefined
  name?: string
  className?: string
}

const SIZE_CLASSES = 'w-6 h-6 text-xs'

export function Avatar({ src, name, className }: AvatarProps) {
  const [erroredUrl, setErroredUrl] = useState<string | null>(null)

  // Track the failed URL rather than a sticky boolean so a changed URL retries
  // instead of pinning to the initials fallback after a prior load error.
  const errored = erroredUrl !== null && erroredUrl === src

  return (
    <div className={cx('relative inline-flex', className)}>
      {!src || errored ? (
        <div
          className={cx(
            'rounded-full flex items-center justify-center font-medium',
            'bg-(--theme-element,#3b82f6) text-(--theme-element-text,#ffffff)',
            SIZE_CLASSES,
          )}
        >
          {avatarInitials(name)}
        </div>
      ) : (
        <img
          src={src}
          alt={name || 'User avatar'}
          onError={() => setErroredUrl(src)}
          className={cx('rounded-full object-cover', SIZE_CLASSES)}
        />
      )}
    </div>
  )
}
