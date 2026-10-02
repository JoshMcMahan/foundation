import cx from 'classnames'
import type { ReactNode } from 'react'

interface SettingsCardProps {
  /** Sentence-case section label above the card. Omit on the first card of a
   * page, where the page title already names the section. */
  title?: string
  description?: ReactNode
  /** Control rendered on the right of the section label (e.g. a small action). */
  action?: ReactNode
  /** 'adjacent' (default) sits the action next to the title (e.g. a `+`);
   * 'right' pushes it to the far edge of the header (e.g. a Save button). */
  actionAlign?: 'adjacent' | 'right'
  /** Let inner content (e.g. a dropdown menu) overflow the panel instead of
   * being clipped to its rounded corners. */
  overflowVisible?: boolean
  children: ReactNode
  className?: string
}

/**
 * A settings card: an optional sentence-case section label sits above a
 * bordered panel of rows. The label carries the breathing-room rhythm between
 * cards; the rows inside provide their own dividers via SettingRow's `isFirst`.
 */
export default function SettingsCard({
  title,
  description,
  action,
  actionAlign = 'adjacent',
  overflowVisible,
  children,
  className,
}: SettingsCardProps) {
  return (
    <section className={cx('mt-10 first:mt-0', className)}>
      {(title || action) && (
        <div className="mb-3 px-0.5">
          <div
            className={cx(
              'flex items-center gap-1.5',
              actionAlign === 'right' && 'justify-between',
            )}
          >
            {title && (
              <h2 className="text-[15px] font-semibold theme-text leading-none">{title}</h2>
            )}
            {action}
          </div>
          {description && (
            <p className="text-xs theme-muted-text mt-1.5 leading-snug">{description}</p>
          )}
        </div>
      )}
      <div className={cx('panel', overflowVisible ? 'overflow-visible' : 'overflow-hidden')}>
        {children}
      </div>
    </section>
  )
}
