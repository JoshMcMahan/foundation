import type { ComponentPropsWithRef } from 'react'
import { ExternalLinkIcon } from '../icons'
import { safeUrl } from '../safeUrl'
import { useStrings } from './Provider'

export type ExternalLinkProps = Omit<ComponentPropsWithRef<'a'>, 'target' | 'rel'> & {
  /** Marks the link as leaving the page with an arrow after its text. */
  icon?: boolean
  /** Says "opens in a new tab" to screen readers after the text, unless false: for a link
   *  whose own words already say so, or whose `aria-label` replaces its text. */
  announce?: boolean
}

/** A link that opens in a new tab, says so to screen readers, and gives the
 *  page it opens no hold on this one. Its href passes `safeUrl`, as every
 *  component's does, and one that doesn't is dropped. */
export function ExternalLink({
  href,
  children,
  icon = false,
  announce = true,
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
      className={className}
    >
      {children}
      {announce && <span className="sr-only"> {common.opensInNewTab}</span>}
      {/* Inline after the last word, so a wrapped link ends with it rather than centering it. */}
      {icon && <ExternalLinkIcon className="ml-1 inline-block h-3 w-3 align-[-1px]" aria-hidden />}
    </a>
  )
}
