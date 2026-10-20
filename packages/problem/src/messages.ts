import en from './messages/en.json' with { type: 'json' }
import es from './messages/es.json' with { type: 'json' }
import ja from './messages/ja.json' with { type: 'json' }
import ko from './messages/ko.json' with { type: 'json' }
import zh from './messages/zh.json' with { type: 'json' }

/** The shared codes' messages, by language. */
export const sharedMessages = { en, es, ja, ko, zh } as const

type Language = keyof typeof sharedMessages

/**
 * The language of a locale such as `zh-CN` or `zh_CN`: `zh`. Cut on both
 * separators, as the server's Localizer does, so the two pick the same catalog.
 */
export function baseLanguage(locale: string): string {
  return locale.trim().toLowerCase().split(/[-_]/)[0] ?? ''
}

/** The shared catalog for a locale such as `zh-CN`, falling back to English. */
export function sharedMessagesFor(locale: string): typeof en {
  return sharedMessages[baseLanguage(locale) as Language] ?? en
}

/**
 * The application a problem's type names: `workflow` for
 * `/problems/workflow/unknown_input`, relative or absolute. An app's catalog
 * keeps the messages for another application's codes under that name, so
 * they can't collide with its own. A shared type such as `/problems/too_long`,
 * `about:blank` and no type name none.
 */
export function typeApp(type: string | null | undefined): string | undefined {
  if (!type) return undefined
  let path: string
  try {
    // The base only resolves a relative type; its host is never read.
    path = new URL(type, 'http://localhost').pathname
  } catch {
    return undefined
  }
  return /^\/problems\/([^/]+)\/[^/]+$/.exec(path)?.[1]
}
