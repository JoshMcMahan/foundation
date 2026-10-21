import { useCallback, useMemo } from 'react'
import { createTranslator, useLocale, useTranslations } from 'use-intl'
import { ApiError, FieldError, type Params, toApiError } from './index.js'
import { baseLanguage, sharedMessagesFor, typeApp } from './messages.js'

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
 * message for the error's code, found by its type as `useCodeMessage` finds
 * it: the app's own, at `apiErrors.<app>.<code>` for a type that names an app
 * and then at `apiErrors.<code>`, otherwise the shared message. A validation
 * problem with one invalid field shows that field's. Never show an error's
 * message yourself: from a server that doesn't localize, it is English.
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

/** A code's message in the active language, with its params, found by the
 *  problem's type too; undefined when no catalog has it. */
type CodeMessage = (
  code: string,
  params?: Params,
  type?: string | null | undefined,
) => string | undefined

/**
 * Returns a function that gives a code's message in the active language, with
 * its params: the app's own at `apiErrors.<code>` when it has one, otherwise
 * the shared message, otherwise undefined. Given the problem's type, when it
 * names an application, as `/problems/workflow/unknown_input` does, the app's
 * message at `apiErrors.workflow.unknown_input` comes first. An app's own codes
 * can stay at the top level; another registry's go under its name, so one that
 * shares a code with the app keeps its own message and params.
 *
 * It is for problems that aren't a failed request, such as the warnings a
 * server reports about what it was given, which keep their own text when no
 * catalog has their code; for an error, use `useErrorMessage`.
 */
export function useCodeMessage(): CodeMessage {
  return useCatalogs().message
}

/** Translates an error, given the language the server wrote its detail in. */
function useTranslate(): (target: ApiError | FieldError, language: string | undefined) => string {
  const { message, shared, locale } = useCatalogs()
  return useCallback(
    (target: ApiError | FieldError, language: string | undefined) => {
      const fromServer = target instanceof ApiError ? target.message : target.detail
      // An ApiError with no message has its code as one, which is no message.
      if (fromServer && fromServer !== target.code && sameLanguage(language, locale)) {
        return fromServer
      }
      return message(target.code, target.params, target.type) ?? shared('unknown')
    },
    [message, shared, locale],
  )
}

/** A code's message from the app's `apiErrors` or the shared ones, and the
 *  shared ones themselves, in the active language. */
function useCatalogs(): { message: CodeMessage; shared: Translator; locale: string } {
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
  const message = useCallback(
    (code: string, params?: Params, type?: string | null) => {
      const owner = typeApp(type)
      // use-intl reads a dotted key as a path into nested messages.
      const owned = owner && `${owner}.${code}`
      if (owned && app.has(owned)) return app(owned, params)
      if (app.has(code)) return app(code, params)
      if (shared.has(code)) return shared(code, params)
      return undefined
    },
    [app, shared],
  )
  return { message, shared, locale }
}

function sameLanguage(language: string | undefined, locale: string): boolean {
  return language !== undefined && baseLanguage(language) === baseLanguage(locale)
}
