import type { ComponentPropsWithRef, MouseEvent } from 'react'
import { safeUrl } from '../safeUrl'
import { useLink, useStrings } from './Provider'

/** Where a control navigates, for any component that can be a link instead of a button. */
export interface LinkTarget {
  /** Navigates there: a plain click goes through the host's router, and a
   *  modified or middle click opens it as any link would. */
  href?: string | undefined
  /** Loads the page instead of routing, for paths the host's router doesn't serve. */
  reloadDocument?: boolean | undefined
  /** Such as `_blank`, which also cuts the opened page's hold on this one. */
  target?: string | undefined
}

export type AppLinkProps = Omit<ComponentPropsWithRef<'a'>, 'href' | 'target'> &
  LinkTarget & {
    /** Keeps it a link that goes nowhere: no href, `aria-disabled`, still
     *  focusable so a tooltip saying why stays reachable. */
    disabled?: boolean | undefined
  }

// An absolute URL to another origin (or a scheme the router can't serve, such
// as blob:) is not the host router's to handle. The URL is resolved as the
// browser would resolve the href rather than matched by its spelling: a
// browser reads a backslash as a slash, so `/\evil.example` is another
// host, and a router given it would hand that host to a modified or middle
// click as if it were a path in the app.
function leavesApp(url: string): boolean {
  if (typeof window === 'undefined') {
    // No page to resolve against while rendering on a server: anything with a
    // scheme or a leading pair of slashes, either way round, may leave.
    return /^([a-z][a-z\d+.-]*:|[/\\]{2})/i.test(url.replace(/[\t\n\r]/g, '').trimStart())
  }
  const { origin, protocol } = window.location
  try {
    const resolved = new URL(url, window.location.href)
    // A blob: URL carries this origin but is no route.
    return resolved.origin !== origin || resolved.protocol !== protocol
  } catch {
    return true
  }
}

/** True for a click the browser would open in place: the primary button with
 *  no modifier. A link's own onClick work, such as closing a drawer or clearing
 *  state, belongs to that click only; the others open a new tab or window and
 *  leave this page as it is. */
export function isPlainClick(event: MouseEvent<Element>): boolean {
  return (
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey &&
    event.currentTarget.getAttribute('target') !== '_blank'
  )
}

/** A link through the host's router (`useLink`): the one way a component
 *  renders an `href`. In-app paths route client-side; `reloadDocument` and
 *  URLs that leave the app get a plain anchor. Every href passes `safeUrl`,
 *  and one that doesn't, or a disabled link, renders without an href. */
export function AppLink({
  href,
  reloadDocument = false,
  target,
  disabled = false,
  rel,
  onClick,
  children,
  ...props
}: AppLinkProps) {
  const Link = useLink()
  const { common } = useStrings()
  const url = disabled ? undefined : safeUrl(href)
  if (!url) {
    // A disabled link keeps its role, and its place in the tab order for a
    // tooltip saying why, but goes nowhere.
    return (
      <a {...props} role="link" aria-disabled="true" tabIndex={props.tabIndex ?? 0}>
        {children}
      </a>
    )
  }
  const linkProps = {
    ...props,
    target,
    rel: rel ?? (target === '_blank' ? 'noopener noreferrer' : undefined),
    onClick,
    // Said after the name, as `ExternalLink` does, so a new tab isn't a surprise.
    children:
      target === '_blank' ? (
        <>
          {children}
          <span className="sr-only"> {common.opensInNewTab}</span>
        </>
      ) : (
        children
      ),
  }
  return reloadDocument || leavesApp(url) ? (
    <a {...linkProps} href={url} />
  ) : (
    <Link {...linkProps} href={url} />
  )
}
