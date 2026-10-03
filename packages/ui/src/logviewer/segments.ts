import Anser from 'anser'
import type { LogSegment } from '../engine'

function segmentClassName(chunk: Anser.AnserJsonEntry): string {
  const classes: string[] = []
  if (chunk.fg) {
    classes.push(`${chunk.fg}-fg`)
  }
  if (chunk.bg) {
    classes.push(`${chunk.bg}-bg`)
  }
  for (const decoration of chunk.decorations) {
    classes.push(`ansi-${decoration}`)
  }
  return classes.join(' ')
}

export function parseAnsiSegments(line: string): LogSegment[] {
  return Anser.ansiToJson(line, {
    use_classes: true,
    remove_empty: true,
  }).map((chunk) => ({
    content: chunk.content,
    className: segmentClassName(chunk),
  }))
}

export function plainSegments(text: string): LogSegment[] {
  return [{ content: text, className: '' }]
}

/**
 * Matches are located on the concatenated line text so a term straddling an
 * ANSI colour boundary still highlights, then sliced back onto the segments it
 * covers.
 */
export function highlightSegments(segments: LogSegment[], searchTerm: string): LogSegment[] {
  if (!searchTerm) {
    return segments
  }

  const haystack = segments
    .map((segment) => segment.content)
    .join('')
    .toLowerCase()
  const needle = searchTerm.toLowerCase()
  let found = haystack.indexOf(needle)
  if (found === -1) {
    return segments
  }

  const matchStarts: number[] = []
  while (found !== -1) {
    matchStarts.push(found)
    found = haystack.indexOf(needle, found + needle.length)
  }

  const result: LogSegment[] = []
  let matchIndex = 0
  let offset = 0
  for (const segment of segments) {
    const segmentEnd = offset + segment.content.length
    let cursor = offset
    while (cursor < segmentEnd) {
      let matchStart = matchStarts[matchIndex]
      while (matchStart !== undefined && matchStart + needle.length <= cursor) {
        matchIndex++
        matchStart = matchStarts[matchIndex]
      }
      if (matchStart === undefined || matchStart >= segmentEnd) {
        result.push({
          ...segment,
          content: segment.content.slice(cursor - offset),
        })
        break
      }
      if (matchStart > cursor) {
        result.push({
          ...segment,
          content: segment.content.slice(cursor - offset, matchStart - offset),
        })
        cursor = matchStart
      }
      const matchEnd = Math.min(matchStart + needle.length, segmentEnd)
      result.push({
        ...segment,
        content: segment.content.slice(cursor - offset, matchEnd - offset),
        highlighted: true,
      })
      cursor = matchEnd
    }
    offset = segmentEnd
  }
  return result
}
