import { type ReactNode, useSyncExternalStore } from 'react'
import { cx } from '../cx'
import { ArrowLeftIcon } from '../icons'
import { AppLink } from './AppLink'
import { type ErrorPageKind, useNavigation, useStrings } from './Provider'

export type { ErrorPageKind } from './Provider'

export interface ErrorPageProps {
  /** The HTTP status, shown large over the title and left out of what a
   *  screen reader reads, since the title says it in words. It also picks the
   *  default words: 404, 403, 401, 502 to 504, or another 5xx. */
  status?: number | string | undefined
  /** What went wrong, when no status says it, such as `network` for a request
   *  that never reached the server. Picks the default title and description. */
  kind?: ErrorPageKind | undefined
  /** By default the kind's title, then "Error {status}". With neither, the
   *  description becomes the title, so a message alone still heads the page. */
  title?: ReactNode
  /** By default the kind's description. `null` shows none. */
  description?: ReactNode
  /** `page` fills its container over a backdrop of drifting glows; `card`
   *  fills a card, clipping the backdrop to its corners; `inline` sits in a
   *  section's flow with no backdrop. */
  layout?: 'page' | 'card' | 'inline' | undefined
  /** The way back. By default back through the history when there is some,
   *  and home (`/`) when there isn't; `href` goes there instead, such as
   *  "Back to sessions". `false` offers none. */
  back?: { href?: string | undefined; label?: string | undefined } | false | undefined
  /** More ways on, before the way back, such as "Sign in" after a 401. */
  actions?: ReactNode
  /** The title's level: 1 for a page, 2 in a card or inline. */
  headingLevel?: 1 | 2 | 3 | undefined
  className?: string | undefined
  testId?: string | undefined
}

/** The kind of error an HTTP status names, or none for one without its own words. */
export function errorPageKind(status: number | string | undefined): ErrorPageKind | undefined {
  const code = typeof status === 'string' ? Number.parseInt(status, 10) : status
  if (code === undefined || Number.isNaN(code)) {
    return undefined
  }
  if (code === 404) {
    return 'notFound'
  }
  if (code === 403) {
    return 'forbidden'
  }
  if (code === 401) {
    return 'unauthenticated'
  }
  if (code === 502 || code === 503 || code === 504) {
    return 'unavailable'
  }
  return code >= 500 && code < 600 ? 'server' : undefined
}

const subscribeNever = () => () => {}

const linkClassName =
  'group inline-flex items-center gap-1.5 rounded-sm text-sm text-(--theme-link) hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--theme-focus) cursor-pointer'

/** A page, card or section that could not show what it was asked for: the
 *  status large in the theme's gradient, what happened in words, and the way
 *  back. Every word defaults from the status, and the host may pass its own. */
export function ErrorPage({
  status,
  kind: kindProp,
  title,
  description,
  layout = 'page',
  back,
  actions,
  headingLevel,
  className,
  testId,
}: ErrorPageProps) {
  const { errorPage: t } = useStrings()
  const kind = kindProp ?? errorPageKind(status)
  const hasStatus = status !== undefined && status !== ''
  const shownDescription = description === undefined && kind ? t.descriptions[kind] : description
  const fallbackTitle = kind ? t.titles[kind] : hasStatus ? t.statusTitle(String(status)) : null
  // A message with nothing else to head it is the title, as a bare error message reads best.
  const promoted = title === undefined && fallbackTitle === null && present(shownDescription)
  const heading = title ?? fallbackTitle ?? (promoted ? shownDescription : t.error)
  const Heading = `h${headingLevel ?? (layout === 'page' ? 1 : 2)}` as const
  const framed = layout !== 'inline'

  return (
    <div
      data-testid={testId}
      className={cx(
        '@container relative flex w-full items-center justify-center px-4 text-center',
        framed && 'isolate overflow-hidden',
        layout === 'page' && 'min-h-full flex-1 py-16',
        layout === 'card' && 'h-full rounded-[inherit] py-12',
        layout === 'inline' && 'py-16',
        className,
      )}
    >
      {framed && <Backdrop />}
      <div className="error-page-content relative flex w-full max-w-md flex-col items-center gap-6">
        {hasStatus && (
          <span
            aria-hidden="true"
            className={cx(
              'error-page-code select-none font-black leading-none tracking-tighter opacity-75',
              // Sized by the room it has, not the screen, so it fits a narrow card.
              layout === 'page' ? 'text-[7rem] @md:text-[10rem]' : 'text-[5rem] @md:text-[7rem]',
            )}
          >
            {status}
          </span>
        )}
        <div className={cx('flex flex-col items-center gap-3', hasStatus && '-mt-4')}>
          <Heading className="m-0 text-xl font-semibold tracking-tight text-(--theme-app)">
            {heading}
          </Heading>
          {!promoted && present(shownDescription) && (
            <p className="m-0 max-w-md text-sm text-(--theme-muted-text-color)">
              {shownDescription}
            </p>
          )}
          {(present(actions) || back !== false) && (
            <div className="mt-2 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
              {actions}
              {back !== false && <BackLink href={back?.href} label={back?.label} />}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function present(node: ReactNode): boolean {
  return node !== undefined && node !== null && node !== false && node !== ''
}

function BackLink({ href, label }: { href: string | undefined; label: string | undefined }) {
  const { errorPage: t } = useStrings()
  const navigation = useNavigation()
  // Only the browser knows its history, so the server renders the way home and
  // the page swaps in "Back" once it hydrates.
  const canGoBack = useSyncExternalStore(
    subscribeNever,
    () => navigation.canGoBack(),
    () => false,
  )
  const arrow = (
    <ArrowLeftIcon
      aria-hidden="true"
      className="size-3.5 shrink-0 transition-transform duration-200 group-hover:-translate-x-0.5 motion-reduce:transition-none rtl:rotate-180"
    />
  )
  if (href === undefined && canGoBack) {
    return (
      <button type="button" onClick={() => navigation.goBack()} className={linkClassName}>
        {arrow}
        {label ?? t.back}
      </button>
    )
  }
  return (
    <AppLink href={href ?? '/'} className={linkClassName}>
      {arrow}
      {label ?? (href === undefined ? t.home : t.back)}
    </AppLink>
  )
}

/** Two slow glows in the theme's gradient colors over a faint grid. */
function Backdrop() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-[inherit]"
    >
      <div className="error-page-glow -top-1/5 -right-1/10 size-150 error-page-glow-start" />
      <div className="error-page-glow -bottom-1/5 -left-1/10 size-125 error-page-glow-mid [animation-delay:2s]" />
      <div className="error-page-grid absolute inset-0" />
    </div>
  )
}
