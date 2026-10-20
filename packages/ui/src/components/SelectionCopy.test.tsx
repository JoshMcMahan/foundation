// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { SelectionCopy } from './SelectionCopy'
import { toast } from './Toast'

function select(node: Node) {
  const range = document.createRange()
  range.selectNodeContents(node)
  // jsdom lays nothing out.
  range.getClientRects = () => [] as unknown as DOMRectList
  range.getBoundingClientRect = () => new DOMRect(10, 10, 50, 16)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  act(() => {
    document.dispatchEvent(new Event('selectionchange'))
  })
}

describe('SelectionCopy', () => {
  it('offers to copy just the selected text, then puts the button away', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    const success = vi.spyOn(toast, 'success')
    render(
      <SelectionCopy>
        <pre>
          <span data-testid="part">image: ubuntu</span>
          {'\nsteps: []'}
        </pre>
      </SelectionCopy>,
    )
    expect(screen.queryByRole('button')).toBeNull()
    select(screen.getByTestId('part'))
    const button = await screen.findByRole('button', { name: 'Copy selection' })
    await act(async () => fireEvent.click(button))
    expect(writeText).toHaveBeenCalledWith('image: ubuntu')
    expect(success).toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('button')).toBeNull())
    success.mockRestore()
  })

  it('ignores a selection elsewhere and goes away on Escape', async () => {
    render(
      <>
        <p data-testid="outside">elsewhere</p>
        <SelectionCopy>
          <p data-testid="inside">inside</p>
        </SelectionCopy>
      </>,
    )
    select(screen.getByTestId('outside'))
    expect(screen.queryByRole('button')).toBeNull()
    select(screen.getByTestId('inside'))
    await screen.findByRole('button', { name: 'Copy selection' })
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(screen.queryByRole('button')).toBeNull()
  })
})
