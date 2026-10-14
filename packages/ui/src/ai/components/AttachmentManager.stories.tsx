import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo } from 'react'
import { makeAttachments, makeStaticAdapter, StoryChat, StoryViewport } from '../stories/harness'
import AttachmentManager from './AttachmentManager'

const meta: Meta = {
  title: 'Chat/Attachments',
  component: AttachmentManager,
  parameters: { layout: 'fullscreen' },
}

export default meta

function Manager({ empty, preview }: { empty: boolean; preview: boolean }) {
  const adapter = useMemo(
    () =>
      makeStaticAdapter({
        attachments: empty ? true : makeAttachments(),
        previewAttachments: preview,
      }),
    [empty, preview],
  )
  return (
    <StoryChat adapter={adapter}>
      <StoryViewport>
        <AttachmentManager />
      </StoryViewport>
    </StoryChat>
  )
}

// Every file the reader has sent. Each one's download is a link, so it can be
// saved or opened in a new tab; with `preview` the host opens a picture in its
// own viewer from a button on the tile.
export const Library: StoryObj<{ preview: boolean }> = {
  args: { preview: false },
  argTypes: {
    preview: { control: 'boolean', description: 'The host previews attachments (onOpen)' },
  },
  render: (args) => <Manager empty={false} preview={args.preview} />,
}

export const Empty: StoryObj = {
  render: () => <Manager empty preview={false} />,
}
