import { deriveTheme, fitSeed, type Scheme, type ThemeToken } from './index'

describe('fitSeed', () => {
  it.each<[string, Scheme, 'balanced' | 'vivid' | 'muted' | 'mono']>([
    [
      'a light theme',
      { interface: { base: '#f3f4f6', accent: '#06354f', contrast: 47 } },
      'balanced',
    ],
    [
      'a dark theme at full contrast',
      { interface: { base: '#0d1117', accent: '#2f81f7', contrast: 100 } },
      'balanced',
    ],
    [
      'a soft theme',
      { interface: { base: '#fdf6e3', accent: '#b58900', contrast: 0 } },
      'balanced',
    ],
    [
      'a theme with its own sidebar',
      {
        interface: { base: '#ffffff', accent: '#0d6efd', contrast: 30 },
        sidebar: { base: '#06354f' },
      },
      'balanced',
    ],
    [
      'a vivid code style',
      { interface: { base: '#191724', accent: '#c4a7e7', contrast: 20 } },
      'vivid',
    ],
  ])('recovers %s from its own tokens', (_, scheme, code) => {
    const fit = fitSeed(deriveTheme(scheme, { code }))
    expect(fit.scheme.interface.base).toBe(scheme.interface.base)
    expect(fit.scheme.interface.accent).toBe(scheme.interface.accent)
    expect(
      Math.abs((fit.scheme.interface.contrast ?? 30) - (scheme.interface.contrast ?? 30)),
    ).toBeLessThan(1)
    expect(fit.scheme.sidebar?.base).toBe(scheme.sidebar?.base)
    expect(fit.code).toBe(code)
    expect(fit.report.max).toBeLessThan(0.5)
    expect(fit.report.verdict).toBe('faithful')
  })

  it('reports how close a hand-picked palette comes, token by token', () => {
    // A palette as an app might have stored it before themes were seeds.
    const legacy: Partial<Record<ThemeToken, string>> = {
      '--theme-app-bg': '#ffffff',
      '--theme-panel-bg': '#ffffff',
      '--theme-muted-panel-bg': '#f8f9fa',
      '--theme-app': '#111827',
      '--theme-muted-text-color': '#5f6b76',
      '--theme-border': '#d1d5db',
      '--theme-accent': '#06354f',
      '--theme-link': '#2f6fa8',
      '--theme-sidebar-bg': '#06354f',
      '--theme-sidebar-text': '#ffffff',
    }
    const fit = fitSeed(legacy)
    expect(fit.mode).toBe('light')
    expect(fit.scheme.interface).toMatchObject({ base: '#ffffff', accent: '#06354f' })
    expect(fit.scheme.sidebar?.base).toBe('#06354f')
    expect(fit.report.tokens.map((t) => t.token).sort()).toEqual(Object.keys(legacy).sort())
    // The palette's link was its own blue; a seed's links come from its accent. The report says so.
    expect(fit.report.worst[0]).toBe('--theme-link')
    expect(fit.report.verdict).toBe('changed')
    const rest = fit.report.tokens.filter((t) => t.token !== '--theme-link')
    expect(Math.max(...rest.map((t) => t.deltaE))).toBeLessThan(6)
    // With the link left out of the comparison, the same palette fits closely.
    const { '--theme-link': _, ...withoutLink } = legacy
    expect(fitSeed(withoutLink).report.verdict).toBe('close')
  })

  it('flags colors that failed WCAG AA as corrected, not lost', () => {
    const fit = fitSeed({
      '--theme-app-bg': '#ffffff',
      '--theme-accent': '#0d6efd',
      // Grey on white at 2.3:1: the generator raises it on purpose.
      '--theme-muted-text-color': '#a0a0a0',
      '--theme-app': '#222222',
    })
    const muted = fit.report.tokens.find((t) => t.token === '--theme-muted-text-color')
    expect(muted?.correctedForContrast).toBe(true)
    expect(fit.report.worst).not.toContain('--theme-muted-text-color')
  })

  it('reads a dark palette as dark', () => {
    expect(fitSeed({ '--theme-app-bg': '#16161a', '--theme-accent': '#7f5af0' }).mode).toBe('dark')
  })

  it('compares translucent colors as they show over the background', () => {
    const fit = fitSeed({
      '--theme-app-bg': '#ffffff',
      '--theme-accent': '#0d6efd',
      '--theme-error-muted': 'rgba(220, 38, 38, 0.1)',
    })
    const muted = fit.report.tokens.find((t) => t.token === '--theme-error-muted')
    expect(muted?.deltaE).toBeLessThan(5)
  })
})
