import cx from 'classnames'
import type React from 'react'

interface SettingsGroupProps {
  title?: string
  children: React.ReactNode
  className?: string
}

export default function SettingsGroup({ title, children, className }: SettingsGroupProps) {
  return (
    <div className={cx('mt-8 first:mt-0', className)}>
      {title && (
        <h2 className="text-[11px] font-semibold uppercase tracking-wider theme-muted-text mb-2 px-1">
          {title}
        </h2>
      )}
      <div className="panel divide-y divide-(--theme-border)">{children}</div>
    </div>
  )
}
