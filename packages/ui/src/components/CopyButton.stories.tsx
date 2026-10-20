import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { BranchIcon } from '../icons'
import type { ButtonSize, ButtonVariant } from './buttonClasses'
import { Callout } from './Callout'
import { CopyButton, CopyCodeBlock } from './CopyButton'
import { SelectionCopy } from './SelectionCopy'

const meta: Meta = {
  title: 'UI/Copy',
}
export default meta

interface CopyArgs {
  label: string
  quiet: boolean
  success: string
  failure: string
  showLabel: boolean
  size: ButtonSize
  variant: ButtonVariant
}

/** The one copy control. Named for what it copies, it turns into a check for a
 *  moment and says so in a toast. Stubs the clipboard, which a story frame may
 *  not be allowed to write. */
export const Button: StoryObj<CopyArgs> = {
  args: {
    label: 'email address',
    quiet: false,
    success: '',
    failure: '',
    showLabel: false,
    size: 'sm',
    variant: 'ghost',
  },
  argTypes: {
    label: { control: 'text', description: 'What it copies; empty names it only "Copy".' },
    quiet: { control: 'boolean', description: 'No toast; the check still shows.' },
    success: { control: 'text', description: 'The whole success toast, in place of "Copied …".' },
    failure: {
      control: 'text',
      description: 'The whole failure toast, such as where else to copy it from.',
    },
    showLabel: { control: 'boolean', description: '"Copy" beside the icon, for a toolbar.' },
    size: { control: 'inline-radio', options: ['xs', 'sm', 'md'] },
    variant: { control: 'inline-radio', options: ['ghost', 'outline', 'secondary'] },
  },
  render: ({ label, quiet, success, failure, showLabel, size, variant }) => (
    <div className="flex items-center gap-2 p-8 text-sm text-(--theme-app)">
      <span className="font-mono">ada@example.com</span>
      <CopyButton
        text="ada@example.com"
        label={label || undefined}
        quiet={quiet}
        success={success || undefined}
        failure={failure || undefined}
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

/** A glyph of its own, such as a branch for a branch name, and a toast that names the value.
 *  The check still shows once it has copied. */
export const OwnIconAndToast: StoryObj<CopyArgs> = {
  ...Button,
  args: {
    ...Button.args,
    label: 'branch name',
    success: 'Copied feature/login-redirect',
    failure: "Couldn't copy. Copy it from the issue's menu instead.",
  },
  render: ({ label, success, failure }) => (
    <div className="flex items-center gap-2 p-8 text-sm text-(--theme-app)">
      <span className="font-mono">feature/login-redirect</span>
      <CopyButton
        text="feature/login-redirect"
        label={label}
        icon={<BranchIcon />}
        success={success || undefined}
        failure={failure || undefined}
      />
    </div>
  ),
}

/** A secret shown once, such as a new API key: masked with dots that don't give away its
 *  length until the eye shows it, and copied either way. The block masks it itself. */
export const OneTimeSecret: StoryObj<{ wrap: boolean }> = {
  args: { wrap: true },
  argTypes: { wrap: { control: 'boolean', description: 'Breaks a long value across lines.' } },
  render: ({ wrap }) => (
    <div className="max-w-xl p-8">
      <Callout tone="success" title="API key created">
        <p className="mb-2">Copy it now. You won't be able to see it again.</p>
        <CopyCodeBlock
          text="pwk_live_8f3b2c71e9a04d6b9c5f1e2a7d3b4c8e9f0a1b2c"
          label="API key"
          secret
          wrap={wrap}
        />
      </Callout>
    </div>
  ),
}

/** The secret revealed: the eye is pressed, and the value wraps rather than scrolls. */
export const OneTimeSecretRevealed: StoryObj<{ wrap: boolean }> = {
  ...OneTimeSecret,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Show value' }))
    await expect(canvas.getByRole('button', { name: 'Show value' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  },
}

const TOKEN = 'pwk_live_8f3b2c71e9a04d6b9c5f1e2a7d3b4c8e9f0a1b2c'

/** A value in the line, such as a token shown once right after it is made: as wide as the
 *  value, on a quiet surface that reads on a tinted callout and a panel alike, its copy button
 *  right after it. The copy confirms with its check alone, as the change shows right there. A
 *  long value breaks inside it rather than widening the page. `secret` still masks it. */
export const InlineValue: StoryObj = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-4 p-8">
      <Callout tone="success" title="Token created">
        <p className="mb-2">Copy it now. You won't be able to see it again.</p>
        <CopyCodeBlock inline text={TOKEN} label="token" />
      </Callout>
      <Callout tone="info" title="Webhook secret">
        <p className="mb-2">Sign each request with this secret.</p>
        <CopyCodeBlock inline text="whsec_4b1c9e" label="webhook secret" />
      </Callout>
      <Callout tone="warning" title="Recovery code">
        <p className="mb-2">Store it somewhere safe, masked until you show it.</p>
        <CopyCodeBlock inline secret text="RC-7Q2M-91XK-4TPA" label="recovery code" />
      </Callout>
      <div className="rounded-xl border border-(--theme-border) bg-(--theme-panel-bg) p-4 text-sm">
        <p className="mb-2">Your workspace ID</p>
        <CopyCodeBlock inline text="ws_01HZX4K9" label="workspace ID" />
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.getByText(TOKEN)).toBeInTheDocument()
    await expect(canvas.getByRole('button', { name: 'Copy token' })).toBeInTheDocument()
    await userEvent.click(canvas.getByRole('button', { name: 'Show value' }))
    await expect(canvas.getByText('RC-7Q2M-91XK-4TPA')).toBeInTheDocument()
    // Leaves the page at rest, as a reader sees it once they look away.
    canvas.getByRole('button', { name: 'Show value' }).blur()
  },
}

/** A long token at phone width stays on its one line and scrolls sideways inside the chip,
 *  rather than breaking a character onto a line of its own; its buttons stay pinned after it. */
export const InlineValueAtPhoneWidth: StoryObj = {
  render: () => (
    <div style={{ maxWidth: 390 }} className="box-border p-4">
      <Callout tone="success" title="Token created" onDismiss={() => {}}>
        <p className="mb-2">Copy it now. You won't be able to see it again.</p>
        <CopyCodeBlock inline text="tdm_pat_9c4e1b7a2f6d8e0b3a5c7f9e1d2b4a6c" label="token" />
      </Callout>
    </div>
  ),
}

/** In a callout that can be dismissed, the value reaches the callout's far edge under the
 *  dismiss button, so a token that nearly fits isn't cut short. */
export const InlineValueInADismissibleCallout: StoryObj = {
  render: () => (
    <div style={{ maxWidth: 560 }} className="box-border p-4">
      <Callout tone="success" live title="Token created" onDismiss={() => {}}>
        <p>Copy it now. You won't be able to see it again.</p>
        <CopyCodeBlock
          inline
          text="tdm_pat_9c4e1b7a2f6d8e0b3a5c7f9e1d2b4a6c8e0f"
          label="token"
          className="mt-2"
        />
      </Callout>
    </div>
  ),
}

const YAML = `name: train-resnet
on:
  schedule: "0 2 * * *"
jobs:
  train:
    runs-on: gpu-a100
    steps:
      - run: python train.py --epochs 40`

/** Selecting part of a block shows a Copy button under the end of the selection, which
 *  copies just that. Tab reaches it after the text; Escape or a press elsewhere puts it away. */
export const CopySelection: StoryObj = {
  render: () => (
    <div className="max-w-xl p-8">
      <SelectionCopy>
        <pre className="m-0 overflow-x-auto rounded-lg border border-(--theme-border) bg-(--theme-muted-panel-bg) p-4 font-mono text-sm text-(--theme-app)">
          {YAML}
        </pre>
      </SelectionCopy>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const pre = canvasElement.querySelector('pre')
    const text = pre?.firstChild
    if (!pre || !text) {
      throw new Error('no block')
    }
    // The block listens for selections once it has mounted.
    await new Promise((resolve) => setTimeout(resolve, 100))
    const range = document.createRange()
    range.setStart(text, YAML.indexOf('gpu-a100'))
    range.setEnd(text, YAML.indexOf('gpu-a100') + 'gpu-a100'.length)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
    await expect(
      await within(canvasElement).findByRole('button', { name: 'Copy selection' }),
    ).toBeVisible()
  },
}
