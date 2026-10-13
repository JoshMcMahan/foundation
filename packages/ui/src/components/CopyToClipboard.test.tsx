// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CopyCodeBlock } from './CopyToClipboard'
import { toast } from './Toast'

const notifySuccess = vi.spyOn(toast, 'success')

describe('CopyCodeBlock', () => {
  const setup = () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<CopyCodeBlock textToCopy="npm install">npm install</CopyCodeBlock>)
    return writeText
  }

  beforeEach(() => {
    notifySuccess.mockClear()
  })

  it('copies once when the copy button is clicked', async () => {
    const writeText = setup()

    fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('npm install'))
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(notifySuccess).toHaveBeenCalledTimes(1)
  })

  it('copies once when the surrounding block is clicked', async () => {
    const writeText = setup()

    fireEvent.click(screen.getByText('npm install'))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('npm install'))
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(notifySuccess).toHaveBeenCalledTimes(1)
  })

  it('ignores clicks while the copied check mark is showing', async () => {
    const writeText = setup()

    fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }))
    await screen.findByRole('button', { name: 'Copied' })

    fireEvent.click(screen.getByRole('button', { name: 'Copied' }))
    fireEvent.click(screen.getByText('npm install'))

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(notifySuccess).toHaveBeenCalledTimes(1)
  })
})
