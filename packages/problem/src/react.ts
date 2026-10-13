import { useCallback, useMemo } from 'react'
import { createTranslator, useLocale, useTranslations } from 'use-intl'
import { ApiError, FieldError, toApiError } from './index.js'
import { baseLanguage, sharedMessagesFor } from './messages.js'

type Format = (key: string, values?: Record<string, string | number>) => string
type Translator = Format & { has: (key: string) => boolean }

/** A field the server rejected: where it sits in the form, and why, in the active language. */
export interface FieldMessage {
  /** The field's form path, such as `items[0].name`. */
  path: string
  message: string
}

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
  const translate = useTranslate()
  return useCallback(
    (err: unknown) => {
      if (err instanceof FieldError) return translate(err, undefined)
      const apiError = toApiError(err)
      const target =
        apiError.code === 'validation' && apiError.fields.length === 1
          ? (apiError.fields[0] ?? apiError)
          : apiError
      return translate(target, apiError.language)
    },
    [translate],
  )
}

/**
 * Returns a function that turns any error into the fields it rejects in the
 * request body, each with its form path and its message in the active
 * language, as `useErrorMessage` shows it. A form shows each under its field.
 */
export function useFieldMessages(): (err: unknown) => FieldMessage[] {
  const translate = useTranslate()
  return useCallback(
    (err: unknown) => {
      const apiError = err instanceof FieldError ? undefined : toApiError(err)
      const fields = apiError ? apiError.fields : [err as FieldError]
      return fields
        .filter((field) => field.pointer !== undefined && field.path !== '')
        .map((field) => ({ path: field.path, message: translate(field, apiError?.language) }))
    },
    [translate],
  )
}

/** Translates an error, given the language the server wrote its detail in. */
function useTranslate(): (target: ApiError | FieldError, language: string | undefined) => string {
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
    (target: ApiError | FieldError, language: string | undefined) => {
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
  return language !== undefined && baseLanguage(language) === baseLanguage(locale)
}
