import { Popover } from '@base-ui/react/popover'
import { type ClassNames, type DateRange, DayPicker, type Matcher } from '@daypicker/react'
import { type ReactElement, type ReactNode, useId, useRef, useState } from 'react'
import { cx } from '../cx'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from '../icons'
import { buttonClasses } from './buttonClasses'
import { useFieldLabelledControl } from './Field'
import { type FieldBoxSize, fieldBox } from './fieldBox'
import { panelClassName, positionerClassName } from './floating'
import { useLocale, useStrings } from './Provider'
import { usePopupContainer } from './popupContainer'
import { Tooltip } from './Tooltip'
import { formatNumericDate, parseTypedDate } from './typedDate'

export interface DatePickerProps {
  /** As a native date input holds it: `yyyy-MM-dd`, or with `withTime` the local
   *  `yyyy-MM-ddTHH:mm` of `datetime-local`. Empty while nothing is chosen. */
  value: string
  onValueChange: (value: string) => void
  /** A time beside the date. */
  withTime?: boolean | undefined
  /** The earliest and latest days, and with `withTime` times, that can be chosen, in the value's
   *  format. */
  min?: string | undefined
  max?: string | undefined
  /** Seconds the time steps by, such as 900 for quarter hours. */
  timeStep?: number | undefined
  /** Leaves out the clear button, for a field that always holds a date. */
  required?: boolean | undefined
  disabled?: boolean | undefined
  placeholder?: string | undefined
  id?: string | undefined
  'aria-label'?: string | undefined
  'aria-labelledby'?: string | undefined
  'aria-describedby'?: string | undefined
  'aria-invalid'?: boolean | undefined
  'aria-required'?: boolean | undefined
  /** `sm` for dense places such as toolbars and table cells, `lg` for a form that stands alone,
   *  such as sign-in. */
  size?: FieldBoxSize | undefined
  /** On the row that holds the date and the time: its width or margin. */
  className?: string | undefined
  /** Renders the field as this button, such as a chip that says the date its own way. The
   *  button shows the date itself; `placeholder` and `size` then go unused. */
  trigger?: ReactElement | undefined
  /** A hint on the trigger button. */
  triggerTooltip?: ReactNode
  /** The edge of the field the calendar lines up with. */
  align?: 'start' | 'end' | undefined
}

const pad = (n: number) => String(n).padStart(2, '0')
const toDay = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

/** The local calendar day a value names, or undefined for none or nonsense. */
function parseDay(value: string | undefined): Date | undefined {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) {
    return undefined
  }
  const [, y, m, d] = match.map(Number) as [number, number, number, number]
  const date = new Date(y, m - 1, d)
  return Number.isNaN(date.getTime()) ? undefined : date
}

const timeOf = (value: string | undefined) => value?.match(/T(\d{2}:\d{2}(?::\d{2})?)/)?.[1]

/** The locale's first day of the week, where the browser reports it; Sunday otherwise. */
function firstWeekday(tag: string | undefined): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  try {
    const locale = new Intl.Locale(tag ?? navigator.language) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number }
      weekInfo?: { firstDay: number }
    }
    const firstDay = (locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay
    return firstDay === undefined ? 0 : ((firstDay % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6)
  } catch {
    return 0
  }
}

function dateFormats(locale: string | undefined) {
  return {
    caption: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }),
    weekday: new Intl.DateTimeFormat(locale, { weekday: 'narrow' }),
    longDay: new Intl.DateTimeFormat(locale, { dateStyle: 'full' }),
    shownDay: new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }),
    // A day this year goes without its year, as dates read elsewhere in a page.
    shownDayThisYear: new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric' }),
    longWeekday: new Intl.DateTimeFormat(locale, { weekday: 'long' }),
    weekStartsOn: firstWeekday(locale),
  }
}

// Built once per locale, since every picker on a page shares one; the browser's without a locale.
const formatsByLocale = new Map<string | undefined, ReturnType<typeof dateFormats>>()
function formatsFor(locale: string | undefined) {
  let formats = formatsByLocale.get(locale)
  if (!formats) {
    formats = dateFormats(locale)
    formatsByLocale.set(locale, formats)
  }
  return formats
}

const calendarClassNames: Partial<ClassNames> = {
  root: 'relative p-3',
  months: 'flex flex-col',
  month: 'flex flex-col gap-2',
  month_caption: 'flex h-7 items-center px-1',
  caption_label: 'text-sm font-semibold',
  nav: 'absolute top-3 right-3 flex items-center gap-1',
  button_previous: buttonClasses({ variant: 'ghost', size: 'sm', iconOnly: true }),
  button_next: buttonClasses({ variant: 'ghost', size: 'sm', iconOnly: true }),
  month_grid: 'border-collapse',
  weekdays: '',
  weekday: 'size-9 text-center text-xs font-normal text-(--theme-muted-text-color)',
  week: '',
  day: 'size-9 p-0 text-center text-sm',
  day_button:
    'size-9 rounded-md cursor-pointer hover:bg-(--theme-hover) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--theme-focus) disabled:cursor-not-allowed disabled:hover:bg-transparent',
  selected:
    '[&>button]:bg-(--theme-accent) [&>button]:text-(--theme-accent-text) [&>button]:hover:bg-(--theme-accent)',
  today: 'font-semibold [&>button]:underline [&>button]:underline-offset-4',
  outside: 'text-(--theme-muted-text-color) opacity-60',
  disabled: 'text-(--theme-muted-text-color) opacity-40',
}

const triggerClassName = (size: FieldBoxSize) =>
  cx(
    fieldBox({ size }),
    // Fills its field as every other control does; the time beside it keeps to its content.
    'flex flex-1 cursor-pointer items-center text-left',
    size === 'sm' ? 'min-w-32 gap-1.5' : 'min-w-40 gap-2',
  )

/**
 * A day from a calendar, and with `withTime` a time beside it. The value is a string as a native
 * date or datetime-local input holds it, so it reads the same in forms and URLs; months, weekdays
 * and the shown date follow the reader's locale.
 */
export function DatePicker({
  value,
  onValueChange,
  withTime = false,
  min,
  max,
  timeStep = 60,
  required = false,
  disabled = false,
  placeholder,
  id,
  'aria-label': ariaLabel,
  'aria-labelledby': ariaLabelledBy,
  'aria-describedby': ariaDescribedBy,
  'aria-invalid': ariaInvalid,
  'aria-required': ariaRequired,
  size = 'md',
  className,
  trigger,
  triggerTooltip,
  align = 'start',
}: DatePickerProps) {
  const portal = usePopupContainer()
  const t = useStrings().datePicker
  const { common } = useStrings()
  // The trigger is a button Base UI doesn't name from a Field's label, so it reads the Field.
  const field = useFieldLabelledControl()
  const [open, setOpen] = useState(false)
  const locale = useLocale()
  const { caption, weekday, longDay, shownDay, shownDayThisYear, longWeekday, weekStartsOn } =
    formatsFor(locale)
  const day = parseDay(value)
  const uid = useId()
  // The month on show, and what is typed in the box above it.
  const [month, setMonth] = useState<Date | undefined>(undefined)
  const [typed, setTyped] = useState('')
  const typedBox = useRef<HTMLInputElement>(null)
  const time = timeOf(value) ?? timeOf(min) ?? '00:00'
  const earliest = parseDay(min)
  const latest = parseDay(max)
  const outOfRange: Matcher[] = [
    ...(earliest ? [{ before: earliest }] : []),
    ...(latest ? [{ after: latest }] : []),
  ]

  const emit = (next: Date | undefined, nextTime = time) => {
    if (!next) {
      onValueChange('')
      return
    }
    onValueChange(withTime ? `${toDay(next)}T${nextTime}` : toDay(next))
  }

  const opensOn = day ?? earliest
  const pick = (next: Date | undefined) => {
    emit(next)
    setOpen(false)
  }
  const onOpenChange = (next: boolean) => {
    if (next) {
      setMonth(opensOn ?? new Date())
      setTyped(day ? formatNumericDate(day, locale) : '')
    }
    setOpen(next)
  }
  const inRange = (date: Date) => (!earliest || date >= earliest) && (!latest || date <= latest)
  const typedDay = typed.trim() ? parseTypedDate(typed, locale) : undefined
  const typedInvalid = typed.trim() !== '' && (!typedDay || !inRange(typedDay))
  const shown = day
    ? (day.getFullYear() === new Date().getFullYear() ? shownDayThisYear : shownDay).format(day)
    : undefined
  const triggerProps = {
    id: id ?? field?.id,
    disabled,
    'aria-label': ariaLabel,
    'aria-labelledby': ariaLabelledBy ?? (ariaLabel ? undefined : field?.['aria-labelledby']),
    'aria-describedby': ariaDescribedBy ?? field?.['aria-describedby'],
    'aria-invalid': ariaInvalid || field?.['aria-invalid'],
    'aria-required': ariaRequired || field?.['aria-required'],
  }

  // A day at an end of the range bounds the time too, as datetime-local's min and max do.
  const sameDay = (bound: string | undefined) =>
    day !== undefined && parseDay(bound)?.getTime() === day.getTime()

  const picker = (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <Tooltip content={triggerTooltip}>
        {trigger ? (
          <Popover.Trigger {...triggerProps} render={trigger} />
        ) : (
          <Popover.Trigger {...triggerProps} className={triggerClassName(size)}>
            <CalendarIcon
              aria-hidden="true"
              className={cx(
                'shrink-0 text-(--theme-muted-text-color)',
                size === 'sm' ? 'size-3' : 'size-3.5',
              )}
            />
            <span className={cx('truncate', !day && 'text-(--theme-placeholder)')}>
              {shown ?? placeholder ?? t.pickDate}
            </span>
          </Popover.Trigger>
        )}
      </Tooltip>
      <Popover.Portal {...portal}>
        <Popover.Positioner align={align} sideOffset={4} className={positionerClassName}>
          {/* Typing is the quickest way in; the calendar is a Tab away. */}
          <Popover.Popup initialFocus={typedBox} className={panelClassName}>
            <div className="border-b border-(--theme-border) p-2">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                spellCheck={false}
                aria-label={t.typeDate}
                aria-invalid={typedInvalid || undefined}
                aria-describedby={typedInvalid ? `${uid}invalid` : undefined}
                placeholder={formatNumericDate(new Date(), locale)}
                value={typed}
                ref={typedBox}
                onChange={(event) => {
                  const next = event.target.value
                  setTyped(next)
                  const parsed = parseTypedDate(next, locale)
                  if (parsed) {
                    setMonth(parsed)
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault()
                    if (typedDay && inRange(typedDay)) {
                      pick(typedDay)
                    }
                  }
                }}
                className={cx(fieldBox({ size: 'sm' }), 'tabular-nums')}
              />
              {typedInvalid && (
                <div
                  id={`${uid}invalid`}
                  className="mt-1 text-xs text-(--theme-error-text)"
                  aria-live="polite"
                >
                  {t.invalidDate}
                </div>
              )}
            </div>
            <DayPicker
              {...(required
                ? { mode: 'single', required: true, selected: day, onSelect: pick }
                : { mode: 'single', selected: day, onSelect: pick })}
              {...(month && { month })}
              onMonthChange={setMonth}
              {...(earliest && { startMonth: earliest })}
              {...(latest && { endMonth: latest })}
              disabled={outOfRange}
              weekStartsOn={weekStartsOn}
              showOutsideDays
              fixedWeeks
              classNames={calendarClassNames}
              formatters={{
                formatCaption: (month) => caption.format(month),
                formatWeekdayName: (date) => weekday.format(date),
              }}
              labels={{
                labelDayButton: (date) => longDay.format(date),
                labelPrevious: () => t.previousMonth,
                labelNext: () => t.nextMonth,
                labelGrid: (month) => caption.format(month),
                labelWeekday: (date) => longWeekday.format(date),
              }}
              components={{
                Chevron: ({ orientation }) =>
                  orientation === 'left' ? (
                    <ChevronLeftIcon aria-hidden="true" />
                  ) : (
                    <ChevronRightIcon aria-hidden="true" />
                  ),
              }}
            />
            {!required && day && (
              <div className="flex justify-end border-t border-(--theme-border) px-3 py-2">
                <button
                  type="button"
                  className={buttonClasses({ variant: 'ghost', size: 'xs' })}
                  onClick={() => {
                    emit(undefined)
                    setOpen(false)
                  }}
                >
                  {common.clear}
                </button>
              </div>
            )}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
  // A trigger of the host's own stands where the host puts it, as one button.
  if (trigger && !withTime) {
    return picker
  }
  return (
    <div
      className={cx(
        trigger ? 'inline-flex' : 'flex w-full',
        'items-center',
        size === 'sm' ? 'gap-1.5' : 'gap-2',
        className,
      )}
    >
      {picker}
      {withTime && (
        <input
          type="time"
          aria-label={t.time}
          value={day ? time : ''}
          step={timeStep}
          min={sameDay(min) ? timeOf(min) : undefined}
          max={sameDay(max) ? timeOf(max) : undefined}
          disabled={disabled}
          aria-invalid={ariaInvalid || field?.['aria-invalid']}
          onChange={(event) => {
            const next = event.target.value
            if (next) {
              // A time before any day is chosen lands on the earliest day allowed, or today.
              emit(day ?? earliest ?? new Date(), next)
            }
          }}
          className={cx(fieldBox({ size }), 'w-auto tabular-nums')}
        />
      )}
    </div>
  )
}

export type CalendarProps = {
  /** The earliest and latest days that can be chosen. */
  min?: Date | undefined
  max?: Date | undefined
  /** The month it opens on, when it differs from the chosen day's. */
  defaultMonth?: Date | undefined
  /** Moves focus to the chosen day, or today, as it appears. */
  autoFocus?: boolean | undefined
} & (
  | { mode: 'single'; selected: Date | undefined; onSelect: (day: Date | undefined) => void }
  | {
      /** Two days, both included; the second click ends the range. */
      mode: 'range'
      selected: DateRange | undefined
      onSelect: (range: DateRange | undefined) => void
    }
)

const rangeClassNames: Partial<ClassNames> = {
  ...calendarClassNames,
  selected: '',
  range_start:
    '[&>button]:bg-(--theme-accent) [&>button]:text-(--theme-accent-text) [&>button]:hover:bg-(--theme-accent)',
  range_end:
    '[&>button]:bg-(--theme-accent) [&>button]:text-(--theme-accent-text) [&>button]:hover:bg-(--theme-accent)',
  range_middle: '[&>button]:bg-(--theme-accent-subtle) [&>button]:rounded-none',
}

/** The month grid DatePicker opens, for a panel that holds a calendar in place, such as a
 *  date filter's picker. Months, weekdays and labels follow the reader's locale. */
export function Calendar({ min, max, defaultMonth, autoFocus = false, ...props }: CalendarProps) {
  const t = useStrings().datePicker
  const { caption, weekday, longDay, longWeekday, weekStartsOn } = formatsFor(useLocale())
  const outOfRange: Matcher[] = [
    ...(min ? [{ before: min }] : []),
    ...(max ? [{ after: max }] : []),
  ]
  const opensOn =
    defaultMonth ?? (props.mode === 'single' ? props.selected : props.selected?.from) ?? min
  return (
    <DayPicker
      {...(props.mode === 'single'
        ? { mode: 'single', selected: props.selected, onSelect: props.onSelect }
        : { mode: 'range', selected: props.selected, onSelect: props.onSelect })}
      {...(opensOn && { defaultMonth: opensOn })}
      {...(min && { startMonth: min })}
      {...(max && { endMonth: max })}
      disabled={outOfRange}
      weekStartsOn={weekStartsOn}
      autoFocus={autoFocus}
      showOutsideDays
      fixedWeeks
      classNames={props.mode === 'range' ? rangeClassNames : calendarClassNames}
      formatters={{
        formatCaption: (month) => caption.format(month),
        formatWeekdayName: (date) => weekday.format(date),
      }}
      labels={{
        labelDayButton: (date) => longDay.format(date),
        labelPrevious: () => t.previousMonth,
        labelNext: () => t.nextMonth,
        labelGrid: (month) => caption.format(month),
        labelWeekday: (date) => longWeekday.format(date),
      }}
      components={{
        Chevron: ({ orientation }) =>
          orientation === 'left' ? (
            <ChevronLeftIcon aria-hidden="true" />
          ) : (
            <ChevronRightIcon aria-hidden="true" />
          ),
      }}
    />
  )
}
