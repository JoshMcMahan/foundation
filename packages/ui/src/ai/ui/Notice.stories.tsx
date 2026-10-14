import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { NoticeBar, NoticeCard, type NoticeTone, OutputCard } from './Notice'

const meta: Meta = {
  title: 'Chat/Notices',
}

export default meta

const TONES: NoticeTone[] = ['neutral', 'info', 'warning', 'danger']

export const Bars: StoryObj = {
  render: () => (
    <div className="flex flex-col">
      {TONES.map((tone) => (
        <NoticeBar
          key={tone}
          tone={tone}
          title="The machine stopped answering"
          action="Check again"
          onAction={() => {}}
        >
          Messages wait here until it is back.
        </NoticeBar>
      ))}
    </div>
  ),
}

export const Cards: StoryObj = {
  render: () => (
    <div className="flex max-w-xl flex-col gap-2 p-4">
      <NoticeCard>The session ended.</NoticeCard>
      <NoticeCard tone="warning" onDismiss={() => {}}>
        The model fell back to a smaller context window.
      </NoticeCard>
    </div>
  ),
}

function DismissableOutput() {
  const [shown, setShown] = useState(true)
  return shown ? (
    <OutputCard
      title="/context"
      text={
        'Context window: 200k tokens\n  Messages   41.2k\n  Tools       8.9k\n  Free      149.9k'
      }
      onDismiss={() => setShown(false)}
      dismissLabel="Dismiss"
    />
  ) : null
}

export const CommandOutput: StoryObj<typeof OutputCard> = {
  args: { title: '/status', text: 'Model: example-large\nPermission mode: accept edits' },
  argTypes: { title: { control: 'text' }, text: { control: 'text' } },
  render: (args) => (
    <div className="max-w-xl p-4">
      <OutputCard title={args.title} text={args.text} />
      <DismissableOutput />
    </div>
  ),
}
