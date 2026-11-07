const HISTORY_STORAGE_PREFIX = 'aiChatHistory:'
export const HISTORY_MAX_ENTRIES = 100
// The history shares its storage quota with the rest of the app.
export const HISTORY_MAX_CHARS = 100_000

/** What was sent under this name in this tab, oldest first. */
export function readHistory(name: string): string[] {
  try {
    const parsed: unknown = JSON.parse(
      window.sessionStorage.getItem(`${HISTORY_STORAGE_PREFIX}${name}`) ?? '[]',
    )
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === 'string')
      : []
  } catch {
    return []
  }
}

export function appendHistory(name: string, text: string) {
  if (!text || text.length > HISTORY_MAX_CHARS) {
    return
  }
  const entries = readHistory(name)
  if (entries.at(-1) === text) {
    return
  }
  entries.push(text)
  let chars = entries.reduce((sum, entry) => sum + entry.length, 0)
  while (entries.length > HISTORY_MAX_ENTRIES || chars > HISTORY_MAX_CHARS) {
    chars -= entries.shift()?.length ?? 0
  }
  try {
    window.sessionStorage.setItem(`${HISTORY_STORAGE_PREFIX}${name}`, JSON.stringify(entries))
  } catch {
    // Storage unavailable: nothing is remembered.
  }
}
