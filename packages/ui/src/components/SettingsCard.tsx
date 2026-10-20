import { createContext, type ReactNode, useContext, useId, useLayoutEffect } from 'react'
import { cx } from '../cx'
import { ErrorText } from './Field'

const HeadingLevel = createContext<3 | 4>(3)

export interface SettingsCardProps {
  /** Names the card above it. Leave it out on a page's first card, where the
   *  page title already names it. */
  title?: string | undefined
  description?: ReactNode
  /** Beside the title, such as an add button; with `actionAlign="end"`, at the
   *  header's far edge, such as Save. */
  action?: ReactNode
  actionAlign?: 'beside' | 'end' | undefined
  /** The title's level in the page's outline; its SettingsHeadings sit one below. */
  headingLevel?: 2 | 3 | undefined
  /** Lets content such as an inline menu reach past the card's rounded edge. */
  overflowVisible?: boolean | undefined
  className?: string | undefined
  /** An error about the whole card, such as its header's Save or Connect failing: at the top of
   *  the card, inside it, above its rows, and announced. */
  error?: ReactNode
  /** SettingRows, and SettingsHeadings between groups of them. */
  children: ReactNode
}

/** A page's settings, grouped: a titled panel of SettingRows, each ruled off from
 *  the next. Cards stack with room between them. An error about one setting, such as its
 *  Save failing, is its row's `error`; one about the whole card, such as its header's
 *  action failing, is the card's `error`. */
export function SettingsCard({
  title,
  description,
  action,
  actionAlign = 'beside',
  headingLevel = 2,
  overflowVisible = false,
  className,
  error,
  children,
}: SettingsCardProps) {
  const Heading = `h${headingLevel}` as const
  return (
    <HeadingLevel value={(headingLevel + 1) as 3 | 4}>
      <section className={cx('mt-10 first:mt-0', className)}>
        {(title || action) && (
          <div className="mb-4 px-0.5">
            <div
              className={cx(
                'flex items-center gap-1.5',
                actionAlign === 'end' && 'justify-between',
              )}
            >
              {title && (
                <Heading className="text-base leading-none font-semibold theme-text">
                  {title}
                </Heading>
              )}
              {action}
            </div>
            {description && (
              <p className="mt-1.5 text-xs leading-snug theme-muted-text">{description}</p>
            )}
          </div>
        )}
        <div className={cx('panel', overflowVisible ? 'overflow-visible' : 'overflow-hidden')}>
          {/* Above the rows and outside their rules, with the rows' padding. */}
          <ErrorText size="md" className="px-4 pt-4">
            {error}
          </ErrorText>
          <div className="divide-y divide-(--theme-border)">{children}</div>
        </div>
      </section>
    </HeadingLevel>
  )
}

/** A heading between groups of rows inside a SettingsCard, a level below the card's title. */
export function SettingsHeading({ children }: { children: ReactNode }) {
  const Heading = `h${useContext(HeadingLevel)}` as const
  return (
    <Heading className="px-4 py-3 text-sm font-semibold tracking-wider uppercase theme-muted-panel theme-muted-text">
      {children}
    </Heading>
  )
}

/** One setting in a SettingsCard: its name and help on the left, its control on
 *  the right, or under the name across the row with `fill`.
 *
 *  On a phone a small control, such as a switch, a checkbox or a short select, stays on the
 *  name's line at the row's end. One too wide to fit beside the name, such as a text field
 *  with its Save button, moves to a line of its own and takes the row's width from its start:
 *  a single wrapper the host puts it in, such as a `<form className="flex gap-2">`, stretches
 *  across the row, and a text field in it grows while a button beside it keeps its size. A
 *  control of the host's own that should grow there takes `flex-1`. */
export function SettingRow({
  label,
  htmlFor,
  helpText,
  fill = false,
  onClick,
  error,
  children,
}: {
  label: string
  /** The control's id, so the name labels it. */
  htmlFor?: string | undefined
  helpText?: ReactNode
  /** The control takes the row's width, as a text field does; otherwise it sits compact at the right. */
  fill?: boolean | undefined
  /** Makes the whole row press its control, such as a switch. The control still
   *  handles its own press; stop it propagating there so it doesn't toggle twice. */
  onClick?: (() => void) | undefined
  /** An error about this setting, such as its Save failing: under the row from the name's
   *  start, or with `fill` under the control from its start, on a wide screen; across the row
   *  on a phone. It is announced and describes the control that `htmlFor` names. */
  error?: ReactNode
  children: ReactNode
}) {
  const errorId = useId()
  const hasError = error !== undefined && error !== null && error !== false && error !== ''
  // The control is the host's, so the row names its error on it by id.
  useLayoutEffect(() => {
    const control = hasError && htmlFor ? document.getElementById(htmlFor) : null
    if (!control) {
      return
    }
    const ids = (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean)
    if (!ids.includes(errorId)) {
      control.setAttribute('aria-describedby', [...ids, errorId].join(' '))
    }
    return () => {
      const rest = (control.getAttribute('aria-describedby') ?? '')
        .split(/\s+/)
        .filter((id) => id && id !== errorId)
      if (rest.length > 0) {
        control.setAttribute('aria-describedby', rest.join(' '))
      } else {
        control.removeAttribute('aria-describedby')
      }
    }
  }, [hasError, htmlFor, errorId])
  return (
    <div
      role="none"
      onClick={onClick}
      className={cx(
        'gap-x-8 gap-y-2 p-4',
        // A phone wraps the control onto a line of its own only when it can't sit beside the
        // name: the name keeps nearly all the room on a shared line, and the control takes the
        // whole line when it wraps.
        'flex flex-wrap items-center',
        'md:grid md:items-stretch',
        fill ? 'md:grid-cols-[200px_1fr]' : 'md:grid-cols-[1fr_auto]',
        onClick && 'cursor-pointer transition-colors select-none hover:theme-hover',
      )}
    >
      <div
        className={cx(
          'flex min-w-0 grow-[999] basis-48 flex-col gap-y-1 self-start',
          fill && 'max-md:basis-full',
        )}
      >
        <label htmlFor={htmlFor} className="leading-tight font-semibold theme-text">
          {label}
        </label>
        {helpText && <div className="text-xs leading-snug theme-muted-text">{helpText}</div>}
      </div>
      <div
        className={cx(
          'flex min-w-0 grow items-center gap-2',
          !fill && 'md:justify-end',
          // One wrapper of the host's stretches across the control's room, such as a form,
          // and on a phone's line of its own a text field inside grows beside its button.
          fill ? '[&>:only-child]:grow' : 'max-md:[&>:only-child]:grow',
          'max-md:[&_:is(input:not([type=checkbox],[type=radio],[type=hidden],[type=file]),textarea)]:min-w-0',
          'max-md:[&_:is(input:not([type=checkbox],[type=radio],[type=hidden],[type=file]),textarea)]:flex-1',
        )}
      >
        {children}
      </div>
      {hasError && (
        <ErrorText
          id={errorId}
          size="md"
          className={cx(
            // A line of its own across the row on a phone. On a wide screen it starts under a
            // full-width control, whose column always has room to read it; a compact control,
            // such as a switch, may be too narrow, so its error takes the whole row from the
            // name's start.
            'basis-full',
            fill ? 'md:col-start-2 md:w-0 md:min-w-full' : 'md:col-span-2',
          )}
        >
          {error}
        </ErrorText>
      )}
    </div>
  )
}
