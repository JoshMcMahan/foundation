import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { Button } from './Button'
import { Callout, type CalloutProps, type CalloutTone } from './Callout'

const meta: Meta = {
  title: 'UI/Callout',
}
export default meta

const TONES: CalloutTone[] = ['default', 'info', 'success', 'warning', 'error']
const NAMES: Record<CalloutTone, string> = {
  default: 'A plain',
  info: 'An info',
  success: 'A success',
  warning: 'A warning',
  error: 'An error',
}

type CalloutArgs = Pick<CalloutProps, 'tone' | 'variant' | 'size' | 'live'> & {
  title: string
  withAction: boolean
  dismissible: boolean
}

/** One callout with every control a host sets. */
export const CalloutStory: StoryObj<CalloutArgs> = {
  name: 'Callout',
  args: {
    tone: 'warning',
    title: 'The cluster stopped answering',
    variant: 'card',
    size: 'md',
    live: false,
    withAction: true,
    dismissible: false,
  },
  argTypes: {
    tone: { control: 'inline-radio', options: TONES },
    title: { control: 'text', description: 'A bold first line; empty for none.' },
    variant: { control: 'inline-radio', options: ['card', 'bar'] },
    size: { control: 'inline-radio', options: ['sm', 'md'] },
    live: { description: 'Announces it as it appears.' },
    withAction: { name: 'action', description: 'A retry button at its end.' },
    dismissible: { name: 'onDismiss', description: 'A close button.' },
  },
  render: ({ title, withAction, dismissible, ...args }) => (
    <div className="max-w-xl">
      <Callout
        {...args}
        {...(title ? { title } : {})}
        {...(withAction
          ? {
              action: (
                <Button size="sm" variant="outline">
                  Check again
                </Button>
              ),
            }
          : {})}
        {...(dismissible ? { onDismiss: () => {} } : {})}
      >
        Jobs wait in the queue until it is back.
      </Callout>
    </div>
  ),
}

/** Every tone, as a plain message and with a title. A callout that's there from the
 *  start takes no live role, so a screen reader reads it in its place. */
export const Tones: StoryObj = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-3">
      {TONES.map((tone) => (
        <Callout key={tone} tone={tone}>
          {NAMES[tone]} callout with guidance.
        </Callout>
      ))}
      {TONES.map((tone) => (
        <Callout key={`${tone}-title`} tone={tone} title={`${NAMES[tone]} title`}>
          What it means, and what to do about it.
        </Callout>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await expect(canvas.queryByRole('alert')).toBeNull()
    await expect(canvas.queryByRole('status')).toBeNull()
  },
}

/** Full-width bars under a header, for a condition that holds across the surface. */
export const Bars: StoryObj = {
  render: () => (
    <div className="max-w-2xl overflow-hidden rounded-lg border border-(--theme-border)">
      <div className="flex h-10 items-center border-b border-(--theme-border) px-4 text-sm font-semibold">
        Header
      </div>
      {(['default', 'info', 'warning', 'error'] as const).map((tone) => (
        <Callout
          key={tone}
          tone={tone}
          variant="bar"
          title="The machine stopped answering"
          action={
            <Button size="sm" variant="outline">
              Check again
            </Button>
          }
        >
          Messages wait here until it is back.
        </Callout>
      ))}
      <div className="h-16" />
    </div>
  ),
}

/** Small, beside a compact control such as a composer, and put away with its close button. */
export const Compact: StoryObj = {
  render: function Render() {
    const [shown, setShown] = useState(true)
    return (
      <div className="flex max-w-md flex-col gap-2">
        <Callout tone="default" size="sm" icon={false}>
          The session ended.
        </Callout>
        {shown && (
          <Callout tone="warning" size="sm" onDismiss={() => setShown(false)}>
            The model fell back to a smaller context window.
          </Callout>
        )}
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Dismiss' }))
    await expect(canvas.queryByText(/smaller context window/)).toBeNull()
  },
}

/** A message that arrives after the page loaded is announced: an error at once, anything
 *  else when the reader pauses. */
export const Live: StoryObj = {
  render: function Render() {
    const [failed, setFailed] = useState(false)
    return (
      <div className="flex max-w-xl flex-col items-start gap-3">
        <Button onClick={() => setFailed(true)}>Save</Button>
        {failed && (
          <Callout tone="error" live title="Couldn't save">
            The server didn't answer. Your changes are still here.
          </Callout>
        )}
      </div>
    )
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Save' }))
    await expect(canvas.getByRole('alert')).toHaveTextContent("Couldn't save")
  },
}
