import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import type { ButtonSize, ButtonVariant } from './buttonClasses'
import { CopyButton, CopyCodeBlock } from './CopyButton'

const meta: Meta = {
  title: 'UI/Copy',
}
export default meta

interface CopyArgs {
  label: string
  quiet: boolean
  showLabel: boolean
  size: ButtonSize
  variant: ButtonVariant
}

/** The one copy control. Named for what it copies, it turns into a check for a
 *  moment and says so in a toast. Stubs the clipboard, which a story frame may
 *  not be allowed to write. */
export const Button: StoryObj<CopyArgs> = {
  args: { label: 'email address', quiet: false, showLabel: false, size: 'sm', variant: 'ghost' },
  argTypes: {
    label: { control: 'text', description: 'What it copies; empty names it only "Copy".' },
    quiet: { control: 'boolean', description: 'No toast; the check still shows.' },
    showLabel: { control: 'boolean', description: '"Copy" beside the icon, for a toolbar.' },
    size: { control: 'inline-radio', options: ['xs', 'sm', 'md'] },
    variant: { control: 'inline-radio', options: ['ghost', 'outline', 'secondary'] },
  },
  render: ({ label, quiet, showLabel, size, variant }) => (
    <div className="flex items-center gap-2 p-8 text-sm text-(--theme-app)">
      <span className="font-mono">ada@example.com</span>
      <CopyButton
        text="ada@example.com"
        label={label || undefined}
        quiet={quiet}
        showLabel={showLabel}
        size={size}
        variant={variant}
      />
    </div>
  ),
}

/** Pressed: the check, named "Copied email address" until it turns back. */
export const Copied: StoryObj<CopyArgs> = {
  ...Button,
  play: async ({ canvasElement }) => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: () => Promise.resolve() },
    })
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Copy email address' }))
    await expect(
      await canvas.findByRole('button', { name: 'Copied email address' }),
    ).toBeInTheDocument()
  },
}

/** With its label shown, for a copy that is a toolbar's command. */
export const WithLabel: StoryObj<CopyArgs> = {
  ...Button,
  args: { ...Button.args, label: 'workflow YAML', showLabel: true, size: 'md', variant: 'outline' },
}

function SecretBlock() {
  const [revealed, setRevealed] = useState(false)
  const token = 'pk_live_51HhZ2vK8x2Q'
  return (
    <CopyCodeBlock
      text={token}
      label="API key"
      secret
      revealed={revealed}
      onRevealedChange={setRevealed}
    >
      {revealed ? token : '•'.repeat(token.length)}
    </CopyCodeBlock>
  )
}

/** A command or snippet with its copy button, shown while the pointer is over the
 *  block or focus is in it, and always on touch. The code stays selectable. A
 *  secret adds an eye that shows or hides it. */
export const CodeBlock: StoryObj = {
  render: () => (
    <div className="max-w-xl space-y-3 p-8">
      <CopyCodeBlock text="npm install @scope/ui" label="install command">
        npm install @scope/ui
      </CopyCodeBlock>
      <SecretBlock />
    </div>
  ),
}

/** With focus in the block, its buttons show. */
export const CodeBlockFocused: StoryObj = {
  ...CodeBlock,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.tab()
    await userEvent.tab()
    await expect(canvas.getByRole('button', { name: 'Show value' })).toHaveFocus()
  },
}
