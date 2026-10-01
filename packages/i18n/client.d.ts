// Types for the module @parallelworks/i18n/vite serves. Reference it from
// tsconfig ("types": ["@parallelworks/i18n/client"]).
declare module 'virtual:i18n' {
  import type { AbstractIntlMessages } from 'use-intl'

  export const locales: readonly string[]
  export const defaultLocale: string
  /** The default locale's common messages, bundled with the app. */
  export const defaultMessages: AbstractIntlMessages
  /** A locale's common messages, or with catalog, one feature's. */
  export function loadMessages(locale: string, catalog?: string): Promise<AbstractIntlMessages>
}
