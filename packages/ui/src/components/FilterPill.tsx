import cx from 'classnames'

interface FilterPillProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}

export function FilterPill({ active, onClick, children }: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'px-3 py-1.5 text-xs font-medium rounded-full border transition-all duration-200',
        active
          ? 'bg-[var(--theme-panel-bg)] border-[var(--theme-border)] text-[var(--theme-panel)] shadow-sm'
          : 'bg-transparent border-transparent text-[var(--theme-muted-text-color)] hover:text-[var(--theme-panel)] hover:bg-[var(--theme-hover)]',
      )}
    >
      {children}
    </button>
  )
}
