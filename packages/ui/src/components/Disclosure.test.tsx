// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Disclosure, DisclosurePanel } from './Disclosure'

describe('Disclosure', () => {
  it('reveals its detail when its summary is pressed', async () => {
    render(<Disclosure summary="Arguments">the args</Disclosure>)
    const toggle = screen.getByRole('button', { name: 'Arguments' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('the args')).not.toBeInTheDocument()
    fireEvent.click(toggle)
    await waitFor(() => expect(screen.getByText('the args')).toBeVisible())
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
  })

  it('follows a held open state', () => {
    const onOpenChange = vi.fn()
    render(
      <Disclosure summary="Arguments" open onOpenChange={onOpenChange}>
        the args
      </Disclosure>,
    )
    expect(screen.getByText('the args')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Arguments' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('keeps folded detail mounted with keepMounted', () => {
    render(
      <Disclosure summary="Members" keepMounted>
        <input aria-label="Draft" />
      </Disclosure>,
    )
    expect(document.querySelector('input[aria-label="Draft"]')).toBeInTheDocument()
  })

  it('shows only the summary when disabled', () => {
    render(
      <Disclosure summary="Done" disabled>
        nothing
      </Disclosure>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(screen.queryByText('nothing')).not.toBeInTheDocument()
  })
})

describe('Disclosure aside', () => {
  it('shows its aside on the summary line, outside the toggle', () => {
    render(
      <Disclosure
        summary="cfd-prod"
        aside="devadmin@10.0.0.1"
        actions={<button type="button">Logs</button>}
      >
        detail
      </Disclosure>,
    )
    const toggle = screen.getByRole('button', { name: 'cfd-prod' })
    expect(screen.getByText('devadmin@10.0.0.1')).toBeInTheDocument()
    expect(toggle).not.toHaveTextContent('devadmin@10.0.0.1')
  })

  it('toggles from the empty part of the aside, as from the rest of the line', async () => {
    const { container } = render(
      <Disclosure summary="cfd-prod" aside="devadmin@10.0.0.1">
        detail
      </Disclosure>,
    )
    const toggle = screen.getByRole('button', { name: 'cfd-prod' })
    const rest = container.querySelector('[aria-hidden="true"].flex-1')
    expect(rest).not.toBeNull()
    fireEvent.click(rest as Element)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'))
  })

  it('lays out a row without an aside as it did before', () => {
    const { container } = render(
      <>
        <Disclosure
          summary="gpu-cluster-east"
          summaryControls={<button type="button">Why</button>}
          actions={<button type="button">More</button>}
        >
          detail
        </Disclosure>
        <Disclosure summary="cpu-batch-west" actions={<button type="button">More</button>}>
          detail
        </Disclosure>
      </>,
    )
    expect(container.innerHTML.replace(/ id="[^"]*"/g, '')).toMatchInlineSnapshot(
      `"<div data-closed=""><div class="flex min-w-0 items-center gap-2"><button type="button" tabindex="0" aria-expanded="false" class="group/disclosure flex min-w-0 items-start gap-2 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--theme-focus) cursor-pointer">gpu-cluster-east<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mt-[calc((1lh-0.875rem)/2)] h-3.5 w-3.5 shrink-0 opacity-70 transition-transform group-data-panel-open/disclosure:rotate-90 motion-reduce:transition-none"><path d="M6 3.5 10.5 8 6 12.5"></path></svg></button><div class="flex shrink-0 items-center gap-1"><button type="button">Why</button></div><div aria-hidden="true" class="min-w-0 flex-1 self-stretch cursor-pointer"></div><div class="flex shrink-0 items-center gap-1"><button type="button">More</button></div></div></div><div data-closed=""><div class="flex min-w-0 items-center gap-2"><div class="flex min-w-0 flex-1"><button type="button" tabindex="0" aria-expanded="false" class="group/disclosure flex min-w-0 items-start gap-2 rounded-sm text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--theme-focus) cursor-pointer">cpu-batch-west<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" class="mt-[calc((1lh-0.875rem)/2)] h-3.5 w-3.5 shrink-0 opacity-70 transition-transform group-data-panel-open/disclosure:rotate-90 motion-reduce:transition-none"><path d="M6 3.5 10.5 8 6 12.5"></path></svg></button></div><div class="flex shrink-0 items-center gap-1"><button type="button">More</button></div></div></div>"`,
    )
  })
})

describe('DisclosurePanel', () => {
  it('opens for a toggle that lives elsewhere', () => {
    const { rerender } = render(
      <DisclosurePanel open={false} id="steps">
        steps
      </DisclosurePanel>,
    )
    expect(screen.queryByText('steps')).not.toBeInTheDocument()
    rerender(
      <DisclosurePanel open id="steps">
        steps
      </DisclosurePanel>,
    )
    expect(screen.getByText('steps')).toHaveAttribute('id', 'steps')
  })
})

describe('Disclosure rows', () => {
  it('holds actions beside the toggle, not inside it, and can drop the chevron', () => {
    const onContextMenu = vi.fn()
    const { container } = render(
      <Disclosure
        summary="gpu-east"
        chevron={false}
        actions={<button type="button">Stop</button>}
        onContextMenu={onContextMenu}
      >
        detail
      </Disclosure>,
    )
    const toggle = screen.getByRole('button', { name: 'gpu-east' })
    const stop = screen.getByRole('button', { name: 'Stop' })
    expect(toggle).not.toContainElement(stop)
    expect(toggle.querySelector('svg')).toBeNull()
    fireEvent.contextMenu(container.firstElementChild as Element)
    expect(onContextMenu).toHaveBeenCalledOnce()
  })

  it('holds controls on the summary’s line outside the toggle, the rest of the line toggling', async () => {
    const onLogs = vi.fn()
    const { container } = render(
      <Disclosure
        summary="gpu-east"
        summaryControls={
          <button type="button" onClick={onLogs}>
            Couldn’t connect
          </button>
        }
        actions={<button type="button">Stop</button>}
      >
        detail
      </Disclosure>,
    )
    const toggle = screen.getByRole('button', { name: 'gpu-east' })
    const control = screen.getByRole('button', { name: 'Couldn’t connect' })
    expect(toggle).not.toContainElement(control)
    expect(control.closest('button button')).toBeNull()
    // Toggle, then the control, then the actions, in Tab order.
    const buttons = screen.getAllByRole('button').map((b) => b.textContent)
    expect(buttons).toEqual(['gpu-east', 'Couldn’t connect', 'Stop'])
    fireEvent.click(control)
    expect(onLogs).toHaveBeenCalledOnce()
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const rest = container.querySelector('[aria-hidden="true"].flex-1') as HTMLElement
    fireEvent.click(rest)
    await waitFor(() => expect(toggle).toHaveAttribute('aria-expanded', 'true'))
    expect(screen.getByText('detail')).toBeInTheDocument()
  })
})
