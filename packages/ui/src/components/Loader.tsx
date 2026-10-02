import cx from 'classnames'
import { LoaderIcon } from '../icons'

const RIPPLE_STAGGER_S = 0.22

const LOGO_RINGS = [
  'M24.89,55V32.14a7.25,7.25,0,1,1,7.25,7.25h-6',
  'M17.27,58.12v-26A14.88,14.88,0,1,1,32.14,47H24.89',
  'M9.25,52.35V32.14A22.9,22.9,0,1,1,32.14,55H24.89',
  'M62.68,32.14A30.54,30.54,0,1,1,1.6,32.14,30.54,30.54,0,1,1,62.68,32.14',
]

interface LoaderProps {
  size?: number | string
  text?: string | undefined
  textSize?: number
  color?: string
  full?: boolean
  loaderStyle?: React.CSSProperties
  variant?: 'spinner' | 'logo'
}

export default function Loader({
  size = 48,
  text,
  textSize = 12,
  full = true,
  color = '',
  loaderStyle = {},
  variant = 'spinner',
}: LoaderProps) {
  const loaderColor = color || 'text-(--theme-element,#3b82f6)'
  const dimension = typeof size === 'number' ? `${size}px` : size
  return (
    <div
      role="status"
      aria-label={text || 'Loading'}
      className={cx(
        full && 'w-full',
        'flex flex-col flex-wrap justify-center items-center gap-y-1',
      )}
    >
      <div
        className={cx('w-full flex justify-center items-center', loaderColor)}
        style={loaderStyle}
      >
        {variant === 'logo' ? (
          <svg
            viewBox="0 0 64.29 64.29"
            width={dimension}
            height={dimension}
            fill="none"
            stroke="currentColor"
            strokeWidth={3.2}
            aria-hidden="true"
          >
            {LOGO_RINGS.map((d, i) => (
              <path
                key={d}
                d={d}
                className="logo-loader-ring"
                style={{
                  animationDelay: `${(i * RIPPLE_STAGGER_S).toFixed(2)}s`,
                }}
              />
            ))}
          </svg>
        ) : (
          <LoaderIcon className="animate-spin" style={{ fontSize: dimension }} />
        )}
      </div>
      {text && (
        <div className="text-center italic" style={{ fontSize: `${textSize}px` }}>
          {text}
        </div>
      )}
    </div>
  )
}
