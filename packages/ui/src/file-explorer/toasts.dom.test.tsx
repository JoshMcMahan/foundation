// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { UploadSession } from './lib/types'
import { UploadSessionToast } from './toasts'

const session = (status: UploadSession['status']): UploadSession =>
  ({
    id: 's1',
    storageName: 'bucket',
    targetPath: 'docs',
    uploadNodes: [
      { name: 'a.txt', file: new Blob(['a']), relativePath: 'a.txt' },
      { name: 'b.txt', file: new Blob(['b']), relativePath: 'b.txt' },
    ],
    status,
    queueIndex: 0,
    progress: { completedFiles: 0, totalFiles: 2, totalSizeBytes: 2 },
    toastId: 's1',
  }) as unknown as UploadSession

describe('UploadSessionToast', () => {
  it('says a canceled upload was canceled, not that its status is unknown', () => {
    render(<UploadSessionToast session={session('canceled')} queueLength={1} />)
    expect(screen.getByText('Canceled')).toBeInTheDocument()
    expect(screen.queryByText('Unknown')).not.toBeInTheDocument()
  })

  it('says whether its details and its file list are open', () => {
    render(<UploadSessionToast session={session('uploading')} queueLength={1} />)
    const expand = screen.getByRole('button', { name: 'Expand details' })
    expect(expand).toHaveAttribute('aria-expanded', 'false')

    fireEvent.click(expand)

    expect(screen.getByRole('button', { name: 'Minimize details' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(screen.getByRole('button', { name: '2 files' })).toHaveAttribute('aria-expanded', 'true')
  })
})
