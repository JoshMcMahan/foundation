import type { ReactNode } from 'react'
import { cx } from '../cx'

export interface SettingsCardProps {
  /** Names the card above it. Leave it out on a page's first card, where the
   *  page title already names it. */
  title?: string | undefined
  description?: ReactNode
  /** Beside the title, such as an add button; with `actionAlign="end"`, at the
   *  header's far edge, such as Save. */
  action?: ReactNode
  actionAlign?: 'beside' | 'end' | undefined
  /** Lets content such as an inline menu reach past the card's rounded edge. */
  overflowVisible?: boolean | undefined
  className?: string | undefined
  /** SettingRows, and SettingsHeadings between groups of them. */
  children: ReactNode
}

/** A page's settings, grouped: a titled panel of SettingRows, each ruled off from
 *  the next. Cards stack with room between them. */
export function SettingsCard({
  title,
  description,
  action,
  actionAlign = 'beside',
  overflowVisible = false,
  className,
  children,
}: SettingsCardProps) {
  return (
    <section className={cx('mt-10 first:mt-0', className)}>
      {(title || action) && (
        <div className="mb-3 px-0.5">
          <div
            className={cx('flex items-center gap-1.5', actionAlign === 'end' && 'justify-between')}
          >
            {title && (
              <h2 className="text-[15px] leading-none font-semibold theme-text">{title}</h2>
            )}
            {action}
          </div>
          {description && (
            <p className="mt-1.5 text-xs leading-snug theme-muted-text">{description}</p>
          )}
        </div>
      )}
      <div
        className={cx(
          'panel divide-y divide-(--theme-border)',
          overflowVisible ? 'overflow-visible' : 'overflow-hidden',
        )}
      >
        {children}
      </div>
    </section>
  )
}

/** A heading between groups of rows inside a SettingsCard. */
export function SettingsHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="px-5 py-3 text-sm font-semibold tracking-wider uppercase theme-muted-panel theme-muted-text">
      {children}
    </h3>
  )
}

/** One setting in a SettingsCard: its name and help on the left, its control on
 *  the right, or under the name across the row with `fill`. */
export function SettingRow({
  label,
  htmlFor,
  helpText,
  fill = false,
  onClick,
  children,
}: {
  label: string
  /** The control's id, so the name labels it. */
  htmlFor?: string | undefined
  helpText?: ReactNode
  /** The control takes the row's width, as a text field does; otherwise it sits compact at the right. */
  fill?: boolean | undefined
  /** Makes the whole row press its control, such as a switch. The control still
   *  handles its own press; stop it propagating there so it doesn't toggle twice. */
  onClick?: (() => void) | undefined
  children: ReactNode
}) {
  return (
    <div
      role="none"
      onClick={onClick}
      className={cx(
        'grid grid-cols-1 gap-x-8 gap-y-2 px-5 py-5',
        fill ? 'md:grid-cols-[200px_1fr]' : 'md:grid-cols-[1fr_auto]',
        onClick && 'cursor-pointer transition-colors select-none hover:theme-hover',
      )}
    >
      <div className="flex flex-col gap-y-1">
        <label htmlFor={htmlFor} className="leading-tight font-semibold theme-text">
          {label}
        </label>
        {helpText && <div className="text-xs leading-snug theme-muted-text">{helpText}</div>}
      </div>
      <div className={cx('min-w-0', !fill && 'flex items-center justify-end')}>{children}</div>
    </div>
  )
}
