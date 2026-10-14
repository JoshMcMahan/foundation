import { type ComponentPropsWithoutRef, type ReactNode, useId, useRef } from 'react'
import { cx } from '../cx'
import { CheckIcon, CopyIcon } from '../icons'
import { IconButton } from './IconButton'
import { InfoTip } from './InfoTip'
import { useStrings } from './Provider'
import { useCopy } from './useCopy'

/** `plain` sets rows apart by space alone; `divided` rules a line between them; `card`
 *  also frames them in a panel. */
export type DescriptionListVariant = 'plain' | 'divided' | 'card'

export interface DescriptionListProps extends Omit<ComponentPropsWithoutRef<'dl'>, 'className'> {
  variant?: DescriptionListVariant | undefined
  /** Puts each label over its value at any width. Without it they stack only when the
   *  list is too narrow for both side by side. */
  stacked?: boolean | undefined
  /** Styles the box around the list, such as its margins or width. */
  className?: string | undefined
}

// Rows are the list's children, so the variant pads them: a ruled row needs room
// above and below its line.
const variantClasses: Record<DescriptionListVariant, string> = {
  plain: '*:py-1',
  divided: 'divide-y divide-(--theme-border) *:py-2',
  card: 'panel divide-y divide-(--theme-border) px-4 *:py-2',
}

/** Names and their values, such as the details of a record in a drawer or a card. The
 *  label column is as wide as its longest label, up to two fifths of the list, so a
 *  long label wraps rather than squeezing the values; each label sits over its value
 *  when the list is narrow. */
export default function DescriptionList({
  variant = 'plain',
  stacked = false,
  className,
  children,
  ...props
}: DescriptionListProps) {
  return (
    // The list's own width decides whether it stacks, not the viewport's: a drawer or a
    // card on a wide screen is still narrow.
    <div className={cx('@container/dl min-w-0', className)}>
      <dl
        {...props}
        className={cx(
          'm-0 grid grid-cols-[minmax(0,1fr)] text-sm',
          !stacked && '@sm/dl:grid-cols-[fit-content(40%)_minmax(0,1fr)] @sm/dl:gap-x-6',
          variantClasses[variant],
        )}
      >
        {children}
      </dl>
    </div>
  )
}

export interface DescriptionListItemProps {
  label: ReactNode
  /** The value. Nothing, an empty string or `false` shows the library's empty mark. */
  children?: ReactNode
  /** Help behind an info button beside the label. */
  tooltip?: string | undefined
  /** Sets the value in a monospace face, for an ID, a path or a hash. */
  mono?: boolean | undefined
  /** Adds a button that copies the value: `true` copies its text as shown; a string
   *  copies that instead, such as a full ID behind a shortened one. */
  copy?: boolean | string | undefined
  className?: string | undefined
}

const isEmpty = (value: ReactNode) =>
  value === null || value === undefined || value === false || value === ''

/** A label and its value in a DescriptionList. */
export function DescriptionListItem({
  label,
  children,
  tooltip,
  mono = false,
  copy = false,
  className,
}: DescriptionListItemProps) {
  const labelId = useId()
  return (
    // A div may group a dt and its dd in a dl. Spanning the list's columns on a subgrid,
    // it keeps every row's label column one width and lets a divided list rule each row.
    <div className={cx('col-span-full grid grid-cols-subgrid gap-y-0.5', className)}>
      <dt className="min-w-0 leading-5 wrap-break-word text-(--theme-muted-text-color)">
        {/* Names the copy button; the info button beside it stays out of that name. */}
        <span id={labelId}>{label}</span>
        {tooltip && <InfoTip className="ml-1 align-[-2px]" text={tooltip} />}
      </dt>
      <dd className="m-0 flex min-w-0 items-start gap-1 text-(--theme-app)">
        {isEmpty(children) ? (
          <EmptyValue />
        ) : (
          <>
            <div
              data-value
              className={cx(
                'min-w-0 leading-5 wrap-anywhere',
                mono && 'font-mono text-[0.8125rem]',
              )}
            >
              {children}
            </div>
            {copy !== false && (
              <CopyValue text={copy === true ? undefined : copy} label={label} labelId={labelId} />
            )}
          </>
        )}
      </dd>
    </div>
  )
}

// A dash, as the file explorer shows for a missing size or date.
const EMPTY_MARK = '—'

// The mark the library shows where a value is missing, read out as a word rather than
// as punctuation a screen reader may skip.
function EmptyValue() {
  const { common: t } = useStrings()
  return (
    <span className="leading-5 text-(--theme-muted-text-color)">
      <span aria-hidden="true">{EMPTY_MARK}</span>
      <span className="sr-only">{t.noValue}</span>
    </span>
  )
}

function CopyValue({
  text,
  label,
  labelId,
}: {
  /** Absent, the button copies the value's text as shown. */
  text: string | undefined
  label: ReactNode
  labelId: string
}) {
  const { common: t } = useStrings()
  const { copy, copied } = useCopy()
  const buttonId = useId()
  const button = useRef<HTMLButtonElement>(null)
  const onClick = () => {
    const value = button.current?.closest('dd')?.querySelector<HTMLElement>('[data-value]')
    // innerText keeps the line breaks the reader sees between lines of a value.
    const shown = value?.innerText ?? value?.textContent
    // A label that isn't plain text can't name the copy in the toast; it says only
    // that something was copied.
    void copy(text ?? shown ?? '', typeof label === 'string' ? { label } : undefined)
  }
  return (
    <IconButton
      ref={button}
      id={buttonId}
      size="xs"
      label={copied ? t.copied : t.copy}
      // The button's own name and then the row's label, "Copy Session ID", so each copy
      // button says what it copies whatever the label holds.
      aria-labelledby={`${buttonId} ${labelId}`}
      icon={copied ? <CheckIcon /> : <CopyIcon />}
      onClick={onClick}
      className="-my-0.5"
    />
  )
}
