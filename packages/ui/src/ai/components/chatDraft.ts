const DRAFT_STORAGE_PREFIX = 'aiChatDraft:'
// Beyond this a draft is likely pasted bulk content; persisting it risks
// blowing the storage quota shared with the rest of the app.
export const DRAFT_MAX_LENGTH = 10_000
// Drafts are only cleared on send, so one left in a conversation nobody
// returns to would otherwise stay in the browser for good.
export const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000

interface StoredDraft {
  text: string
  savedAt: number
}

function draftKey(conversationId?: string): string {
  return `${DRAFT_STORAGE_PREFIX}${conversationId ?? 'new'}`
}

/** Older versions stored the bare text, which has no age. */
function parseDraft(raw: string): StoredDraft | { text: string; savedAt?: undefined } {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as StoredDraft).text === 'string' &&
      typeof (parsed as StoredDraft).savedAt === 'number'
    ) {
      return parsed as StoredDraft
    }
  } catch {}
  return { text: raw }
}

const expired = (savedAt: number, now: number) => now - savedAt > DRAFT_TTL_MS

export function readDraft(conversationId?: string): string {
  try {
    const raw = window.localStorage.getItem(draftKey(conversationId))
    if (raw === null) {
      return ''
    }
    const draft = parseDraft(raw)
    return draft.savedAt !== undefined && expired(draft.savedAt, Date.now()) ? '' : draft.text
  } catch {
    return ''
  }
}

export function storeDraft(conversationId: string | undefined, text: string) {
  try {
    if (!text || text.length > DRAFT_MAX_LENGTH) {
      window.localStorage.removeItem(draftKey(conversationId))
    } else {
      const draft: StoredDraft = { text, savedAt: Date.now() }
      window.localStorage.setItem(draftKey(conversationId), JSON.stringify(draft))
    }
  } catch {
    // Storage unavailable (SSR, disabled storage): drafts simply don't persist.
  }
}

export function clearDraft(conversationId?: string) {
  try {
    window.localStorage.removeItem(draftKey(conversationId))
  } catch {
    // Storage unavailable: nothing to clear.
  }
}

/** Removes expired drafts, and starts the clock on ones stored without an age. */
export function sweepDrafts(now = Date.now()) {
  try {
    const storage = window.localStorage
    const keys: string[] = []
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (key?.startsWith(DRAFT_STORAGE_PREFIX)) {
        keys.push(key)
      }
    }
    for (const key of keys) {
      const raw = storage.getItem(key)
      if (raw === null) {
        continue
      }
      const draft = parseDraft(raw)
      if (draft.savedAt === undefined) {
        storage.setItem(key, JSON.stringify({ text: draft.text, savedAt: now }))
      } else if (expired(draft.savedAt, now)) {
        storage.removeItem(key)
      }
    }
  } catch {
    // Storage unavailable: nothing to sweep.
  }
}
