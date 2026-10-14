import { useRender } from '@base-ui/react/use-render'
import type { ReactElement, ReactNode } from 'react'
import { cx } from '../cx'
import { AppLink, type LinkTarget } from './AppLink'

const sizeClasses = {
  sm: 'max-w-[400px] p-6',
  md: 'max-w-[520px] p-10',
  lg: 'max-w-[560px] p-8',
}

export interface CardProps extends LinkTarget {
  children: ReactNode
  /** Its width and padding: `sm` for a short form, `lg` for a wide one. */
  size?: keyof typeof sizeClasses | undefined
  /** A stronger shadow, for a card standing alone on a page, such as sign-in. */
  elevated?: boolean | undefined
  /** Renders the card as this element, such as a button, which makes the
   *  whole card pressable: it lifts on hover and shows focus. A card that
   *  navigates takes `href` instead, which makes it a link the same way. */
  render?: ReactElement | undefined
  className?: string | undefined
}

/** A raised surface holding one task, such as a sign-in form or a choice among
 *  a few options. */
export function Card({
  children,
  size = 'md',
  elevated = false,
  render: renderProp,
  href,
  reloadDocument,
  target,
  className,
}: CardProps) {
  const render =
    href === undefined ? (
      renderProp
    ) : (
      <AppLink href={href} reloadDocument={reloadDocument} target={target} />
    )
  return useRender({
    render: render ?? <div />,
    props: {
      className: cx(
        'block w-full rounded-2xl border border-(--theme-border) bg-(--theme-panel-bg) backdrop-blur-xl',
        elevated ? 'shadow-(--theme-shadow-xl)' : 'shadow-(--theme-shadow)',
        sizeClasses[size],
        render &&
          'cursor-pointer text-left text-inherit no-underline transition-[background-color,box-shadow] duration-150 hover:bg-(--theme-panel-hover) hover:shadow-(--theme-shadow-lg) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--theme-link) motion-reduce:transition-none',
        className,
      ),
      children,
    },
  })
}

export interface CardHeaderProps {
  badge?: ReactNode
  title: string
  description?: ReactNode
  className?: string
  align?: 'center' | 'left'
  /** The title's level in the page's outline: 1 for a card that is the page, such
   *  as sign-in; 2 or 3 for a card among others under the page's own title. */
  headingLevel?: 1 | 2 | 3 | undefined
}

export function CardHeader({
  badge,
  title,
  description,
  className = '',
  align = 'center',
  headingLevel = 1,
}: CardHeaderProps) {
  const Heading = `h${headingLevel}` as const
  return (
    <div className={cx(align === 'center' ? 'text-center' : 'text-left', 'mb-6', className)}>
      {badge && (
        <div className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-(--theme-border) bg-(--theme-muted-panel-bg) px-3 py-1.5 text-xs font-medium text-(--theme-muted-text-color)">
          {badge}
        </div>
      )}
      <Heading className="text-2xl font-bold tracking-tight text-(--theme-app)">{title}</Heading>
      {description && (
        <p className="mt-2 text-sm leading-relaxed text-(--theme-muted-text-color)">
          {description}
        </p>
      )}
    </div>
  )
}
