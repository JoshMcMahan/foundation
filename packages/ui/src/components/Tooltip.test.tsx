// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { openTooltip } from '../test/tooltip'
import { formatInfoTipContent, InfoTip } from './InfoTip'
import { Tooltip, TooltipProvider } from './Tooltip'

function withProvider(ui: ReactNode) {
  return render(<TooltipProvider>{ui}</TooltipProvider>)
}

// Focus opens a tooltip without the hover delay.
function focus(element: HTMLElement) {
  act(() => element.focus())
}

describe('Tooltip', () => {
  it.each([
    ['inside the provider', withProvider],
    ['on its own', render],
  ])('shows its content when the anchor is focused, %s', async (_, mount) => {
    mount(
      <Tooltip content="Save changes">
        <button type="button">Save</button>
      </Tooltip>,
    )
    focus(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByText('Save changes')).toBeInTheDocument()
  })

  it('serves every anchor from one shared popup', async () => {
    withProvider(
      <>
        <Tooltip content="First">
          <button type="button">One</button>
        </Tooltip>
        <Tooltip content="Second">
          <button type="button">Two</button>
        </Tooltip>
      </>,
    )
    focus(screen.getByRole('button', { name: 'One' }))
    expect(await screen.findByText('First')).toBeInTheDocument()
    focus(screen.getByRole('button', { name: 'Two' }))
    expect(await screen.findByText('Second')).toBeInTheDocument()
    expect(screen.queryByText('First')).not.toBeInTheDocument()
  })

  it.each([
    ['empty content', { content: '' }],
    ['disabled', { content: 'Hidden', disabled: true }],
  ])('stays closed with %s', async (_, props) => {
    withProvider(
      <Tooltip {...props}>
        <button type="button">Anchor</button>
      </Tooltip>,
    )
    focus(screen.getByRole('button'))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(openTooltip()).toBeNull()
  })

  it('keeps the anchor’s own props and handlers', () => {
    const onClick = vi.fn()
    withProvider(
      <Tooltip content="Hint">
        <button type="button" className="mine" onClick={onClick}>
          Anchor
        </button>
      </Tooltip>,
    )
    const button = screen.getByRole('button', { name: 'Anchor' })
    expect(button).toHaveClass('mine')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('shows a keyboard shortcut beside the content', async () => {
    withProvider(
      <Tooltip content="Search" shortcut="⌘+F">
        <button type="button">Search</button>
      </Tooltip>,
    )
    focus(screen.getByRole('button'))
    await waitFor(() => expect(openTooltip()).not.toBeNull())
    expect([...document.body.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['⌘', 'F'])
  })

  it('opens an overflowOnly tooltip only while the text is clipped', async () => {
    withProvider(
      <Tooltip content="a-long-name" overflowOnly>
        <button type="button">a-long-name</button>
      </Tooltip>,
    )
    const button = screen.getByRole('button')
    focus(button)
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(openTooltip()).toBeNull()

    act(() => button.blur())
    Object.defineProperty(button, 'scrollWidth', { configurable: true, value: 200 })
    Object.defineProperty(button, 'clientWidth', { configurable: true, value: 100 })
    focus(button)
    await waitFor(() => expect(openTooltip()).not.toBeNull())
  })

  it('closes on Escape', async () => {
    withProvider(
      <Tooltip content="Dismiss me">
        <button type="button">Anchor</button>
      </Tooltip>,
    )
    focus(screen.getByRole('button'))
    expect(await screen.findByText('Dismiss me')).toBeInTheDocument()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByText('Dismiss me')).not.toBeInTheDocument())
  })
})

describe('InfoTip', () => {
  it('is a button named for what it reveals', () => {
    withProvider(<InfoTip text="Helpful explanation" />)
    expect(screen.getByRole('button', { name: 'More information' })).toBeInTheDocument()
  })

  it('reveals its text, links included, when pressed', async () => {
    withProvider(<InfoTip text="See [the docs](https://example.com/docs)" />)
    fireEvent.click(screen.getByRole('button', { name: 'More information' }))
    expect(await screen.findByRole('link', { name: /^the docs/ })).toHaveAttribute(
      'href',
      'https://example.com/docs',
    )
  })

  it('wraps its children as the trigger', () => {
    withProvider(<InfoTip text="Why it failed">Failed</InfoTip>)
    expect(screen.getByRole('button', { name: 'Failed' })).toBeInTheDocument()
  })

  it('renders only its children without text', () => {
    withProvider(<InfoTip text="">Failed</InfoTip>)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText('Failed')).toBeInTheDocument()
  })
})

describe('formatInfoTipContent', () => {
  it('returns null for empty content', () => {
    expect(formatInfoTipContent('')).toBeNull()
  })

  it('breaks lines on newlines and <br>', () => {
    const { container } = render(<p>{formatInfoTipContent('one\ntwo<br />three')}</p>)
    expect(container.querySelectorAll('br')).toHaveLength(2)
  })

  it('keeps HTML as literal text', () => {
    const { container } = render(<p>{formatInfoTipContent('hi <img src=x> there')}</p>)
    expect(container).toHaveTextContent('hi <img src=x> there')
    expect(container.querySelector('img')).toBeNull()
  })
})
