// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { IconButton } from './IconButton'
import { Popover, PopoverClose, type PopoverOptions, useClosePopover } from './Popover'
import { Tooltip } from './Tooltip'

function Toolbar({
  onPaneKey = () => {},
  ...props
}: { onPaneKey?: (key: string) => void } & Partial<PopoverOptions>) {
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
      <Popover
        title="Problems"
        open={open}
        onOpenChange={setOpen}
        trigger={
          <Tooltip content="2 problems" disabled={open}>
            <button type="button">Problems</button>
          </Tooltip>
        }
        {...props}
      >
        <button type="button">first problem</button>
      </Popover>
    </div>
  )
}

function openPanel() {
  const button = screen.getByRole('button', { name: 'Problems' })
  fireEvent.click(button)
  return { button, panel: screen.getByRole('dialog', { name: 'Problems' }) }
}

describe('Popover', () => {
  it('opens from its trigger, through a tooltip, named by its title', async () => {
    render(<Toolbar />)
    const { button } = openPanel()
    expect(button).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(screen.getByRole('button', { name: 'first problem' })).toHaveFocus())
  })

  it('can focus the panel rather than its first control', async () => {
    render(<Toolbar initialFocus="popup" />)
    const { panel } = openPanel()
    await waitFor(() => expect(panel).toHaveFocus())
  })

  it('closes on Escape without the pane seeing the key, and gives focus back to its trigger', async () => {
    const onPaneKey = vi.fn()
    render(<Toolbar onPaneKey={onPaneKey} initialFocus="popup" />)
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

  it('closes from a PopoverClose inside it', async () => {
    render(
      <Popover aria-label="Organizations" trigger={<button type="button">Switch</button>}>
        <PopoverClose>Done</PopoverClose>
      </Popover>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }))
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('closes from a link inside it, which stays a link', async () => {
    function AllLink() {
      const close = useClosePopover()
      return (
        <a
          href="/organizations"
          onClick={(e) => {
            e.preventDefault()
            close()
          }}
        >
          See all
        </a>
      )
    }
    render(
      <Popover aria-label="Organizations" trigger={<button type="button">Switch</button>}>
        <AllLink />
      </Popover>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Switch' }))
    fireEvent.click(screen.getByRole('link', { name: 'See all' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('hides an icon button trigger’s tooltip while it is open', async () => {
    render(
      <Popover aria-label="Display" trigger={<IconButton icon="▤" label="Display" />}>
        options
      </Popover>,
    )
    const button = screen.getByRole('button', { name: 'Display' })
    // The tooltip shows the label as text; the popover's own name is only an attribute.
    act(() => button.focus())
    expect(await screen.findByText('Display')).toBeInTheDocument()
    fireEvent.click(button)
    expect(await screen.findByText('options')).toBeInTheDocument()
    act(() => button.focus())
    await waitFor(() => expect(screen.queryByText('Display')).toBeNull())
  })
})
