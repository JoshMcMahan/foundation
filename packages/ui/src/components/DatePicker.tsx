import { Popover } from '@base-ui/react/popover'
import { type ClassNames, DayPicker, type Matcher } from '@daypicker/react'
import { useState } from 'react'
import { cx } from '../cx'
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from '../icons'
import { buttonClasses } from './buttonClasses'
import { fieldBox } from './fieldBox'
import { panelClassName, positionerClassName } from './floating'
import { useStrings } from './Provider'

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
  className?: string | undefined
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
function firstWeekday(): 0 | 1 | 2 | 3 | 4 | 5 | 6 {
  try {
    const locale = new Intl.Locale(navigator.language) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number }
      weekInfo?: { firstDay: number }
    }
    const firstDay = (locale.getWeekInfo?.() ?? locale.weekInfo)?.firstDay
    return firstDay === undefined ? 0 : ((firstDay % 7) as 0 | 1 | 2 | 3 | 4 | 5 | 6)
  } catch {
    return 0
  }
}

const caption = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })
const weekday = new Intl.DateTimeFormat(undefined, { weekday: 'narrow' })
const longDay = new Intl.DateTimeFormat(undefined, { dateStyle: 'full' })
const shownDay = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' })

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
    'size-9 rounded-md cursor-pointer outline-none hover:bg-(--theme-hover) focus-visible:ring-2 focus-visible:ring-(--theme-focus-ring) disabled:cursor-not-allowed disabled:hover:bg-transparent',
  selected:
    '[&>button]:bg-(--theme-accent) [&>button]:text-(--theme-accent-text) [&>button]:hover:bg-(--theme-accent)',
  today: 'font-semibold [&>button]:underline [&>button]:underline-offset-4',
  outside: 'text-(--theme-muted-text-color) opacity-60',
  disabled: 'text-(--theme-muted-text-color) opacity-40',
}

const triggerClassName = cx(
  fieldBox(),
  // Fills its field as every other control does; the time beside it keeps to its content.
  'flex flex-1 min-w-40 cursor-pointer items-center gap-2 text-left',
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
  className,
}: DatePickerProps) {
  const t = useStrings().datePicker
  const { common } = useStrings()
  const [open, setOpen] = useState(false)
  const [weekStartsOn] = useState(firstWeekday)
  const day = parseDay(value)
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

  // A day at an end of the range bounds the time too, as datetime-local's min and max do.
  const sameDay = (bound: string | undefined) =>
    day !== undefined && parseDay(bound)?.getTime() === day.getTime()

  return (
    <div className={cx('flex w-full items-center gap-2', className)}>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          id={id}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid || undefined}
          aria-required={ariaRequired || undefined}
          className={triggerClassName}
        >
          <CalendarIcon
            aria-hidden="true"
            className="size-3.5 shrink-0 text-(--theme-muted-text-color)"
          />
          <span className={cx('truncate', !day && 'text-(--theme-muted-text-color)')}>
            {day ? shownDay.format(day) : (placeholder ?? t.pickDate)}
          </span>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Positioner align="start" sideOffset={4} className={positionerClassName}>
            <Popover.Popup className={panelClassName}>
              <DayPicker
                {...(required
                  ? { mode: 'single', required: true, selected: day, onSelect: pick }
                  : { mode: 'single', selected: day, onSelect: pick })}
                {...(opensOn && { defaultMonth: opensOn })}
                {...(earliest && { startMonth: earliest })}
                {...(latest && { endMonth: latest })}
                disabled={outOfRange}
                weekStartsOn={weekStartsOn}
                autoFocus
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
                  labelWeekday: (date) =>
                    new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date),
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
      {withTime && (
        <input
          type="time"
          aria-label={t.time}
          value={day ? time : ''}
          step={timeStep}
          min={sameDay(min) ? timeOf(min) : undefined}
          max={sameDay(max) ? timeOf(max) : undefined}
          disabled={disabled}
          aria-invalid={ariaInvalid || undefined}
          onChange={(event) => {
            const next = event.target.value
            if (next) {
              // A time before any day is chosen lands on the earliest day allowed, or today.
              emit(day ?? earliest ?? new Date(), next)
            }
          }}
          className={cx(fieldBox(), 'w-auto tabular-nums')}
        />
      )}
    </div>
  )
}
