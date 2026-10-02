// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { AttachmentRef, ChatMessage as Message } from '../types'
import ChatMessage from './ChatMessage'

vi.mock('../../icons', () => ({
  CheckIcon: () => null,
  RefreshIcon: () => null,
  EditIcon: () => null,
  CopyIcon: () => null,
  ErrorIcon: () => null,
  RetryIcon: () => null,
  FileIcon: () => null,
  DownloadFileIcon: () => null,
  ThinkingIcon: () => null,
  ChevronRightIcon: () => null,
}))
vi.mock('../ui/Markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => <div>{children}</div>,
}))
vi.mock('./BranchNavigator', () => ({ __esModule: true, default: () => null }))
vi.mock('../ui/Avatar', () => ({ Avatar: () => null }))

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
