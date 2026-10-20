// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render } from '@testing-library/react'
import { ariaKeyShortcuts, formatShortcut, Kbd, shortcutText } from './Kbd'
import { UIProvider } from './Provider'

describe('formatShortcut', () => {
  it('takes Command for Mod on an Apple keyboard and Control elsewhere', () => {
    expect(formatShortcut('Mod+K', undefined, 'apple')).toEqual(['⌘', 'K'])
    expect(formatShortcut('Mod+K', undefined, 'other')).toEqual(['Ctrl', 'K'])
  })

  it('shows Apple symbols there and key names elsewhere', () => {
    expect(formatShortcut('Mod+Shift+Alt+Enter', undefined, 'apple')).toEqual(['⌘', '⇧', '⌥', '↵'])
    expect(formatShortcut('Ctrl+Shift+Esc', undefined, 'other')).toEqual(['Ctrl', 'Shift', 'Esc'])
  })

  it('names keys in the host’s words', () => {
    const names = {
      ctrl: 'Strg',
      alt: 'Alt',
      shift: 'Umschalt',
      meta: 'Meta',
      enter: 'Eingabe',
      escape: 'Esc',
      space: 'Leertaste',
      tab: 'Tab',
      backspace: 'Rück',
      delete: 'Entf',
    }
    expect(formatShortcut('Mod+Shift+K', names, 'other')).toEqual(['Strg', 'Umschalt', 'K'])
  })

  it('keeps literal keys, arrows and the plus key', () => {
    expect(formatShortcut(['[', ']'], undefined, 'other')).toEqual(['[', ']'])
    expect(formatShortcut(['ArrowUp', 'down'], undefined, 'other')).toEqual(['↑', '↓'])
    expect(formatShortcut('Mod++', undefined, 'other')).toEqual(['Ctrl', '+'])
    expect(formatShortcut('f', undefined, 'other')).toEqual(['F'])
  })

  it('writes one line the way each platform does', () => {
    expect(shortcutText('Mod+K', undefined, 'apple')).toBe('⌘K')
    expect(shortcutText('Mod+K', undefined, 'other')).toBe('Ctrl+K')
  })
})

describe('ariaKeyShortcuts', () => {
  it('gives the key names aria-keyshortcuts takes', () => {
    expect(ariaKeyShortcuts('Mod+K', 'apple')).toBe('Meta+K')
    expect(ariaKeyShortcuts('Mod+Shift+ArrowUp', 'other')).toBe('Control+Shift+ArrowUp')
    expect(ariaKeyShortcuts('/', 'other')).toBe('/')
  })
})

describe('Kbd', () => {
  it('nests a keycap for each key of a combination, joined by a hidden plus off Apple', () => {
    const { container } = render(<Kbd keys="Mod+K" platform="other" />)
    const caps = [...container.querySelectorAll('kbd kbd')].map((k) => k.textContent)
    expect(caps).toEqual(['Ctrl', 'K'])
    expect(container.querySelector('[aria-hidden="true"]')).toHaveTextContent('+')
  })

  it('draws a single key as one keycap', () => {
    const { container } = render(<Kbd keys="F" platform="apple" />)
    expect(container.querySelectorAll('kbd')).toHaveLength(1)
  })

  it('is plain muted text for a menu row', () => {
    const { container } = render(<Kbd keys="Mod+Enter" variant="plain" platform="apple" />)
    expect(container.querySelector('kbd')).toHaveTextContent('⌘↵')
    expect(container.querySelectorAll('kbd')).toHaveLength(1)
  })

  it('reads key names from the strings', () => {
    const { container } = render(
      <UIProvider strings={{ keys: { ctrl: 'Strg' } }}>
        <Kbd keys="Mod+S" platform="other" />
      </UIProvider>,
    )
    expect(container.querySelector('kbd kbd')).toHaveTextContent('Strg')
  })
})
