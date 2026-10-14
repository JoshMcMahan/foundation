// A paste arrives as bare text, with no fence to say what it is. These rules
// recognize the formats people paste into a chat about their systems often
// enough to be worth coloring; anything else stays plain text rather than
// risk a confident wrong guess.

function meaningfulLines(text: string): string[] {
  return text.split('\n').filter((l) => l.trim() !== '' && !/^\s*#/.test(l))
}

function mostly(lines: string[], test: (line: string) => boolean): boolean {
  return lines.length > 0 && lines.filter(test).length / lines.length >= 0.8
}

function isJson(trimmed: string): boolean {
  if (!/^[[{]/.test(trimmed)) {
    return false
  }
  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

const YAML_LINE = /^\s*(-\s+)?["']?[\w./-]+["']?\s*:(\s|$)|^\s*-(\s|$)|^---\s*$/
const TOML_LINE = /^\s*\[{1,2}[\w."-]+\]{1,2}\s*$|^\s*[\w."-]+\s*=\s*\S/

/** The highlighter's name for the language a paste is written in, or ''
 *  when it is not recognizably one. */
export function guessPasteLanguage(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) {
    return ''
  }
  if (isJson(trimmed)) {
    return 'json'
  }
  const all = trimmed.split('\n')
  if (all.some((l) => /^(diff --git |@@ -\d)/.test(l))) {
    return 'diff'
  }
  if (/^<(!doctype html|html)\b/i.test(trimmed)) {
    return 'html'
  }
  if (/^<[?!\w]/.test(trimmed) && trimmed.endsWith('>')) {
    return 'xml'
  }
  const first = all[0] ?? ''
  if (/^#!.*\b(ba|z)?sh\b/.test(first) || mostly(meaningfulLines(trimmed), (l) => /^\$ /.test(l))) {
    return 'bash'
  }
  if (/^(select|insert|update|delete|create|alter|with)\s/i.test(first)) {
    return 'sql'
  }
  const lines = meaningfulLines(trimmed)
  if (lines.length >= 2 && mostly(lines, (l) => YAML_LINE.test(l))) {
    return 'yaml'
  }
  if (lines.length >= 2 && mostly(lines, (l) => TOML_LINE.test(l))) {
    return 'toml'
  }
  return ''
}

/** The paste as a fenced code block in its language. The fence outruns any
 *  run of backticks inside the paste, so nothing in it can close the fence. */
export function fencePaste(text: string): string {
  const longest = Math.max(2, ...[...text.matchAll(/`+/g)].map((m) => m[0].length))
  const fence = '`'.repeat(longest + 1)
  return `${fence}${guessPasteLanguage(text)}\n${text.replace(/\n+$/, '')}\n${fence}`
}
