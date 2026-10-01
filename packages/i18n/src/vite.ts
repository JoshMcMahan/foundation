import path from 'node:path'
import type { Plugin } from 'vite'
import {
  type CatalogMap,
  COMMON,
  listLocales,
  localeFiles,
  readLocale,
  selectCatalog,
} from './catalogs.js'

const id = 'virtual:i18n'
const resolved = `\0${id}`

export interface I18nOptions {
  /** The locales directory, relative to the Vite root. */
  dir: string
  /** The locale whose common messages are bundled with the app, and the fallback. */
  defaultLocale: string
  /** Feature catalogs, loaded only where <Catalog name=...> is rendered. */
  catalogs?: CatalogMap
}

/**
 * Serves `virtual:i18n`: `locales`, `defaultLocale`, `defaultMessages` (bundled)
 * and `loadMessages(locale, catalog?)`, which loads every other locale and
 * catalog as its own chunk. Add `@parallelworks/i18n/client` to tsconfig types.
 */
export function i18n(options: I18nOptions): Plugin {
  const catalogs = options.catalogs ?? {}
  const names = [COMMON, ...Object.keys(catalogs)]
  let dir = ''
  let locales: string[] = []

  return {
    name: '@parallelworks/i18n',
    configResolved(config) {
      dir = path.resolve(config.root, options.dir)
      locales = listLocales(dir)
      if (!locales.includes(options.defaultLocale)) {
        throw new Error(`@parallelworks/i18n: no ${options.defaultLocale} messages in ${dir}`)
      }
    },
    resolveId(source) {
      return source === id || source.startsWith(`${id}/`) ? `\0${source}` : undefined
    },
    load(source) {
      if (source === resolved) {
        const loaders = locales.map(
          (locale) =>
            `${JSON.stringify(locale)}: {${names
              .map((name) =>
                // The default locale's common messages are already bundled.
                locale === options.defaultLocale && name === COMMON
                  ? `${JSON.stringify(name)}: () => Promise.resolve({ default: defaultMessages })`
                  : `${JSON.stringify(name)}: () => import(${JSON.stringify(`${id}/${locale}/${name}`)})`,
              )
              .join(',')}}`,
        )
        return `import defaultMessages from ${JSON.stringify(`${id}/${options.defaultLocale}/${COMMON}`)}
export { defaultMessages }
export const defaultLocale = ${JSON.stringify(options.defaultLocale)}
export const locales = ${JSON.stringify(locales)}
const loaders = {${loaders.join(',')}}
export function loadMessages(locale, catalog = ${JSON.stringify(COMMON)}) {
  const load = loaders[locale]?.[catalog]
  if (!load) return Promise.reject(new Error('no messages for ' + locale + '/' + catalog))
  return load().then((m) => m.default)
}`
      }
      if (!source.startsWith(`${resolved}/`)) return undefined
      const [locale = '', name = ''] = source.slice(resolved.length + 1).split('/')
      if (!locales.includes(locale) || !names.includes(name)) {
        this.error(`unknown message catalog ${locale}/${name}`)
      }
      for (const file of localeFiles(dir, locale)) this.addWatchFile(file)
      const messages = selectCatalog(readLocale(dir, locale), name, catalogs)
      return `export default ${JSON.stringify(messages)}`
    },
    handleHotUpdate({ file, server }) {
      if (!file.startsWith(`${dir}${path.sep}`) || !file.endsWith('.json')) return undefined
      for (const module of server.moduleGraph.idToModuleMap.values()) {
        if (module.id?.startsWith(resolved)) server.moduleGraph.invalidateModule(module)
      }
      server.ws.send({ type: 'full-reload' })
      return []
    },
  }
}
