// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CopyCodeBlock } from './CopyToClipboard'
import { UIProvider } from './Provider'

const notifyInfo = vi.fn()

describe('CopyCodeBlock', () => {
  const setup = () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(
      <UIProvider notify={{ info: notifyInfo }}>
        <CopyCodeBlock textToCopy="npm install">npm install</CopyCodeBlock>
      </UIProvider>,
    )
    return writeText
  }

  beforeEach(() => {
    notifyInfo.mockClear()
  })

  it('copies once when the copy button is clicked', async () => {
    const writeText = setup()

    fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('npm install'))
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(notifyInfo).toHaveBeenCalledTimes(1)
  })

  it('copies once when the surrounding block is clicked', async () => {
    const writeText = setup()

    fireEvent.click(screen.getByText('npm install'))

    await waitFor(() => expect(writeText).toHaveBeenCalledWith('npm install'))
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(notifyInfo).toHaveBeenCalledTimes(1)
  })

  it('ignores clicks while the copied check mark is showing', async () => {
    const writeText = setup()

    fireEvent.click(screen.getByRole('button', { name: 'Copy to clipboard' }))
    await screen.findByRole('button', { name: 'Copied' })

    fireEvent.click(screen.getByRole('button', { name: 'Copied' }))
    fireEvent.click(screen.getByText('npm install'))

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(notifyInfo).toHaveBeenCalledTimes(1)
  })
})
