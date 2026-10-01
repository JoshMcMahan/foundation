import {
  createContext,
  type ReactNode,
  Suspense,
  startTransition,
  use,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { type AbstractIntlMessages, IntlProvider, useLocale, useMessages } from 'use-intl'

/**
 * Loads a locale's messages: the ones every page needs, or with catalog, one
 * feature's, loaded only where that feature is shown. The Vite plugin in
 * @parallelworks/i18n/vite generates one.
 */
export type LoadMessages = (locale: string, catalog?: string) => Promise<AbstractIntlMessages>

interface Locales {
  setLocale: (locale: string) => Promise<void>
  load: LoadMessages
}

const LocalesContext = createContext<Locales | null>(null)

function useLocales(): Locales {
  const locales = useContext(LocalesContext)
  if (!locales) throw new Error('@parallelworks/i18n: wrap the app in <LocaleProvider>')
  return locales
}

/** Switches the app's language; resolves once the new messages are shown. */
export function useSetLocale(): (locale: string) => Promise<void> {
  return useLocales().setLocale
}

const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone

export function LocaleProvider({
  initial,
  load,
  fallbackLocale,
  onChange,
  timeZone = browserTimeZone,
  children,
}: {
  initial: { locale: string; messages: AbstractIntlMessages }
  load: LoadMessages
  /** Loaded instead when a locale's messages fail to load. */
  fallbackLocale?: string
  /** Runs after the language changes: store the choice, update a date library's locale. */
  onChange?: (locale: string) => void
  /** For formatting dates and times; the browser's own by default. */
  timeZone?: string
  children: ReactNode
}) {
  const [current, setCurrent] = useState(initial)
  const cached = useMemo(() => cache(load, fallbackLocale), [load, fallbackLocale])
  const latest = useRef(0)

  const setLocale = useCallback(
    async (locale: string) => {
      const request = ++latest.current
      const messages = await cached(locale)
      if (request !== latest.current) return // a later choice won
      startTransition(() => setCurrent({ locale, messages }))
      onChange?.(locale)
    },
    [cached, onChange],
  )

  useEffect(() => {
    document.documentElement.lang = current.locale
  }, [current.locale])

  const value = useMemo(() => ({ setLocale, load: cached }), [setLocale, cached])
  return (
    <LocalesContext value={value}>
      <IntlProvider locale={current.locale} messages={current.messages} timeZone={timeZone}>
        {children}
      </IntlProvider>
    </LocalesContext>
  )
}

/**
 * Adds one feature's messages to everything beneath it, loading them for the
 * current language first. fallback shows while they load.
 */
export function Catalog({
  name,
  fallback = null,
  children,
}: {
  name: string
  fallback?: ReactNode
  children: ReactNode
}) {
  return (
    <Suspense fallback={fallback}>
      <CatalogMessages name={name}>{children}</CatalogMessages>
    </Suspense>
  )
}

function CatalogMessages({ name, children }: { name: string; children: ReactNode }) {
  const locale = useLocale()
  const shared = useMessages()
  const feature = use(useLocales().load(locale, name))
  const messages = useMemo(() => ({ ...shared, ...feature }), [shared, feature])
  return (
    <IntlProvider locale={locale} messages={messages}>
      {children}
    </IntlProvider>
  )
}

/** Keeps one promise per locale and catalog, so use() sees the same one each render. */
function cache(load: LoadMessages, fallbackLocale: string | undefined): LoadMessages {
  const pending = new Map<string, Promise<AbstractIntlMessages>>()
  const cached: LoadMessages = (locale, catalog) => {
    const key = `${locale}/${catalog ?? ''}`
    let promise = pending.get(key)
    if (!promise) {
      promise = load(locale, catalog).catch((error: unknown) => {
        if (fallbackLocale && locale !== fallbackLocale) return cached(fallbackLocale, catalog)
        // Forget the failure so the next render tries again.
        pending.delete(key)
        throw error
      })
      pending.set(key, promise)
    }
    return promise
  }
  return cached
}
