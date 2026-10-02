import { highlightSegments, parseAnsiSegments, plainSegments } from './segments'

const text = (segments: { content: string }[]) =>
  segments.map((segment) => segment.content).join('')

describe('parseAnsiSegments', () => {
  it('keeps HTML-like log text as literal content', () => {
    const line = '<img src=x onerror=alert(1)>'
    const segments = parseAnsiSegments(line)

    expect(text(segments)).toBe(line)
    expect(segments.every((segment) => !segment.highlighted)).toBe(true)
  })

  it('does not decode HTML entities in log text', () => {
    const segments = parseAnsiSegments('&lt;b&gt;bold&lt;/b&gt;')

    expect(text(segments)).toBe('&lt;b&gt;bold&lt;/b&gt;')
  })

  it('turns ANSI colour codes into anser class names', () => {
    const segments = parseAnsiSegments('plain \u001b[31mred\u001b[0m done')

    expect(text(segments)).toBe('plain red done')
    const red = segments.find((segment) => segment.content === 'red')
    expect(red?.className).toBe('ansi-red-fg')
  })

  it('strips the escape codes themselves from the content', () => {
    const segments = parseAnsiSegments('\u001b[32mgreen\u001b[0m')

    expect(text(segments)).toBe('green')
    expect(text(segments)).not.toContain('\u001b')
  })
})

describe('highlightSegments', () => {
  it('returns segments untouched without a search term', () => {
    const segments = plainSegments('nothing to do')

    expect(highlightSegments(segments, '')).toBe(segments)
  })

  it('highlights every occurrence of the term', () => {
    const result = highlightSegments(plainSegments('foo bar foo baz foo'), 'foo')

    expect(text(result)).toBe('foo bar foo baz foo')
    const marked = result.filter((segment) => segment.highlighted)
    expect(marked).toHaveLength(3)
    expect(marked.every((segment) => segment.content === 'foo')).toBe(true)
  })

  it('matches case-insensitively but preserves the original casing', () => {
    const result = highlightSegments(plainSegments('Error and ERROR'), 'error')

    expect(text(result)).toBe('Error and ERROR')
    expect(result.filter((segment) => segment.highlighted).map((s) => s.content)).toEqual([
      'Error',
      'ERROR',
    ])
  })

  it('treats regex metacharacters literally', () => {
    const line = 'a.c and abc and a*c and (x)'

    expect(() => highlightSegments(plainSegments(line), '.')).not.toThrow()
    expect(() => highlightSegments(plainSegments(line), '*')).not.toThrow()
    expect(() => highlightSegments(plainSegments(line), '(')).not.toThrow()

    const dot = highlightSegments(plainSegments(line), 'a.c')
    expect(dot.filter((segment) => segment.highlighted).map((s) => s.content)).toEqual(['a.c'])

    const paren = highlightSegments(plainSegments(line), '(x)')
    expect(paren.filter((segment) => segment.highlighted).map((s) => s.content)).toEqual(['(x)'])
  })

  it('does not highlight when the term is absent', () => {
    const result = highlightSegments(plainSegments('hello world'), 'zzz')

    expect(result.some((segment) => segment.highlighted)).toBe(false)
  })

  it('keeps the ANSI class on both the matched and unmatched slices', () => {
    const result = highlightSegments(
      parseAnsiSegments('\u001b[31mred error here\u001b[0m'),
      'error',
    )

    expect(text(result)).toBe('red error here')
    for (const segment of result) {
      expect(segment.className).toBe('ansi-red-fg')
    }
    expect(result.filter((segment) => segment.highlighted).map((s) => s.content)).toEqual(['error'])
  })

  it('highlights a term spanning an ANSI colour boundary', () => {
    const result = highlightSegments(
      parseAnsiSegments('\u001b[31mer\u001b[32mror\u001b[0m'),
      'error',
    )

    expect(text(result)).toBe('error')
    const marked = result.filter((segment) => segment.highlighted)
    expect(marked.map((s) => s.content).join('')).toBe('error')
    expect(marked.map((s) => s.className)).toEqual(['ansi-red-fg', 'ansi-green-fg'])
  })

  it('does not lose text around highlighted slices', () => {
    const line = 'start MATCH middle match end'
    const result = highlightSegments(plainSegments(line), 'match')

    expect(text(result)).toBe(line)
  })
})
