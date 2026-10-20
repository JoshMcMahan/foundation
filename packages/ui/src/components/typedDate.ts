type Part = 'year' | 'month' | 'day'

// The order a locale writes a numeric date in, such as month, day, year; built once per locale.
const orders = new Map<string | undefined, Part[]>()
function partOrder(locale: string | undefined): Part[] {
  let order = orders.get(locale)
  if (!order) {
    order = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'numeric', day: 'numeric' })
      .formatToParts(new Date(2001, 10, 22))
      .map((part) => part.type)
      .filter((type): type is Part => type === 'year' || type === 'month' || type === 'day')
    orders.set(locale, order)
  }
  return order
}

function calendarDay(year: number, month: number, day: number): Date | undefined {
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
    ? date
    : undefined
}

/** The local day typed text names: `yyyy-mm-dd`, or the locale's numeric date in its own
 *  order, such as `10/30/2026` or `30.10.26`; a day and month alone fall in this year. */
export function parseTypedDate(
  text: string,
  locale: string | undefined,
  today = new Date(),
): Date | undefined {
  const trimmed = text.trim()
  const iso = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) {
    return calendarDay(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  }
  const numbers = trimmed.split(/\D+/).filter(Boolean).map(Number)
  if (numbers.length < 2 || numbers.length > 3) {
    return undefined
  }
  const order = partOrder(locale)
  const parts = numbers.length === 3 ? order : order.filter((part) => part !== 'year')
  const value = { year: today.getFullYear(), month: 0, day: 0 }
  parts.forEach((part, index) => {
    value[part] = numbers[index] ?? 0
  })
  if (numbers.length === 3 && value.year < 100) {
    value.year += 2000
  }
  return calendarDay(value.year, value.month, value.day)
}

/** A day as the locale writes it in numbers, the form `parseTypedDate` reads back. */
export function formatNumericDate(date: Date, locale: string | undefined): string {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    // Digits the box can read back, whatever the locale writes numbers in.
    numberingSystem: 'latn',
  }).format(date)
}
