// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { DEFAULT_THEME, serializeTheme, type Theme } from '../theme/index'
import { ThemeEditor } from './ThemeEditor'
import { toast } from './Toast'

vi.spyOn(toast, 'success').mockImplementation(() => '')

function Harness({
  initial = DEFAULT_THEME,
  onTheme,
}: {
  initial?: Theme
  onTheme?: (t: Theme) => void
}) {
  const [theme, setTheme] = useState(initial)
  return (
    <ThemeEditor
      value={theme}
      onChange={(next) => {
        setTheme(next)
        onTheme?.(next)
      }}
    />
  )
}

const lastTheme = (fn: ReturnType<typeof vi.fn>) => fn.mock.lastCall?.[0] as Theme | undefined

const base: Theme = { version: 1, light: { interface: { base: '#ffffff', accent: '#06354f' } } }

describe('ThemeEditor', () => {
  it('edits the accent of the mode it’s on, through the hex field', () => {
    const onTheme = vi.fn()
    render(<Harness initial={base} onTheme={onTheme} />)
    fireEvent.change(screen.getByRole('textbox', { name: 'Accent' }), {
      target: { value: '#e11d48' },
    })
    expect(onTheme).toHaveBeenLastCalledWith({
      ...base,
      light: { interface: { base: '#ffffff', accent: '#e11d48' } },
    })
  })

  it('keeps a half-typed hex in the field, marked, without changing the theme', () => {
    const onTheme = vi.fn()
    render(<Harness initial={base} onTheme={onTheme} />)
    const field = screen.getByRole('textbox', { name: 'Accent' })
    fireEvent.change(field, { target: { value: '#e11' } })
    // #e11 is a whole short hex; #e11d is not.
    fireEvent.change(field, { target: { value: '#e11d' } })
    expect(field).toHaveValue('#e11d')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Enter a hex color, such as #1f6feb.')).toBeInTheDocument()
    expect(onTheme).toHaveBeenCalledTimes(1)
  })

  it('edits the dark scheme without touching the light one, starting from the derived dark', () => {
    const onTheme = vi.fn()
    render(<Harness initial={base} onTheme={onTheme} />)
    fireEvent.click(
      within(screen.getByRole('group', { name: 'Colors for' })).getByRole('button', {
        name: 'Dark',
      }),
    )
    fireEvent.change(screen.getByRole('textbox', { name: 'Background' }), {
      target: { value: '#101010' },
    })
    const theme = lastTheme(onTheme)
    expect(theme?.light).toEqual(base.light)
    expect(theme?.dark?.interface.base).toBe('#101010')
    expect(theme?.dark?.interface.accent).toBe('#06354f')
  })

  it('swaps the background and the accent of the mode it’s on, keeping the contrast', () => {
    const onTheme = vi.fn()
    const initial: Theme = {
      version: 1,
      light: { interface: { base: '#ffffff', accent: '#06354f', contrast: 60 } },
    }
    render(<Harness initial={initial} onTheme={onTheme} />)
    fireEvent.click(screen.getByRole('button', { name: 'Swap background and accent' }))
    expect(onTheme).toHaveBeenLastCalledWith({
      ...initial,
      light: { interface: { base: '#06354f', accent: '#ffffff', contrast: 60 } },
    })
  })

  it('sets the contrast with the slider’s keys', () => {
    const onTheme = vi.fn()
    render(<Harness initial={base} onTheme={onTheme} />)
    const slider = screen.getByRole('slider', { name: 'Contrast' })
    act(() => slider.focus())
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(lastTheme(onTheme)?.light?.interface.contrast).toBe(31)
  })

  it('gives the sidebar its own colors, and takes them away', () => {
    const onTheme = vi.fn()
    render(<Harness initial={base} onTheme={onTheme} />)
    fireEvent.click(screen.getByRole('switch', { name: 'Custom sidebar' }))
    expect(lastTheme(onTheme)?.light?.sidebar?.base).toMatch(/^#[\da-f]{6}$/)
    fireEvent.change(screen.getByRole('textbox', { name: 'Sidebar background' }), {
      target: { value: '#06354f' },
    })
    expect(lastTheme(onTheme)?.light?.sidebar?.base).toBe('#06354f')
    fireEvent.click(screen.getByRole('switch', { name: 'Custom sidebar' }))
    expect(lastTheme(onTheme)?.light?.sidebar).toBeUndefined()
  })

  it('imports a pasted theme, and says why it refuses one', async () => {
    const onTheme = vi.fn()
    render(<Harness initial={base} onTheme={onTheme} />)
    fireEvent.click(screen.getByRole('button', { name: 'Import theme' }))
    const box = await screen.findByRole('textbox', { name: 'Theme to import' })
    fireEvent.change(box, {
      target: { value: '{"version":1,"light":{"interface":{"base":"#fff","accent":"red"}}}' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(screen.getByText('light.interface.accent isn’t a color.')).toBeInTheDocument()
    expect(onTheme).not.toHaveBeenCalled()
    const pasted: Theme = {
      version: 1,
      dark: { interface: { base: '#000000', accent: '#ffcc00' } },
    }
    fireEvent.change(box, { target: { value: serializeTheme(pasted) } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    expect(onTheme).toHaveBeenLastCalledWith(pasted)
  })

  it('copies the theme as JSON', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    render(<Harness initial={base} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy theme' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(serializeTheme(base)))
  })

  it('applies a preset and resets to the default', () => {
    const onTheme = vi.fn()
    render(<Harness initial={base} onTheme={onTheme} />)
    fireEvent.click(screen.getByRole('button', { name: /Rosé Pine/ }))
    expect(lastTheme(onTheme)?.dark?.interface.accent).toBe('#c4a7e7')
    fireEvent.click(screen.getByRole('button', { name: 'Reset' }))
    expect(onTheme).toHaveBeenLastCalledWith(DEFAULT_THEME)
  })

  it('opens a preset made for one mode on that mode', () => {
    render(<Harness initial={base} />)
    fireEvent.click(screen.getByRole('button', { name: /Rosé Pine/ }))
    const editing = within(screen.getByRole('group', { name: 'Colors for' }))
    expect(editing.getByRole('button', { name: 'Dark' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('textbox', { name: 'Background' })).toHaveValue('#191724')
  })

  it('previews the generated tokens in a scoped region', () => {
    render(<Harness initial={base} />)
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(preview.style.getPropertyValue('--theme-accent')).toBe('#06354f')
    expect(preview.style.getPropertyValue('--theme-app-bg')).toBe('#ffffff')
    expect(within(preview).getByText('Run again')).toBeInTheDocument()
  })

  it('adds no landmark or heading of its own to the page', () => {
    render(<Harness />)
    const preview = screen.getByRole('region', { name: 'Preview' })
    expect(within(preview).queryByRole('navigation')).not.toBeInTheDocument()
    expect(within(preview).queryByRole('heading')).not.toBeInTheDocument()
  })
})
