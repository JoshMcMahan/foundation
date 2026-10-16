import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect, useMemo, useRef, useState } from 'react'
import { expect, screen, waitFor } from 'storybook/test'
import type { ChatAdapter } from '../adapter/types'
import { makeStaticAdapter, StoryChat } from '../stories/harness'
import { defaultChatStrings } from '../strings'
import AttachmentUpload, { type Attachment, type AttachmentUploadHandle } from './AttachmentUpload'

const meta: Meta = {
  title: 'Chat/Attachment upload',
  component: AttachmentUpload,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: '40rem' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta

const FILES = ['results.csv', 'loss-curve.png', 'notes.txt', 'config.yaml', 'report.pdf', 'run.log']

// The workshop adapter's uploads fail, so the stories answer them here.
function uploadingAdapter(uploadMs: number): ChatAdapter {
  const base = makeStaticAdapter({ attachments: true })
  const store = base.attachments
  if (!store) {
    return base
  }
  return {
    ...base,
    attachments: {
      ...store,
      async upload(file) {
        await new Promise((resolve) => setTimeout(resolve, uploadMs))
        return {
          id: `att-${file.name}`,
          filename: file.name,
          contentType: file.type,
          size: file.size,
          uploadedAt: '2026-08-16T10:12:00Z',
        }
      },
    },
  }
}

// Adds `count` files in one batch on mount, as one drop would.
function Dropped({ count, maxFiles }: { count: number; maxFiles: number }) {
  const ref = useRef<AttachmentUploadHandle>(null)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  useEffect(() => {
    ref.current?.addFiles(
      FILES.slice(0, count).map(
        (name) => new File(['x'.repeat(2048)], name, { type: 'application/octet-stream' }),
      ),
    )
  }, [count])
  return (
    <AttachmentUpload
      ref={ref}
      attachments={attachments}
      onAttachmentsChange={setAttachments}
      maxFiles={maxFiles}
    />
  )
}

function WithUploads({
  count,
  maxFiles,
  uploadMs,
}: {
  count: number
  maxFiles: number
  uploadMs: number
}) {
  const adapter = useMemo(() => uploadingAdapter(uploadMs), [uploadMs])
  return (
    <StoryChat adapter={adapter}>
      <Dropped key={`${count}-${maxFiles}`} count={count} maxFiles={maxFiles} />
    </StoryChat>
  )
}

function WithoutUploads() {
  const adapter = useMemo(() => makeStaticAdapter(), [])
  return (
    <StoryChat adapter={adapter}>
      <Dropped count={2} maxFiles={10} />
    </StoryChat>
  )
}

/** One drop of more files than the limit: the first ones up to it attach and
 *  upload, and a single toast says why the rest didn't. */
export const OverTheLimit: StoryObj<{ count: number; maxFiles: number; uploadMs: number }> = {
  name: 'One drop over the limit',
  args: { count: 5, maxFiles: 3, uploadMs: 1500 },
  argTypes: {
    count: { control: { type: 'range', min: 1, max: FILES.length } },
    maxFiles: { control: { type: 'range', min: 1, max: FILES.length } },
    uploadMs: { control: { type: 'range', min: 0, max: 5000, step: 250 } },
  },
  render: (args) => <WithUploads {...args} />,
}

/** A chat whose host has nowhere to upload: a file added anyway is marked as
 *  not uploaded rather than vanishing. */
export const NowhereToUpload: StoryObj = {
  name: 'Nowhere to upload',
  render: () => <WithoutUploads />,
  play: async () => {
    const label = defaultChatStrings.attachmentUpload.uploadUnavailable
    await waitFor(() => expect(screen.getAllByRole('img', { name: label })).toHaveLength(2))
  },
}
