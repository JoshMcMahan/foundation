import { prerender } from 'react-dom/static'
import type { AbstractIntlMessages } from 'use-intl'
import { useTranslations } from 'use-intl'
import { describe, expect, it } from 'vitest'
import { Catalog, type LoadMessages, LocaleProvider } from './react.js'

const enCommon = { nav: { home: 'Home' } }
const esCommon = { nav: { home: 'Inicio' } }
const catalogs: Record<string, Record<string, AbstractIntlMessages>> = {
  en: { common: enCommon, admin: { admin: { title: 'Admin' } } },
  es: { common: esCommon, admin: { admin: { title: 'Administración' } } },
}

async function html(node: React.ReactNode): Promise<string> {
  const { prelude } = await prerender(node)
  return new Response(prelude).text()
}

function Home() {
  return <p>{useTranslations('nav')('home')}</p>
}

function AdminTitle() {
  return <h1>{useTranslations('admin')('title')}</h1>
}

describe('LocaleProvider', () => {
  const load: LoadMessages = async (locale, catalog = 'common') => {
    const messages = catalogs[locale]?.[catalog]
    if (!messages) throw new Error(`no ${locale}/${catalog}`)
    return messages
  }

  it('renders the initial messages', async () => {
    const out = await html(
      <LocaleProvider initial={{ locale: 'es', messages: esCommon }} load={load}>
        <Home />
      </LocaleProvider>,
    )
    expect(out).toContain('Inicio')
  })

  it("adds a feature catalog's messages beneath <Catalog>", async () => {
    const out = await html(
      <LocaleProvider initial={{ locale: 'es', messages: esCommon }} load={load}>
        <Home />
        <Catalog name="admin" fallback={<p>loading</p>}>
          <AdminTitle />
        </Catalog>
      </LocaleProvider>,
    )
    expect(out).toContain('Inicio')
    expect(out).toContain('Administración')
    expect(out).not.toContain('loading')
  })

  it('falls back to fallbackLocale when a catalog fails to load', async () => {
    const failing: LoadMessages = (locale, catalog) =>
      locale === 'ja' ? Promise.reject(new Error('offline')) : load(locale, catalog)
    const out = await html(
      <LocaleProvider
        initial={{ locale: 'ja', messages: enCommon }}
        load={failing}
        fallbackLocale="en"
      >
        <Catalog name="admin">
          <AdminTitle />
        </Catalog>
      </LocaleProvider>,
    )
    expect(out).toContain('Admin')
  })
})
