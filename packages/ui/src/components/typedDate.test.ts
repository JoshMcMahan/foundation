import { formatNumericDate, parseTypedDate } from './typedDate'

const day = (date: Date | undefined) =>
  date && [date.getFullYear(), date.getMonth() + 1, date.getDate()].join('-')
const today = new Date(2026, 9, 19)

describe('parseTypedDate', () => {
  it('reads yyyy-mm-dd in any locale', () => {
    expect(day(parseTypedDate('2026-10-30', 'de-DE', today))).toBe('2026-10-30')
    expect(day(parseTypedDate(' 2026-1-5 ', 'en-US', today))).toBe('2026-1-5')
  })

  it("reads the locale's numeric date in its own order", () => {
    expect(day(parseTypedDate('10/30/2026', 'en-US', today))).toBe('2026-10-30')
    expect(day(parseTypedDate('30.10.2026', 'de-DE', today))).toBe('2026-10-30')
    expect(day(parseTypedDate('30/10/26', 'en-GB', today))).toBe('2026-10-30')
  })

  it('puts a day and month alone in this year', () => {
    expect(day(parseTypedDate('30.10', 'de-DE', today))).toBe('2026-10-30')
  })

  it('refuses days that do not exist and text that is no date', () => {
    expect(parseTypedDate('2026-02-30', 'en-US', today)).toBeUndefined()
    expect(parseTypedDate('13/01/2026', 'en-US', today)).toBeUndefined()
    expect(parseTypedDate('soon', 'en-US', today)).toBeUndefined()
    expect(parseTypedDate('1/2/3/4', 'en-US', today)).toBeUndefined()
  })

  it('reads back what formatNumericDate writes', () => {
    for (const locale of ['en-US', 'de-DE', 'ja-JP', 'ar-EG', 'fr-FR']) {
      const date = new Date(2026, 9, 30)
      expect(day(parseTypedDate(formatNumericDate(date, locale), locale, today))).toBe('2026-10-30')
    }
  })
})
