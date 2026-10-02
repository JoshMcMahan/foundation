import type { ComponentProps } from 'react'
import { StatusDot } from '../../components/StatusBadge'

interface ResourceOptionIconProps {
  imageUrl?: string | undefined
  fallbackIcon: string
  alt: string
  variant?: ComponentProps<typeof StatusDot>['variant']
  dotSize?: number
}

// Dropdown-option icon for resource pickers: a status dot next to the
// resource-type image.
export function ResourceOptionIcon({
  imageUrl,
  fallbackIcon,
  alt,
  variant = 'success',
  dotSize = 6,
}: ResourceOptionIconProps) {
  return (
    <span className="flex items-center gap-1.5 shrink-0">
      <StatusDot variant={variant} size={dotSize} />
      <img
        src={imageUrl || fallbackIcon}
        alt={alt}
        className="h-4 w-4 object-contain"
        onError={(e) => {
          e.currentTarget.src = fallbackIcon
        }}
      />
    </span>
  )
}
