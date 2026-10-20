// Highlighting for CodeBlock, through the same plugin Markdown's renderer
// uses, so a block on a page and a fenced block in an answer share one shiki,
// one cache of results and one set of colors. CodeBlock imports this module
// only once it renders, so the highlighter never rides along in a page chunk.
import { code as plugin } from '@streamdown/code'
import type { BundledLanguage } from 'shiki'
import { CODE_THEMES } from './codeTheme'

export interface CodeToken {
  content: string
  color?: string
  fontStyle?: 'italic'
}

interface ShikiToken {
  content: string
  color?: string
  fontStyle?: number
  htmlStyle?: Record<string, string>
}

// Shiki's FontStyle flag for italic; the theme sets no other style.
const ITALIC = 1

function toLines(tokens: ShikiToken[][]): CodeToken[][] {
  return tokens.map((line) =>
    line.map((token) => {
      // Both registrations hold the same --theme-code-* variables, so the light
      // color is the color in either mode.
      const color = token.htmlStyle?.['color'] ?? token.color
      const italic =
        token.htmlStyle?.['font-style'] === 'italic' || ((token.fontStyle ?? 0) & ITALIC) === ITALIC
      return {
        content: token.content,
        ...(color ? { color } : {}),
        ...(italic ? { fontStyle: 'italic' as const } : {}),
      }
    }),
  )
}

/** Tokens for each line of `source`, at once when they are cached, otherwise
 *  null now and `onReady` once the language has loaded. A language the
 *  highlighter doesn't know reads as plain text. */
export function highlightCode(
  source: string,
  language: string,
  incomplete: boolean,
  onReady: (lines: CodeToken[][]) => void,
): CodeToken[][] | null {
  const result = plugin.highlight(
    {
      code: source,
      language: (language || 'text') as BundledLanguage,
      themes: CODE_THEMES,
      isIncomplete: incomplete,
    },
    (later) => onReady(toLines(later.tokens as ShikiToken[][])),
  )
  return result ? toLines(result.tokens as ShikiToken[][]) : null
}
