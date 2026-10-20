// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { Menu as BaseMenu } from '@base-ui/react/menu'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { Combobox } from './Combobox'
import { DatePicker } from './DatePicker'
import { HoverCard } from './HoverCard'
import { MenuItem, MenuPopup } from './Menu'
import { Modal } from './Modal'
import { Popover } from './Popover'
import { UIProvider } from './Provider'
import { Select } from './Select'
import { Tooltip } from './Tooltip'

// jsdom has no top layer: showModal and :modal are stood in for here, with the
// same contract a browser keeps, an open dialog that matches :modal.
const modal = new WeakSet<Element>()
const nativeMatches = Element.prototype.matches
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true
    modal.add(this)
    // A browser moves focus into the dialog as it opens.
    this.focus()
  }
  HTMLDialogElement.prototype.show = function show(this: HTMLDialogElement) {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.open = false
    modal.delete(this)
  }
  Element.prototype.matches = function matches(this: Element, selector: string) {
    return selector === ':modal' ? modal.has(this) : nativeMatches.call(this, selector)
  } as Element['matches']
})
afterAll(() => {
  Element.prototype.matches = nativeMatches
})
afterEach(cleanup)

function Dialog({ children }: { children: ReactNode }) {
  return (
    <dialog aria-label="New issue" tabIndex={-1}>
      {children}
    </dialog>
  )
}

/** Shows a `<dialog>` as a modal or not, then renders `ui` in it, so a popup
 *  open from the start opens once the dialog is up. */
function renderInDialog(ui: ReactNode, how: 'showModal' | 'show' = 'showModal') {
  const { rerender } = render(
    <UIProvider>
      <Dialog>{null}</Dialog>
    </UIProvider>,
  )
  const dialog = document.querySelector('dialog') as HTMLDialogElement
  act(() => dialog[how]())
  rerender(
    <UIProvider>
      <Dialog>{ui}</Dialog>
    </UIProvider>,
  )
  return dialog
}

/** Opens a popup the way a reader does: the pointer goes down on the trigger, then clicks. */
function press(trigger: HTMLElement) {
  fireEvent.pointerDown(trigger)
  fireEvent.mouseDown(trigger)
  fireEvent.pointerUp(trigger)
  fireEvent.mouseUp(trigger)
  fireEvent.click(trigger)
}

const sizes = [
  { value: 'small', label: 'Small' },
  { value: 'large', label: 'Large' },
]

const popups: [string, ReactNode, () => Promise<HTMLElement>][] = [
  [
    'a select',
    <Select key="select" aria-label="Size" items={sizes} defaultValue="small" />,
    async () => {
      press(screen.getByRole('combobox', { name: 'Size' }))
      return screen.findByRole('listbox')
    },
  ],
  [
    'a combobox',
    <Combobox key="combobox" aria-label="Region" items={['us-east', 'eu-west']} />,
    async () => {
      const input = screen.getByRole('combobox', { name: 'Region' })
      act(() => input.focus())
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      return screen.findByRole('listbox')
    },
  ],
  [
    'a popover',
    <Popover key="popover" title="Filter" trigger={<button type="button">Filter</button>}>
      <p>Panel</p>
    </Popover>,
    async () => {
      press(screen.getByRole('button', { name: 'Filter' }))
      return screen.findByRole('dialog', { name: 'Filter' })
    },
  ],
  [
    'a menu',
    <BaseMenu.Root key="menu">
      <BaseMenu.Trigger>Actions</BaseMenu.Trigger>
      <MenuPopup>
        <MenuItem>Archive</MenuItem>
      </MenuPopup>
    </BaseMenu.Root>,
    async () => {
      press(screen.getByRole('button', { name: 'Actions' }))
      return screen.findByRole('menu')
    },
  ],
  [
    'a date picker',
    <DatePicker key="date" aria-label="Due" value="" onValueChange={() => {}} />,
    async () => {
      press(screen.getByRole('button', { name: 'Due' }))
      return screen.findByRole('grid')
    },
  ],
  [
    'a tooltip',
    <Tooltip key="tooltip" content="Copies the link">
      <button type="button">Copy</button>
    </Tooltip>,
    async () => {
      const anchor = screen.getByRole('button', { name: 'Copy' })
      act(() => anchor.focus())
      return waitFor(() => {
        const tip = screen.getByText('Copies the link')
        expect(anchor).toHaveAttribute('data-popup-open')
        return tip
      })
    },
  ],
  [
    'a hover card',
    <HoverCard key="card" defaultOpen card={<p>Ada Lovelace</p>}>
      <a href="/users/ada">ada</a>
    </HoverCard>,
    () => screen.findByText('Ada Lovelace'),
  ],
  [
    'a modal',
    <Modal key="modal" open onClose={() => {}} title="Discard draft?" />,
    () => screen.findByRole('dialog', { name: 'Discard draft?' }),
  ],
]

describe('popups inside a native modal dialog', () => {
  it.each(popups)(
    'opens %s inside the dialog, where the top layer shows it',
    async (_, ui, open) => {
      const dialog = renderInDialog(ui)
      const popup = await open()
      expect(dialog).toContainElement(popup)
    },
  )

  it('places the portal at the viewport, so the dialog does not clip the popup', async () => {
    const dialog = renderInDialog(<Select aria-label="Size" items={sizes} defaultValue="small" />)
    press(screen.getByRole('combobox', { name: 'Size' }))
    const listbox = await screen.findByRole('listbox')
    const portal = [...dialog.children].find((child) => child.contains(listbox))
    expect(portal).toHaveClass('[dialog>&]:fixed')
  })

  it('opens in the innermost modal dialog that holds the trigger', async () => {
    render(
      <dialog aria-label="Outer">
        <dialog aria-label="Inner">
          <Select aria-label="Size" items={sizes} defaultValue="small" />
        </dialog>
      </dialog>,
    )
    const [outer, inner] = document.querySelectorAll('dialog') as unknown as HTMLDialogElement[]
    act(() => {
      outer?.showModal()
      inner?.showModal()
    })
    press(screen.getByRole('combobox', { name: 'Size' }))
    const listbox = await screen.findByRole('listbox')
    expect(inner).toContainElement(listbox)
    expect(inner?.parentElement).toBe(outer)
  })

  it('keeps the body for a dialog shown without showModal, which is not in the top layer', async () => {
    const dialog = renderInDialog(
      <Select aria-label="Size" items={sizes} defaultValue="small" />,
      'show',
    )
    press(screen.getByRole('combobox', { name: 'Size' }))
    const listbox = await screen.findByRole('listbox')
    expect(dialog).not.toContainElement(listbox)
    expect(document.body).toContainElement(listbox)
  })

  it('opens a popup opened by code inside the modal dialog that holds focus', async () => {
    function Opener() {
      return (
        <Popover open aria-label="Mentions" at={document.body}>
          <p>Ada</p>
        </Popover>
      )
    }
    render(
      <dialog aria-label="Comment">
        <button type="button">Reply</button>
      </dialog>,
    )
    const dialog = document.querySelector('dialog') as HTMLDialogElement
    act(() => dialog.showModal())
    act(() => screen.getByRole('button', { name: 'Reply' }).focus())
    render(<Opener />)
    expect(dialog).toContainElement(await screen.findByText('Ada'))
  })
})

describe('popups outside any dialog', () => {
  let fullscreen: Element | null = null
  beforeAll(() => {
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get: () => fullscreen,
    })
  })
  afterEach(() => {
    fullscreen = null
  })

  it('open in the body', async () => {
    render(<Select aria-label="Size" items={sizes} defaultValue="small" />)
    press(screen.getByRole('combobox', { name: 'Size' }))
    const listbox = await screen.findByRole('listbox')
    expect(listbox.closest('dialog')).toBeNull()
    expect(document.body).toContainElement(listbox)
  })

  it('open in the fullscreen element while there is one', async () => {
    const { container } = render(<Select aria-label="Size" items={sizes} defaultValue="small" />)
    act(() => {
      fullscreen = container
      document.dispatchEvent(new Event('fullscreenchange'))
    })
    press(screen.getByRole('combobox', { name: 'Size' }))
    expect(container).toContainElement(await screen.findByRole('listbox'))
  })
})
