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
  /** SettingRows, and SettingsHeadings between groups of them. */
  children: ReactNode
}

/** A page's settings, grouped: a titled panel of SettingRows, each ruled off from
 *  the next. Cards stack with room between them. An error about one setting, such as its
 *  Save failing, is its row's `error`; one about the whole card goes outside it, such as
 *  an ErrorText under the card, since every child of the card is ruled off as a row. */
export function SettingsCard({
  title,
  description,
  action,
  actionAlign = 'beside',
  headingLevel = 2,
  overflowVisible = false,
  className,
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
        <div
          className={cx(
            'panel divide-y divide-(--theme-border)',
            overflowVisible ? 'overflow-visible' : 'overflow-hidden',
          )}
        >
          {children}
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
 *  the right, or under the name across the row with `fill`. */
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
  /** An error about this setting, such as its Save failing: under the control, at its start,
   *  announced, and describing the control that `htmlFor` names. */
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
  const control = (
    <div
      className={cx(
        'min-w-0',
        !fill && [
          'flex items-center justify-end',
          // Stacked on a phone, a compact row that holds a text field fills the row from its
          // start, as a full-width row does: the field grows and a button beside it keeps its
          // size. A small control, such as a switch, stays at the end.
          'max-md:has-[input:not([type=checkbox],[type=radio],[type=hidden],[type=range]),textarea,[role=combobox]]:justify-start',
          'max-md:has-[input:not([type=checkbox],[type=radio],[type=hidden],[type=range]),textarea,[role=combobox]]:*:grow',
          'max-md:[&_:is(input:not([type=checkbox],[type=radio],[type=hidden],[type=range]),textarea,[role=combobox])]:min-w-0',
          'max-md:[&_:is(input:not([type=checkbox],[type=radio],[type=hidden],[type=range]),textarea,[role=combobox])]:flex-1',
        ],
      )}
    >
      {children}
    </div>
  )
  return (
    <div
      role="none"
      onClick={onClick}
      className={cx(
        'grid grid-cols-1 gap-x-8 gap-y-2 p-4',
        fill ? 'md:grid-cols-[200px_1fr]' : 'md:grid-cols-[1fr_auto]',
        onClick && 'cursor-pointer transition-colors select-none hover:theme-hover',
      )}
    >
      <div className="flex flex-col gap-y-1">
        <label htmlFor={htmlFor} className="leading-tight font-semibold theme-text">
          {label}
        </label>
        {helpText && <div className="text-xs leading-snug theme-muted-text">{helpText}</div>}
      </div>
      {hasError ? (
        // The error shares the control's cell, so it sits right under the control however
        // tall the name beside it runs.
        <div className="flex min-w-0 flex-col gap-y-2">
          {control}
          <ErrorText
            id={errorId}
            size="md"
            // From the control's start, as wide as it without widening the column.
            className="md:w-0 md:min-w-full"
          >
            {error}
          </ErrorText>
        </div>
      ) : (
        control
      )}
    </div>
  )
}
