// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createRef, useState } from 'react'
import { toast } from '../../components/Toast'
import type { AttachmentsAdapter } from '../adapter/types'
import { defaultChatStrings } from '../strings'
import type { AttachmentRef } from '../types'
import AttachmentUpload, { type Attachment, type AttachmentUploadHandle } from './AttachmentUpload'

let attachmentsAdapter: AttachmentsAdapter | undefined
vi.mock('../core/ChatProvider', () => ({
  useChat: () => ({ adapter: { attachments: attachmentsAdapter } }),
}))
vi.mock('swr', () => ({ mutate: () => Promise.resolve() }))

const t = defaultChatStrings.attachmentUpload

function file(name: string, size = 10): File {
  return new File(['x'.repeat(size)], name, { type: 'text/plain' })
}

// Uploads that finish only when the test says, to act while they run.
function deferredAdapter() {
  const waiting = new Map<string, (ref: AttachmentRef) => void>()
  const adapter: AttachmentsAdapter = {
    list: () => Promise.resolve({ attachments: [], total: 0, hasMore: false }),
    upload: (f) =>
      new Promise((resolve) => {
        waiting.set(f.name, resolve)
      }),
    remove: () => Promise.resolve(),
    downloadUrl: (id) => `/dl/${id}`,
  }
  const finish = async (name: string) => {
    await act(async () => {
      waiting.get(name)?.({
        id: `id-${name}`,
        filename: name,
        contentType: 'text/plain',
        size: 1,
        uploadedAt: '2026-01-01T00:00:00Z',
      })
    })
  }
  return { adapter, finish }
}

function renderHost(options: { initial?: Attachment[]; maxFiles?: number } = {}) {
  const ref = createRef<AttachmentUploadHandle>()
  const seen: Attachment[][] = []
  function Host() {
    const [attachments, setAttachments] = useState<Attachment[]>(options.initial ?? [])
    return (
      <AttachmentUpload
        ref={ref}
        attachments={attachments}
        onAttachmentsChange={(next) => {
          seen.push(next)
          setAttachments(next)
        }}
        {...(options.maxFiles === undefined ? {} : { maxFiles: options.maxFiles })}
      />
    )
  }
  render(<Host />)
  const add = async (files: File[]) => {
    await act(async () => {
      ref.current?.addFiles(files)
    })
  }
  return { add, seen, last: () => seen[seen.length - 1] ?? [] }
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  attachmentsAdapter = undefined
})

describe('AttachmentUpload', () => {
  it('holds one batch to the file limit', async () => {
    const { adapter, finish } = deferredAdapter()
    attachmentsAdapter = adapter
    const error = vi.spyOn(toast, 'error')
    const { add, last } = renderHost({ maxFiles: 2, initial: [] })
    await add([file('a.txt'), file('b.txt'), file('c.txt')])
    expect(last().map((a) => a.filename)).toEqual(['a.txt', 'b.txt'])
    expect(error).toHaveBeenCalledOnce()
    expect(error).toHaveBeenCalledWith(t.maxFilesAllowed(2))
    await finish('a.txt')
    await finish('b.txt')
    expect(last().map((a) => a.filename)).toEqual(['a.txt', 'b.txt'])
  })

  it('counts what is already attached toward the limit', async () => {
    attachmentsAdapter = deferredAdapter().adapter
    const error = vi.spyOn(toast, 'error')
    const initial = [{ filename: 'old.txt', mimeType: 'text/plain', size: 1, uploaded: true }]
    const { add, last } = renderHost({ maxFiles: 2, initial })
    await add([file('a.txt'), file('b.txt')])
    expect(last().map((a) => a.filename)).toEqual(['old.txt', 'a.txt'])
    expect(error).toHaveBeenCalledWith(t.maxFilesAllowed(2))
  })

  it('keeps a file removed while its batch uploads removed', async () => {
    const { adapter, finish } = deferredAdapter()
    attachmentsAdapter = adapter
    const { add, last } = renderHost()
    await add([file('a.txt'), file('b.txt')])
    // Remove b while both are still uploading.
    const removeButtons = screen.getAllByTitle('Remove')
    fireEvent.click(removeButtons[1] as HTMLElement)
    expect(last().map((a) => a.filename)).toEqual(['a.txt'])
    await finish('a.txt')
    await finish('b.txt')
    expect(last()).toEqual([expect.objectContaining({ filename: 'a.txt', uploaded: true })])
  })

  it('keeps a file added by another batch while this one uploads', async () => {
    const { adapter, finish } = deferredAdapter()
    attachmentsAdapter = adapter
    const { add, last } = renderHost()
    await add([file('a.txt')])
    await add([file('b.txt')])
    await finish('a.txt')
    expect(last().map((a) => [a.filename, a.uploaded ?? false])).toEqual([
      ['a.txt', true],
      ['b.txt', false],
    ])
    await finish('b.txt')
    expect(last().map((a) => [a.filename, a.uploaded ?? false])).toEqual([
      ['a.txt', true],
      ['b.txt', true],
    ])
  })

  it('says so on each file when the chat has nowhere to upload it', async () => {
    const { add, last } = renderHost()
    await add([file('a.txt')])
    expect(last()).toEqual([
      expect.objectContaining({ filename: 'a.txt', error: t.uploadUnavailable }),
    ])
    expect(screen.getByRole('img', { name: t.uploadUnavailable })).toBeInTheDocument()
  })
})
