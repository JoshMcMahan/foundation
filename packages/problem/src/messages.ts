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
