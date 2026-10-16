import type { ComponentPropsWithRef } from 'react'
import { cx } from '../cx'
import { ExternalLinkIcon } from '../icons'
import { safeUrl } from '../safeUrl'
import { useStrings } from './Provider'

export type ExternalLinkProps = Omit<ComponentPropsWithRef<'a'>, 'target' | 'rel'> & {
  /** Marks the link as leaving the page with an arrow after its text. */
  icon?: boolean
}

/** A link that opens in a new tab, says so to screen readers, and gives the
 *  page it opens no hold on this one. Its href passes `safeUrl`, as every
 *  component's does, and one that doesn't is dropped. */
export function ExternalLink({
  href,
  children,
  icon = false,
  className,
  ...props
}: ExternalLinkProps) {
  const { common } = useStrings()
  return (
    <a
      {...props}
      // Hosts pass server data here, such as a project's homepage, and a
      // javascript: URL would run in this page when clicked.
      href={safeUrl(href)}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(icon && 'inline-flex items-center gap-1', className)}
    >
      {children}
      <span className="sr-only"> {common.opensInNewTab}</span>
      {icon && <ExternalLinkIcon className="h-3 w-3 shrink-0" aria-hidden />}
    </a>
  )
}
