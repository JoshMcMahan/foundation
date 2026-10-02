import cx from 'classnames'

interface ISectionHeaderProps {
  className?: string
  /** 'sm' heads a group inside a page rather than the page's own section. */
  size?: 'md' | 'sm'
  children: React.ReactNode
}
export default function SectionHeader({
  children,
  className = '',
  size = 'md',
}: ISectionHeaderProps) {
  return (
    <div
      className={cx(
        'w-full font-semibold',
        size === 'sm' ? 'mb-2 text-sm theme-text' : 'text-lg',
        className,
      )}
    >
      {children}
    </div>
  )
}
