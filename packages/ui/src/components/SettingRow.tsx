import cx from 'classnames'
import type { ReactNode } from 'react'

export function SettingRow({
  label,
  htmlFor,
  helpText,
  children,
  isFirst,
  fill,
  onClick,
}: {
  label: string
  htmlFor?: string
  helpText?: ReactNode
  children: ReactNode
  isFirst?: boolean | undefined
  /** When set, the control column fills and left-aligns for full-width inputs; default is the compact right-aligned control. */
  fill?: boolean
  /** Makes the whole row a click target for its control (e.g. a toggle). The
   * control still handles its own click; stop propagation there to avoid a
   * double toggle. */
  onClick?: () => void
}) {
  return (
    <div
      role="none"
      onClick={onClick}
      className={cx(
        'px-5 py-5 grid grid-cols-1 gap-x-8 gap-y-2',
        fill ? 'md:grid-cols-[200px_1fr]' : 'md:grid-cols-[1fr_auto]',
        !isFirst && 'border-t theme-border',
        onClick && 'cursor-pointer select-none hover:theme-hover transition-colors',
      )}
    >
      <div className="flex flex-col gap-y-1">
        <label htmlFor={htmlFor} className="font-semibold theme-text leading-tight">
          {label}
        </label>
        {helpText && <div className="theme-muted-text text-xs leading-snug">{helpText}</div>}
      </div>
      <div className={cx('min-w-0', !fill && 'flex items-center justify-end')}>{children}</div>
    </div>
  )
}

export function SettingSection({ title, isFirst }: { title: string; isFirst?: boolean }) {
  return (
    <div className={cx('px-5 py-3 theme-muted-panel', !isFirst && 'border-t theme-border')}>
      <h2 className="font-semibold text-sm uppercase tracking-wider theme-muted-text">{title}</h2>
    </div>
  )
}
