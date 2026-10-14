// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { AttachmentRef, ChatMessage as Message } from '../types'
import ChatMessage from './ChatMessage'

vi.mock('../ui/Markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div>{children}</div>,
}))
vi.mock('./BranchNavigator', () => ({ __esModule: true, default: () => null }))
vi.mock('../../components/Avatar', () => ({ Avatar: () => null }))

const attachment: AttachmentRef = {
  id: 'att-1',
  filename: 'photo.png',
  contentType: 'image/png',
  size: 123,
  uploadedAt: '2026-01-01T00:00:00Z',
}
const fileAttachment: AttachmentRef = {
  id: 'att-2',
  filename: 'notes.txt',
  contentType: 'text/plain',
  size: 456,
  uploadedAt: '2026-01-01T00:00:00Z',
}
const message: Message = {
  id: 'm1',
  role: 'user',
  content: 'hi',
  attachments: [attachment, fileAttachment],
}

describe('attachment onOpen wiring', () => {
  it('routes image and chip clicks to onOpenAttachment when provided', () => {
    const onOpen = vi.fn()
    render(
      <ChatMessage
        message={message}
        allMessages={[message]}
        attachmentDownloadUrl={(id) => `/dl/${id}`}
        onOpenAttachment={onOpen}
      />,
    )
    fireEvent.click(screen.getByAltText('photo.png'))
    expect(onOpen).toHaveBeenCalledWith(attachment)
    fireEvent.click(screen.getByText('notes.txt'))
    expect(onOpen).toHaveBeenCalledWith(fileAttachment)
    expect(onOpen).toHaveBeenCalledTimes(2)
  })

  it('keeps the download-only behavior when onOpenAttachment is absent', () => {
    render(
      <ChatMessage
        message={message}
        allMessages={[message]}
        attachmentDownloadUrl={(id) => `/dl/${id}`}
      />,
    )
    const image = screen.getByAltText('photo.png')
    expect(image.closest('[role="button"]')).toBeNull()
  })
})

describe('attachments as links', () => {
  it('links each downloadable attachment to its file, for saving or a new tab', () => {
    const onOpen = vi.fn()
    render(
      <ChatMessage
        message={message}
        allMessages={[message]}
        attachmentDownloadUrl={(id) => `/dl/${id}`}
        onOpenAttachment={onOpen}
      />,
    )
    const image = screen.getByRole('link', { name: 'photo.png' })
    expect(image).toHaveAttribute('href', '/dl/att-1')
    expect(image).toHaveAttribute('download', 'photo.png')
    const file = screen.getByRole('link', { name: /notes\.txt/ })
    expect(file).toHaveAttribute('href', '/dl/att-2')
    // A modified click is the browser's: no preview, the link opens.
    fireEvent.click(file, { metaKey: true })
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('opens an attachment with no download through a button, named for an unnamed file', () => {
    const onOpen = vi.fn()
    const unnamed: AttachmentRef = { ...fileAttachment, filename: '' }
    const m: Message = { ...message, attachments: [unnamed] }
    render(<ChatMessage message={m} allMessages={[m]} onOpenAttachment={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open File' }))
    expect(onOpen).toHaveBeenCalledWith(unnamed)
  })
})
