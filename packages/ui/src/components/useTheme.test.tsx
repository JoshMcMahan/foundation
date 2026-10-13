// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import type { Theme } from '../theme/index'
import { useApplyTheme, useColorMode } from './useTheme'

function mockColorScheme(dark: boolean) {
  const listeners = new Set<() => void>()
  const media = {
    matches: dark,
    addEventListener: (_: string, l: () => void) => listeners.add(l),
    removeEventListener: (_: string, l: () => void) => listeners.delete(l),
  }
  window.matchMedia = vi.fn(() => media) as unknown as typeof window.matchMedia
  return (next: boolean) => {
    media.matches = next
    for (const l of listeners) l()
  }
}

describe('useColorMode', () => {
  it('follows the device while the preference is system', () => {
    const set = mockColorScheme(false)
    const { result, rerender } = renderHook(({ pref }) => useColorMode(pref), {
      initialProps: { pref: 'system' as 'system' | 'dark' },
    })
    expect(result.current).toBe('light')
    act(() => set(true))
    expect(result.current).toBe('dark')
    rerender({ pref: 'dark' })
    expect(result.current).toBe('dark')
  })
})

describe('useApplyTheme', () => {
  it('applies a theme’s scheme for the mode to the document, with its color-scheme', () => {
    mockColorScheme(false)
    const theme: Theme = {
      version: 1,
      light: { interface: { base: '#ffffff', accent: '#06354f' } },
      dark: { interface: { base: '#0d1117', accent: '#2f81f7' } },
    }
    const { rerender } = renderHook(({ mode }) => useApplyTheme(theme, mode), {
      initialProps: { mode: 'light' as 'light' | 'dark' },
    })
    const root = document.documentElement
    expect(root.style.getPropertyValue('--theme-app-bg')).toBe('#ffffff')
    expect(root.style.colorScheme).toBe('light')
    rerender({ mode: 'dark' })
    expect(root.style.getPropertyValue('--theme-app-bg')).toBe('#0d1117')
    expect(root.style.colorScheme).toBe('dark')
  })
})
