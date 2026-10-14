import {
  type ComponentPropsWithoutRef,
  createContext,
  type ReactNode,
  useContext,
  useId,
  useRef,
} from 'react'
import { cx } from '../cx'
import { CopyButton } from './CopyButton'
import { InfoTip } from './InfoTip'
import { useStrings } from './Provider'
import { withPathBreaks } from './pathBreaks'

/** `plain` sets rows apart by space alone; `divided` rules a line between them; `card`
 *  also frames them in a panel. */
export type DescriptionListVariant = 'plain' | 'divided' | 'card'

export interface DescriptionListProps
  extends Omit<ComponentPropsWithoutRef<'dl'>, 'className' | 'title'> {
  variant?: DescriptionListVariant | undefined
  /** A heading over the list, which names it, such as "Actor" among a record's
   *  details. */
  title?: ReactNode
  /** The title's level in the page's outline. */
  headingLevel?: 2 | 3 | 4 | undefined
  /** Puts each label over its value at any width. Without it they stack only when the
   *  list is too narrow for both side by side. In a DescriptionListGroup, the group's
   *  `stacked` decides. */
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

// One column while the container is narrow; beside it, labels as wide as the longest
// of them up to two fifths, so a long label wraps rather than squeezing the values.
const columns = (stacked: boolean) =>
  cx(
    'grid grid-cols-[minmax(0,1fr)]',
    !stacked && '@sm/dl:grid-cols-[fit-content(40%)_minmax(0,1fr)] @sm/dl:gap-x-6',
  )

// Inside a group, a list and its rows lay out on the group's columns.
const InGroup = createContext(false)

const titleClassName = 'col-span-full m-0 mb-1 text-sm font-semibold text-(--theme-app)'

/** Names and their values, such as the details of a record in a drawer or a card. The
 *  label column is as wide as its longest label, up to two fifths of the list, so a
 *  long label wraps rather than squeezing the values; each label sits over its value
 *  when the list is narrow. Lists side by side in one panel share their label column
 *  inside a `DescriptionListGroup`. */
export default function DescriptionList({
  variant = 'plain',
  title,
  headingLevel = 3,
  stacked = false,
  className,
  children,
  ...props
}: DescriptionListProps) {
  const grouped = useContext(InGroup)
  const titleId = useId()
  const Heading = `h${headingLevel}` as const
  const list = (
    <dl
      {...props}
      className={cx(
        'm-0 text-sm',
        grouped ? 'col-span-full grid grid-cols-subgrid' : columns(stacked),
        variantClasses[variant],
      )}
    >
      {children}
    </dl>
  )
  // A dl takes no name of its own, so a titled list is a group named by its title.
  const named = title !== undefined ? { role: 'group', 'aria-labelledby': titleId } : {}
  const heading = title !== undefined && (
    <Heading id={titleId} className={titleClassName}>
      {title}
    </Heading>
  )
  if (grouped) {
    return (
      <div {...named} className={cx('col-span-full grid grid-cols-subgrid', className)}>
        {heading}
        {list}
      </div>
    )
  }
  return (
    // The list's own width decides whether it stacks, not the viewport's: a drawer or a
    // card on a wide screen is still narrow.
    <div {...named} className={cx('@container/dl min-w-0', className)}>
      {heading}
      {list}
    </div>
  )
}

/** Description lists in one panel, such as a record's Overview, Actor and Target, that
 *  share one label column: it fits the longest label across all of them, so their
 *  values start at one edge down the panel. Each list keeps its own title and variant;
 *  all of them stack together when the panel is narrow. */
export function DescriptionListGroup({
  stacked = false,
  className,
  children,
}: {
  /** Puts each label over its value at any width. */
  stacked?: boolean | undefined
  /** Styles the box around the group, such as its margins or width. */
  className?: string | undefined
  /** `DescriptionList`s. */
  children: ReactNode
}) {
  return (
    // The lists subgrid onto these columns, so every row's label sizes the one column.
    <div className={cx('@container/dl min-w-0', className)}>
      <div className={cx(columns(stacked), 'gap-y-6')}>
        <InGroup value>{children}</InGroup>
      </div>
    </div>
  )
}

export interface DescriptionListItemProps {
  label: ReactNode
  /** The value. Nothing, an empty string or `false` shows the library's empty mark.
   *  A path or URL in it, or in a link that is it, wraps after its slashes. */
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
            {/* Wraps between a path's segments first, and mid-word only for a segment
                too long for a line of its own, such as a hash. */}
            <div
              data-value
              className={cx(
                'min-w-0 leading-5 wrap-anywhere',
                mono && 'font-mono text-[0.8125rem]',
              )}
            >
              {withPathBreaks(children)}
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
  const buttonId = useId()
  const button = useRef<HTMLButtonElement>(null)
  const shown = () => {
    const value = button.current?.closest('dd')?.querySelector<HTMLElement>('[data-value]')
    // innerText keeps the line breaks the reader sees between lines of a value.
    return value?.innerText ?? value?.textContent ?? ''
  }
  return (
    <CopyButton
      ref={button}
      id={buttonId}
      size="xs"
      text={text ?? shown}
      // A label that isn't plain text can't name the copy in the toast; it says only
      // that something was copied.
      label={typeof label === 'string' ? label : undefined}
      // The button's own name and then the row's label, "Copy Session ID", so each copy
      // button says what it copies whatever the label holds.
      aria-labelledby={typeof label === 'string' ? undefined : `${buttonId} ${labelId}`}
      className="-my-0.5"
    />
  )
}
