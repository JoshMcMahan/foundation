import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo } from 'react'
import { makeComposerPastes, makePasteText, pasteIntoComposer, StoryChat } from '../stories/harness'
import type { MessagePaste } from '../types'
import ChatInput from './ChatInput'

const meta: Meta = {
  title: 'Chat/Composer',
  component: ChatInput,
  parameters: { layout: 'padded' },
}

export default meta

const send = (text: string, _ids?: string[], _meta?: unknown, pastes?: MessagePaste[]) =>
  console.info('[send]', text, pastes ?? [])

export const Idle: StoryObj<{ disabled: boolean; placeholder: string }> = {
  args: { disabled: false, placeholder: 'Ask anything' },
  render: (args) => (
    <StoryChat>
      <div className="max-w-2xl mx-auto">
        <ChatInput
          onSend={send}
          disabled={args.disabled}
          placeholder={args.placeholder}
          conversationId="conv-1"
        />
      </div>
    </StoryChat>
  ),
}

// Text over inlineMaxBytes becomes a card. The play pastes three logs: the
// host saves the first, is still saving the second and refuses the third.
// Pastes of your own are saved.
export const LargePastes: StoryObj<{ inlineMaxBytes: number; uploadMs: number }> = {
  args: { inlineMaxBytes: 4_000, uploadMs: 600 },
  argTypes: {
    inlineMaxBytes: { control: { type: 'range', min: 1_000, max: 64_000, step: 1_000 } },
    uploadMs: { control: { type: 'range', min: 0, max: 5_000, step: 100 } },
  },
  render: (args) => {
    const Composer = () => {
      const { inlineMaxBytes, uploadMs } = args
      const pastes = useMemo(
        () =>
          makeComposerPastes({
            inlineMaxBytes,
            uploadMs,
            outcomes: ['saved', 'saving', 'refused'],
          }),
        // Composer is rebuilt whenever the story's args change.
        [],
      )
      return (
        <StoryChat>
          <div className="max-w-2xl mx-auto">
            <ChatInput onSend={send} conversationId="conv-pastes" pastes={pastes} />
          </div>
        </StoryChat>
      )
    }
    return <Composer />
  },
  play: async ({ canvasElement }) => {
    for (const lines of [412, 1_280, 96]) {
      pasteIntoComposer(canvasElement, makePasteText(lines))
    }
  },
}
