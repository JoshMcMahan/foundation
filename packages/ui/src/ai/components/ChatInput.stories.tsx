import type { Meta, StoryObj } from '@storybook/react-vite'
import { StoryChat } from '../stories/harness'
import ChatInput from './ChatInput'

const meta: Meta = {
  title: 'Chat/Composer',
  component: ChatInput,
  parameters: { layout: 'padded' },
}

export default meta

const send = (text: string) => console.info('[send]', text)

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
