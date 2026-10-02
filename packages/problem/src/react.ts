import { useCallback, useMemo } from 'react'
import { createTranslator, useLocale, useTranslations } from 'use-intl'
import { ApiError, FieldError, toApiError } from './index.js'
import { sharedMessagesFor } from './messages.js'

type Format = (key: string, values?: Record<string, string | number>) => string
type Translator = Format & { has: (key: string) => boolean }

/**
 * Returns a function that turns any error into a message in the active
 * language. When the server wrote the error in that language (see
 * `problemMiddleware`), it shows the server's detail. Otherwise it shows the
 * message for the error's code: the app's own at `apiErrors.<code>` when it
 * has one, otherwise the shared message. A validation problem with one
 * invalid field shows that field's. Never show an error's message yourself:
 * from a server that doesn't localize, it is English.
 */
export function useErrorMessage(): (err: unknown) => string {
  const app = useTranslations('apiErrors') as unknown as Translator
  const locale = useLocale()
  const shared = useMemo(
    () =>
      createTranslator({
        locale,
        messages: sharedMessagesFor(locale),
        namespace: 'apiErrors',
      }) as unknown as Translator,
    [locale],
  )
  return useCallback(
    (err: unknown) => {
      let target: ApiError | FieldError
      let language: string | undefined
      if (err instanceof FieldError) {
        target = err
      } else {
        target = toApiError(err)
        language = target.language
      }
      if (
        target instanceof ApiError &&
        target.code === 'validation' &&
        target.fields.length === 1
      ) {
        target = target.fields[0] ?? target
      }
      const fromServer = target instanceof ApiError ? target.message : target.detail
      if (fromServer && sameLanguage(language, locale)) return fromServer
      if (app.has(target.code)) return app(target.code, target.params)
      if (shared.has(target.code)) return shared(target.code, target.params)
      return shared('unknown')
    },
    [app, shared, locale],
  )
}

function sameLanguage(language: string | undefined, locale: string): boolean {
  const base = (tag: string) => tag.toLowerCase().split(/[-_]/)[0]
  return language !== undefined && base(language) === base(locale)
}
