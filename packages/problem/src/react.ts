import { useCallback, useMemo } from 'react'
import { createTranslator, useLocale, useTranslations } from 'use-intl'
import { ApiError, FieldError, toApiError } from './index.js'
import { sharedMessagesFor } from './messages.js'

type Format = (key: string, values?: Record<string, string | number>) => string
type Translator = Format & { has: (key: string) => boolean }

/**
 * Returns a function that turns any error into a message in the active
 * language. It shows the message for the error's code: the app's own at
 * `apiErrors.<code>` when it has one, otherwise the shared message. A
 * validation problem with one invalid field shows that field's rule. Never
 * show an error's own message, which is English.
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
      let target: ApiError | FieldError = err instanceof FieldError ? err : toApiError(err)
      if (
        target instanceof ApiError &&
        target.code === 'validation' &&
        target.fields.length === 1
      ) {
        target = target.fields[0] ?? target
      }
      if (app.has(target.code)) return app(target.code, target.params)
      if (shared.has(target.code)) return shared(target.code, target.params)
      return shared('unknown')
    },
    [app, shared],
  )
}
