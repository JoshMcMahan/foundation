// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { Tooltip } from '../components/Tooltip'
import { ToolbarPopover } from './ToolbarPopover'

function Toolbar({ onPaneKey = () => {} }: { onPaneKey?: (key: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    // A graph pane listens on its own element, as the editors do.
    <div
      ref={(pane) => {
        const listener = (e: KeyboardEvent) => onPaneKey(e.key)
        pane?.addEventListener('keydown', listener)
        return () => pane?.removeEventListener('keydown', listener)
      }}
    >
      <ToolbarPopover
        label="Problems"
        open={open}
        onOpenChange={setOpen}
        trigger={
          <Tooltip content="2 problems" disabled={open}>
            <button type="button">Problems</button>
          </Tooltip>
        }
      >
        <button type="button">first problem</button>
      </ToolbarPopover>
    </div>
  )
}

function openPanel() {
  const button = screen.getByRole('button', { name: 'Problems' })
  fireEvent.click(button)
  return { button, panel: screen.getByRole('dialog', { name: 'Problems' }) }
}

describe('ToolbarPopover', () => {
  it('opens from its button, through a tooltip, and focuses the panel rather than its first item', async () => {
    render(<Toolbar />)
    const { button, panel } = openPanel()
    expect(button).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(panel).toHaveFocus())
  })

  it('closes on Escape without the pane seeing the key, and gives focus back to its button', async () => {
    const onPaneKey = vi.fn()
    render(<Toolbar onPaneKey={onPaneKey} />)
    const { button, panel } = openPanel()
    await waitFor(() => expect(panel).toHaveFocus())
    fireEvent.keyDown(panel, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(button).toHaveFocus()
    expect(onPaneKey).not.toHaveBeenCalled()
  })

  it('closes on a press outside it', async () => {
    render(<Toolbar />)
    openPanel()
    fireEvent.pointerDown(document.body)
    fireEvent.mouseDown(document.body)
    fireEvent.click(document.body)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })
})
