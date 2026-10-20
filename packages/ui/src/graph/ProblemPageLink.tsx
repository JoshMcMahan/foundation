import { ExternalLink } from '../components/ExternalLink'
import { cx } from '../cx'

/** The page a problem's type URI resolves to, or undefined for `about:blank` and no type, which
 *  have none. */
export function problemPage(type: string | null | undefined): string | undefined {
  return type && type !== 'about:blank' ? type : undefined
}

/** Links a problem to the page that explains it, in a new tab, when its type has one. */
export function ProblemPageLink({
  type,
  label,
  className,
}: {
  type: string | null | undefined
  label: string
  className?: string | undefined
}) {
  const href = problemPage(type)
  if (!href) {
    return null
  }
  return (
    <ExternalLink
      href={href}
      className={cx(
        'rounded-sm text-xs underline underline-offset-2 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--theme-focus)',
        className,
      )}
    >
      {label}
    </ExternalLink>
  )
}
