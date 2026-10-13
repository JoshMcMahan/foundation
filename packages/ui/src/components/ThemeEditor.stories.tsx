import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, fireEvent, screen, userEvent, waitFor, within } from 'storybook/test'
import {
  type ColorPreference,
  contrastRatio,
  DEFAULT_THEME,
  serializeTheme,
  type Theme,
} from '../theme/index'
import { Button } from './Button'
import Callout from './Callout'
import { ThemeEditor } from './ThemeEditor'
import { useApplyTheme, useColorMode } from './useTheme'

const meta: Meta = {
  title: 'Theme/ThemeEditor',
}
export default meta

interface EditorArgs {
  preview: boolean
  appearance: boolean
}

function EditorDemo({
  preview,
  appearance,
  initial = DEFAULT_THEME,
}: EditorArgs & { initial?: Theme }) {
  const [theme, setTheme] = useState(initial)
  const [preference, setPreference] = useState<ColorPreference>('system')
  return (
    <div className="max-w-5xl">
      <ThemeEditor
        value={theme}
        onChange={setTheme}
        preview={preview}
        {...(appearance ? { preference, onPreferenceChange: setPreference } : {})}
      />
    </div>
  )
}

const preview = () => screen.getByRole('region', { name: 'Preview' })
const token = (name: string) => preview().style.getPropertyValue(name)
const textContrast = () => contrastRatio(token('--theme-app'), token('--theme-app-bg'))

/** A background, an accent and a contrast for each mode; everything in the preview is generated from them. */
export const Editor: StoryObj<EditorArgs> = {
  args: { preview: true, appearance: true },
  render: (args) => <EditorDemo {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const accent = canvas.getByRole('textbox', { name: 'Accent' })
    await userEvent.clear(accent)
    await userEvent.type(accent, '#e11d48')
    await waitFor(() => expect(token('--theme-accent')).toBe('#e11d48'))
    // Text on the new accent is solved too.
    await expect(contrastRatio(token('--theme-accent-text'), '#e11d48')).toBeGreaterThanOrEqual(4.5)
  },
}

/** The contrast slider at both ends: softer or stronger, and never below WCAG AA. */
export const ContrastEnds: StoryObj = {
  render: () => <EditorDemo preview appearance={false} />,
  play: async ({ canvasElement }) => {
    const slider = within(canvasElement).getByRole('slider', { name: 'Contrast' })
    slider.focus()
    await userEvent.keyboard('{Home}')
    await waitFor(() => expect(slider).toHaveAttribute('aria-valuenow', '0'))
    const soft = textContrast()
    await expect(soft).toBeGreaterThanOrEqual(4.5)
    await userEvent.keyboard('{End}')
    await waitFor(() => expect(slider).toHaveAttribute('aria-valuenow', '100'))
    await expect(textContrast()).toBeGreaterThan(soft)
  },
}

/** The sidebar takes its own background and accent; text on it is solved like the page's. */
export const CustomSidebar: StoryObj = {
  render: () => (
    <EditorDemo
      preview
      appearance={false}
      initial={{ version: 1, light: { interface: { base: '#ffffff', accent: '#0d6efd' } } }}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('switch', { name: 'Custom sidebar' }))
    const background = await canvas.findByRole('textbox', { name: 'Sidebar background' })
    await userEvent.clear(background)
    await userEvent.type(background, '#14213d')
    await waitFor(() => expect(token('--theme-sidebar-bg')).toBe('#14213d'))
    await expect(
      contrastRatio(token('--theme-sidebar-text'), token('--theme-sidebar-bg')),
    ).toBeGreaterThanOrEqual(4.5)
  },
}

/** A pasted theme applies; one that isn't says where it's wrong. */
export const ImportTheme: StoryObj = {
  render: () => <EditorDemo preview appearance={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Import theme' }))
    const box = await canvas.findByRole('textbox', { name: 'Theme to import' })
    fireEvent.change(box, {
      target: { value: '{"version":1,"light":{"interface":{"base":"#fff","accent":"red"}}}' },
    })
    await userEvent.click(canvas.getByRole('button', { name: 'Apply' }))
    const error = await canvas.findByText('light.interface.accent isn’t a color.')
    await waitFor(() => expect(error).toBeVisible())
    const pasted: Theme = {
      version: 1,
      light: { interface: { base: '#fdf6e3', accent: '#b58900' } },
    }
    fireEvent.change(box, { target: { value: serializeTheme(pasted) } })
    await userEvent.click(canvas.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(token('--theme-app-bg')).toBe('#fdf6e3'))
  },
}

/** Copy theme puts the theme's JSON on the clipboard, to paste into another app or person's editor. */
export const CopyTheme: StoryObj = {
  render: () => <EditorDemo preview={false} appearance={false} />,
  play: async ({ canvasElement }) => {
    let copied = ''
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async (text: string) => {
          copied = text
        },
      },
    })
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Copy theme' }))
    await waitFor(() => expect(copied).toBe(serializeTheme(DEFAULT_THEME)))
  },
}

function AppWideDemo() {
  const [theme, setTheme] = useState(DEFAULT_THEME)
  const [preference, setPreference] = useState<ColorPreference>('light')
  const mode = useColorMode(preference)
  const [region, setRegion] = useState<HTMLElement | null>(null)
  // A host applies to the document root; the story applies to its own region.
  useApplyTheme(theme, mode, region)
  return (
    <div
      ref={setRegion}
      data-testid="app-region"
      className="flex max-w-3xl flex-col gap-4 rounded-xl bg-(--theme-app-bg) p-4 text-(--theme-app)"
    >
      <Callout type="info" className="my-0">
        Everything in this region follows the theme as it changes.
      </Callout>
      <div className="flex gap-2">
        <Button variant="primary">Save changes</Button>
        <Button>Cancel</Button>
      </div>
      <ThemeEditor
        value={theme}
        onChange={setTheme}
        mode={mode}
        preference={preference}
        onPreferenceChange={setPreference}
        preview={false}
      />
    </div>
  )
}

/** With `preview={false}` and `useApplyTheme`, the whole app is the preview as the person edits. */
export const AppWidePreview: StoryObj = {
  render: () => <AppWideDemo />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const region = canvas.getByTestId('app-region')
    const appearance = canvas.getByRole('group', { name: 'Appearance' })
    await userEvent.click(within(appearance).getByRole('button', { name: 'Dark' }))
    await waitFor(() => expect(region.style.colorScheme).toBe('dark'))
  },
}
