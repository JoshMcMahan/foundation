// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Drawer, type DrawerProps } from './Drawer'

function renderDrawer(props: Partial<DrawerProps> = {}) {
  const onClose = vi.fn()
  render(
    <Drawer open onClose={onClose} title="Edit quota" {...props}>
      <input aria-label="Limit" />
    </Drawer>,
  )
  return { onClose, dialog: screen.getByRole('dialog', { name: 'Edit quota' }) }
}

describe('Drawer', () => {
  it('is a dialog named by its title, described by its description', () => {
    const { dialog } = renderDrawer({ description: 'Limits for the namespace' })
    expect(dialog).toHaveAccessibleDescription('Limits for the namespace')
  })

  it('leads with a back arrow for a view opened over its first', () => {
    const onBack = vi.fn()
    const { onClose } = renderDrawer({ onBack, backLabel: 'Back to the list' })
    fireEvent.click(screen.getByRole('button', { name: 'Back to the list' }))
    expect(onBack).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('closes from its close button and on Escape', () => {
    const { onClose, dialog } = renderDrawer()
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('ignores Escape when not dismissible, and can leave closing to its footer', () => {
    const { onClose, dialog } = renderDrawer({
      dismissible: false,
      closeButton: false,
      footer: <button type="button">Save</button>,
    })
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })

  it('takes a width in pixels or as a CSS length', () => {
    const { dialog } = renderDrawer({ width: 560 })
    expect(dialog).toHaveStyle({ width: '560px' })
  })

  it('resizes from its handle with the arrow keys, within its minimum', () => {
    renderDrawer({ resizable: true, width: 330, minWidth: 320 })
    const handle = screen.getByRole('separator', { name: 'Resize panel' })
    // jsdom lays nothing out, so the drawer starts at the width it asks for.
    expect(handle).toHaveAttribute('aria-valuenow', '330')
    fireEvent.keyDown(handle, { key: 'ArrowLeft' })
    expect(handle).toHaveAttribute('aria-valuenow', '346')
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(handle).toHaveAttribute('aria-valuenow', '320')
    fireEvent.keyDown(handle, { key: 'Home' })
    expect(handle).toHaveAttribute('aria-valuetext', '320 pixels wide')
  })

  it('widens toward the page from either edge', () => {
    renderDrawer({ resizable: true, side: 'left', minWidth: 320 })
    const handle = screen.getByRole('separator')
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    expect(handle).toHaveAttribute('aria-valuenow', '496')
  })

  it('stays inside its container when contained, and keeps its content while closed', async () => {
    const { rerender } = render(
      <div data-testid="panel" style={{ position: 'relative' }}>
        <Drawer open onClose={() => {}} aria-label="Conversations" contained keepMounted>
          <p>history</p>
        </Drawer>
      </div>,
    )
    expect(screen.getByTestId('panel')).toContainElement(
      screen.getByRole('dialog', { name: 'Conversations' }),
    )
    rerender(
      <div data-testid="panel" style={{ position: 'relative' }}>
        <Drawer open={false} onClose={() => {}} aria-label="Conversations" contained keepMounted>
          <p>history</p>
        </Drawer>
      </div>,
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('history')).toBeInTheDocument()
  })
})

describe('Drawer presses', () => {
  it('stays open when a press starts inside and ends on the backdrop', async () => {
    const onClose = vi.fn()
    render(
      <Drawer open onClose={onClose} title="Edit quota">
        <p>Drag a selection out of here</p>
      </Drawer>,
    )
    const text = await screen.findByText('Drag a selection out of here')
    fireEvent.pointerDown(text)
    fireEvent.mouseDown(text)
    fireEvent.pointerUp(document.body)
    fireEvent.mouseUp(document.body)
    fireEvent.click(document.body)
    expect(onClose).not.toHaveBeenCalled()
  })
})
