# @parallelworks/i18n

Localization for React apps on [use-intl](https://next-intl.dev/docs/environments/core-library): picking the reader's language, a provider that switches it, catalogs loaded only when needed, and a check that keeps every language in step with the default.

Related packages: show API errors with `useErrorMessage()` from `@parallelworks/problem/react`, and keep hard-coded English out of components with `@parallelworks/lint`.

## Catalogs

Messages live in one directory, in either layout:

- one file per locale: `locales/en.json`, `locales/es.json`
- one file per namespace, for large apps: `locales/en/nav.json`, `locales/en/billing.json`. Unrelated features then rarely edit the same file. `parallelworks-i18n index` writes `locales/en/index.ts`, which imports them all, so `typeof import('./locales/en')` types the messages.

## Vite

```ts
// vite.config.ts
import { i18n } from '@parallelworks/i18n/vite'

export default defineConfig({
  plugins: [
    i18n({
      dir: 'src/i18n/locales',
      defaultLocale: 'en',
      // Optional: namespaces only these features use, loaded where they're shown.
      catalogs: { admin: ['adminUsers', 'adminBilling'] },
    }),
  ],
})
```

The plugin serves `virtual:i18n`: `locales`, `defaultLocale`, `defaultMessages` (the default locale's common messages, bundled) and `loadMessages(locale, catalog?)`, which loads every other locale and catalog as its own chunk. Add `"@parallelworks/i18n/client"` to `compilerOptions.types` for its types.

## React

```tsx
// main.tsx
import { detectLocale } from '@parallelworks/i18n'
import { LocaleProvider } from '@parallelworks/i18n/react'
import { defaultLocale, defaultMessages, loadMessages, locales } from 'virtual:i18n'

// The server's choice (if it injects one), a stored choice, then the browser's languages.
const locale = detectLocale(locales, { fallback: defaultLocale, cookie: 'locale' })
const messages = locale === defaultLocale ? defaultMessages : await loadMessages(locale)

root.render(
  <LocaleProvider
    initial={{ locale, messages }}
    load={loadMessages}
    fallbackLocale={defaultLocale}
    onChange={(next) => {
      document.cookie = `locale=${next}; path=/; max-age=31536000`
    }}
  >
    <App />
  </LocaleProvider>,
)
```

- `useSetLocale()` switches the language. If the person picks again before the first finishes loading, the later choice wins.
- The provider keeps `<html lang>` current and passes the browser's time zone to use-intl.
- `<Catalog name='admin' fallback={<Spinner />}>` adds a feature catalog's messages beneath it, loading them for the current language first.
- `negotiateLocale(preferred, locales, fallback)` matches tags such as `es-MX` to `es`.

## Checks

```sh
parallelworks-i18n check --dir src/i18n/locales      # in CI
parallelworks-i18n add new-messages.json --dir src/i18n/locales
parallelworks-i18n unused --dir src/i18n/locales --src src --keep apiErrors
```

`check` fails when a locale is missing a key or has one the default doesn't, when a message isn't valid ICU, when a translation uses different arguments or rich-text tags than the default, or when a split layout's `index.ts` is stale. `add` merges messages without changing an existing one, and is safe to run from several processes at once. Its file is one locale's tree, or trees keyed by locale.

`unused` fails when a message in the default locale is never referenced. It reads the source with a parser, not a search: a key is used when a `useTranslations('ns')` or `getTranslations('ns')` translator, or a parameter typed `TFunction<'ns'>`, calls it (`t('key')`, `t.rich`, `t.markup`, `t.has`); when it sits under a subtree read whole, by `t.raw('key')`, a template key such as `` t(`states.${s}`) ``, a fully dynamic `t(key)` or `useMessages().ns`; or when its full dotted path appears as a string literal. A translator passed to a helper untyped matches by key suffix. It would rather miss an unused key than report a used one. `--keep` names namespaces read by key outside the source.

`@parallelworks/i18n/node` exports the same functions and the catalog reader for an app's own scripts.

## Dates and numbers

Format for display with use-intl's `useFormatter()`: `format.dateTime`, `format.relativeTime`, `format.number`. It uses `Intl` with the provider's locale and time zone, so nothing else has to follow the language.

For parsing, arithmetic and time zones, use [Luxon](https://moment.github.io/luxon/) for now. Not the built-in `Date`, which is mutable and knows only the local and UTC zones.

**Switch to [Temporal](https://tc39.es/proposal-temporal/docs/) once it is Baseline.** Temporal is ES2026 and ships in Chrome 144+ and Firefox 139+, but as of October 2026 not yet in stable Safari. When Safari ships it, move parsing and arithmetic from Luxon to Temporal here and in every app, and drop Luxon.
