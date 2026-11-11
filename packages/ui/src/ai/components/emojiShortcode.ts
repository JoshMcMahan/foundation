import { nameToEmoji } from 'gemoji'

const CLOSED_SHORTCODE = /:([^\s:]+):$/

/** When `next` is `previous` with one colon typed before `caret`, and that colon closes a known
 *  `:shortcode:`, the text with the emoji in its place and the caret just after it. Text that
 *  arrives in one piece, such as a paste, stays as written. */
export function closeShortcode(
  previous: string,
  next: string,
  caret: number,
): { text: string; caret: number } | null {
  if (
    next.length !== previous.length + 1 ||
    next[caret - 1] !== ':' ||
    next.slice(0, caret - 1) + next.slice(caret) !== previous
  ) {
    return null
  }
  const before = next.slice(0, caret)
  const match = CLOSED_SHORTCODE.exec(before)
  // Only a whole word counts, so the colons of a URL or a time are left alone.
  if (!match?.[1] || (match.index > 0 && !/\s/.test(before[match.index - 1] ?? ''))) {
    return null
  }
  const name = match[1].toLowerCase()
  const emoji = Object.hasOwn(nameToEmoji, name) ? nameToEmoji[name] : undefined
  if (emoji === undefined) {
    return null
  }
  return {
    text: before.slice(0, match.index) + emoji + next.slice(caret),
    caret: match.index + emoji.length,
  }
}
