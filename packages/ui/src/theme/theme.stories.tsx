import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, within } from 'storybook/test'
import {
  ErrorIcon,
  FavoriteIcon,
  type IconType,
  InfoIcon,
  SuccessIcon,
  WarningIcon,
} from '../icons'
import { composite } from './color'
import {
  apcaContrast,
  contrastRatio,
  fitSeed,
  generateTheme,
  type Scheme,
  THEME_TOKENS,
  type ThemeToken,
} from './index'

const meta: Meta = {
  title: 'Theme/Generator',
}
export default meta

interface TokenArgs {
  base: string
  accent: string
  contrast: number
}

// Each pair with the WCAG ratio it never falls below: placeholders and a status's vivid
// shade, a graphic, are 3:1, as for non-text.
const PAIRS: [ThemeToken, ThemeToken, number][] = [
  ['--theme-app', '--theme-app-bg', 4.5],
  ['--theme-muted-text-color', '--theme-app-bg', 4.5],
  ['--theme-placeholder', '--theme-input-bg', 3],
  ['--theme-link', '--theme-app-bg', 4.5],
  ['--theme-accent-text', '--theme-accent', 4.5],
  ['--theme-error', '--theme-app-bg', 3],
  ['--theme-error-text', '--theme-app-bg', 4.5],
  ['--theme-sidebar-text', '--theme-sidebar-bg', 4.5],
  ['--theme-code-keyword', '--theme-code-bg', 4.5],
]

function Tokens({ base, accent, contrast }: TokenArgs) {
  const scheme: Scheme = { interface: { base, accent, contrast } }
  const { srgb, p3 } = generateTheme(scheme, { code: 'vivid' })
  const shown = (token: ThemeToken) => composite(srgb[token], srgb['--theme-app-bg'])
  return (
    <div className="flex flex-col gap-6 text-sm">
      <table data-testid="pairs" className="w-max border-collapse">
        <thead>
          <tr className="text-left text-xs text-(--theme-muted-text-color)">
            <th className="pr-4 font-medium">Color on surface</th>
            <th className="pr-4 font-medium">Sample</th>
            <th className="pr-4 font-medium">WCAG</th>
            <th className="pr-4 font-medium">APCA Lc</th>
          </tr>
        </thead>
        <tbody>
          {PAIRS.map(([fg, bg, floor]) => (
            <tr key={fg} data-floor={floor}>
              <td className="pr-4 font-mono text-xs">
                {fg} / {bg}
              </td>
              <td className="pr-4">
                <span
                  className="rounded px-2 py-1"
                  style={{ color: srgb[fg], backgroundColor: srgb[bg] }}
                >
                  The quick brown fox
                </span>
              </td>
              <td className="pr-4 tabular-nums" data-wcag={contrastRatio(srgb[fg], srgb[bg])}>
                {contrastRatio(srgb[fg], srgb[bg]).toFixed(2)}
              </td>
              <td className="pr-4 tabular-nums">{apcaContrast(srgb[fg], srgb[bg]).toFixed(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2">
        {THEME_TOKENS.filter((t) => !t.startsWith('--theme-shadow')).map((token) => (
          <div key={token} className="flex items-center gap-2">
            <span
              className="size-8 shrink-0 rounded-md border border-black/10"
              style={{ backgroundColor: shown(token) }}
            />
            <span className="min-w-0">
              <span className="block truncate font-mono text-xs">{token.slice(8)}</span>
              <span className="block font-mono text-xs text-(--theme-muted-text-color)">
                {srgb[token]}
                {p3[token] ? ' · p3' : ''}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Every token a scheme generates, and the contrast of the pairs it promises. Tokens marked p3 are wider on a display-p3 screen. */
export const GeneratedTokens: StoryObj<TokenArgs> = {
  args: { base: '#ffffff', accent: '#0d6efd', contrast: 30 },
  argTypes: {
    base: { control: 'color' },
    accent: { control: 'color' },
    contrast: { control: { type: 'range', min: 0, max: 100 } },
  },
  render: (args) => <Tokens {...args} />,
  play: async ({ canvasElement }) => {
    const rows = canvasElement.querySelectorAll<HTMLElement>('tr[data-floor]')
    await expect(rows).toHaveLength(PAIRS.length)
    for (const row of rows) {
      const wcag = Number(row.querySelector('[data-wcag]')?.getAttribute('data-wcag'))
      await expect(wcag).toBeGreaterThanOrEqual(Number(row.dataset['floor']))
    }
  },
}

const STATUSES: [string, IconType][] = [
  ['success', SuccessIcon],
  ['error', ErrorIcon],
  ['warning', WarningIcon],
  ['info', InfoIcon],
  ['favorite', FavoriteIcon],
]

function StatusShades({ base, accent, contrast }: TokenArgs) {
  const { srgb } = generateTheme({ interface: { base, accent, contrast } })
  const v = (token: string) => srgb[token as ThemeToken]
  const bg = srgb['--theme-app-bg']
  return (
    <div className="flex flex-col gap-3 rounded-lg p-4 text-sm" style={{ backgroundColor: bg }}>
      {STATUSES.map(([name, StatusIcon]) => {
        const vivid = v(`--theme-${name}`)
        const text = v(`--theme-${name}-text`)
        const solid = v(`--theme-${name}-solid`)
        return (
          <div
            key={name}
            data-status={name}
            data-vivid={contrastRatio(vivid, bg)}
            data-text={contrastRatio(text, bg)}
            data-solid={contrastRatio('#ffffff', solid)}
            className="flex flex-wrap items-center gap-3"
          >
            <StatusIcon className="size-4" style={{ color: vivid }} />
            <span className="size-2 rounded-full" style={{ backgroundColor: vivid }} />
            <span className="w-20 font-medium" style={{ color: text }}>
              {name}
            </span>
            <span
              className="rounded-md border px-2.5 py-1"
              style={{
                backgroundColor: v(`--theme-${name}-muted`),
                borderColor: vivid,
                color: text,
              }}
            >
              Text on the muted fill
            </span>
            <span
              className="rounded-md px-3 py-1 font-medium text-white"
              style={{ backgroundColor: solid }}
            >
              Solid
            </span>
            <span className="font-mono text-xs" style={{ color: srgb['--theme-muted-text-color'] }}>
              {vivid} · {text} · {solid}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/** Each status in its shades: vivid for icons, dots and borders, a text shade for words,
 *  a solid fill under a white label, and the muted tint. */
export const StatusShadesStory: StoryObj<TokenArgs> = {
  name: 'Status shades',
  args: { base: '#f3f4f6', accent: '#06354f', contrast: 30 },
  argTypes: {
    base: { control: 'color' },
    accent: { control: 'color' },
    contrast: { control: { type: 'range', min: 0, max: 100 } },
  },
  render: (args) => <StatusShades {...args} />,
  play: async ({ canvasElement }) => {
    const rows = canvasElement.querySelectorAll<HTMLElement>('[data-status]')
    await expect(rows).toHaveLength(STATUSES.length)
    for (const row of rows) {
      await expect(Number(row.dataset['vivid'])).toBeGreaterThanOrEqual(3)
      await expect(Number(row.dataset['text'])).toBeGreaterThanOrEqual(4.5)
      await expect(Number(row.dataset['solid'])).toBeGreaterThanOrEqual(4.5)
    }
  },
}

/** The same in a dark scheme. */
export const StatusShadesDark: StoryObj<TokenArgs> = {
  ...StatusShadesStory,
  name: 'Status shades, dark',
  args: { base: '#111418', accent: '#5b9ccf', contrast: 30 },
}

// A palette as an app stored it before themes were seeds: a dozen hand-picked colors.
const LEGACY: Partial<Record<ThemeToken, string>> = {
  '--theme-app-bg': '#f4f6f8',
  '--theme-panel-bg': '#ffffff',
  '--theme-muted-panel-bg': '#e9edf1',
  '--theme-app': '#1c2733',
  '--theme-muted-text-color': '#8a96a3',
  '--theme-border': '#d5dce3',
  '--theme-accent': '#0b7a75',
  '--theme-link': '#0b7a75',
  '--theme-hover': '#e3e8ed',
  '--theme-sidebar-bg': '#0e2a3b',
  '--theme-sidebar-text': '#c9d6e0',
  '--theme-error': '#d64545',
}

function FitDemo() {
  const fit = fitSeed(LEGACY)
  const color = (value: string) => composite(value, LEGACY['--theme-app-bg'] ?? '#ffffff')
  return (
    <div className="flex flex-col gap-4 text-sm">
      <p>
        Fitted scheme:{' '}
        <code data-testid="fitted" className="font-mono text-xs">
          {JSON.stringify(fit.scheme)}
        </code>
      </p>
      <p data-testid="verdict">
        Verdict: <strong>{fit.report.verdict}</strong> · mean ΔE {fit.report.mean.toFixed(2)} · max
        ΔE {fit.report.max.toFixed(2)}
      </p>
      <table className="w-max border-collapse">
        <thead>
          <tr className="text-left text-xs text-(--theme-muted-text-color)">
            <th className="pr-4 font-medium">Token</th>
            <th className="pr-4 font-medium">Stored</th>
            <th className="pr-4 font-medium">Generated</th>
            <th className="pr-4 font-medium">ΔEOK×100</th>
            <th className="pr-4 font-medium">Note</th>
          </tr>
        </thead>
        <tbody>
          {fit.report.tokens.map((t) => (
            <tr key={t.token}>
              <td className="pr-4 font-mono text-xs">{t.token}</td>
              {[t.target, t.fitted].map((value, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: a fixed pair of cells
                <td key={i} className="pr-4">
                  <span className="flex items-center gap-2 font-mono text-xs">
                    <span
                      className="size-5 rounded border border-black/10"
                      style={{ backgroundColor: color(value) }}
                    />
                    {value}
                  </span>
                </td>
              ))}
              <td className="pr-4 tabular-nums">{t.deltaE.toFixed(2)}</td>
              <td className="pr-4 text-xs text-(--theme-muted-text-color)">
                {t.correctedForContrast
                  ? 'Raised to meet WCAG AA'
                  : fit.report.worst.includes(t.token)
                    ? 'Furthest'
                    : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** fitSeed on a hand-made palette: the seed that comes closest, and how close each stored color came. */
export const FitSeed: StoryObj = {
  render: () => <FitDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByTestId('fitted')).toHaveTextContent('"base":"#f4f6f8"')
    // The stored muted text read at 3:1 on its background; the fit raises it on purpose.
    await expect(canvas.getAllByText('Raised to meet WCAG AA')[0]).toBeVisible()
  },
}
