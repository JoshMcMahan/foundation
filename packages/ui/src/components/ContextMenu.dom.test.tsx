// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useRowMenuActive } from '../list/rowMenu'
import {
  ContextMenuProvider,
  type OpenMenu,
  type OpenMenuOptions,
  useCloseMenu,
  useContextMenu,
  useOpenMenu,
} from './ContextMenu'
import type { MenuAction, MenuEntry, MenuSearch } from './MenuEntries'
import { toast } from './Toast'

const SEARCH: MenuSearch = { placeholder: 'Search types', empty: 'No type matches' }

type ClickAction = Extract<MenuAction, { onClick: unknown }>

const action = (label: string, extra: Partial<ClickAction> = {}): ClickAction => ({
  label,
  onClick: () => {},
  ...extra,
})

function Opener({
  label = 'Open',
  items,
  options,
  openMenu,
}: {
  label?: string
  items: MenuEntry[]
  options?: OpenMenuOptions
  openMenu: OpenMenu
}) {
  return (
    <button type="button" onClick={(e) => openMenu(e.currentTarget, items, options)}>
      {label}
    </button>
  )
}

function Menu(props: { items: MenuEntry[]; options?: OpenMenuOptions }) {
  const { openMenu, contextMenu } = useContextMenu()
  return (
    <>
      <Opener openMenu={openMenu} {...props} />
      {contextMenu}
    </>
  )
}

function open(name = 'Open') {
  const opener = screen.getByRole('button', { name })
  act(() => opener.focus())
  fireEvent.click(opener)
  return opener
}

const menu = () => screen.findByRole('menu')

describe('the context menu', () => {
  it('opens at a right-click', async () => {
    function Area() {
      const { openMenu, contextMenu } = useContextMenu()
      return (
        <>
          {/* biome-ignore lint/a11y/noStaticElementInteractions: a test surface */}
          <div
            data-testid="area"
            onContextMenu={(e) => {
              e.preventDefault()
              openMenu(e, [action('Rename')])
            }}
          />
          {contextMenu}
        </>
      )
    }
    render(<Area />)
    fireEvent.contextMenu(screen.getByTestId('area'), { clientX: 40, clientY: 20 })
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeInTheDocument()
  })

  it('opens nothing for no items', () => {
    render(<Menu items={[]} />)
    open()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('runs an item, then closes and gives focus back to its opener', async () => {
    const onClick = vi.fn()
    render(<Menu items={[action('Rename', { onClick })]} />)
    const opener = open()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Rename' }))
    expect(onClick).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await waitFor(() => expect(opener).toHaveFocus())
  })

  it('copies an item’s text and confirms it', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<Menu items={[{ label: 'Copy ID', copy: { text: 'abc-123', label: 'ID' } }]} />)
    open()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy ID' }))
    expect(writeText).toHaveBeenCalledWith('abc-123')
  })

  it('confirms a copy without a noun, and says when copying fails', async () => {
    const success = vi.spyOn(toast, 'success')
    const error = vi.spyOn(toast, 'error')
    const writeText = vi
      .fn<(text: string) => Promise<void>>()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('denied'))
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<Menu items={[{ label: 'Copy link', copy: { text: 'https://x.test/1' } }]} />)
    open()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy link' }))
    await waitFor(() => expect(success).toHaveBeenCalledWith('Copied to clipboard'))
    open()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Copy link' }))
    await waitFor(() => expect(error).toHaveBeenCalledWith("Couldn't copy to the clipboard"))
    success.mockRestore()
    error.mockRestore()
  })

  it('gives every row’s icon one width, so labels line up whatever the icon’s size', async () => {
    render(
      <Menu
        items={[
          action('Rename', { icon: <svg className="size-4" /> }),
          action('Move', { icon: <svg className="size-3.5" /> }),
        ]}
      />,
    )
    open()
    for (const name of ['Rename', 'Move']) {
      const item = await screen.findByRole('menuitem', { name })
      const slot = item.querySelector('svg')?.parentElement
      expect(slot).toHaveClass('min-w-4', 'justify-center')
    }
  })

  it('keeps a disabled item inert and names why', async () => {
    const onClick = vi.fn()
    render(
      <Menu
        items={[action('Archive', { onClick, disabled: true, disabledReason: 'Stop it first' })]}
      />,
    )
    open()
    const item = await screen.findByRole('menuitem', { name: 'Archive. Stop it first' })
    expect(item).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(item)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('shows a checked item as a checkbox', async () => {
    const onClick = vi.fn()
    render(<Menu items={[action('Wait for any', { onClick, checked: true })]} />)
    open()
    const item = await screen.findByRole('menuitemcheckbox', { name: 'Wait for any' })
    expect(item).toHaveAttribute('aria-checked', 'true')
    fireEvent.click(item)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('opens a submenu', async () => {
    render(<Menu items={[{ label: 'Add', items: [action('Text')] }, action('Rename')]} />)
    open()
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Add' }))
    expect(await screen.findByRole('menuitem', { name: 'Text' })).toBeInTheDocument()
  })

  it('narrows to the actions its search matches, submenus included', async () => {
    render(
      <Menu
        items={[
          { label: 'Basic', items: [action('Text', { keywords: 'string' }), action('Number')] },
          { label: 'Choices', items: [action('Radio buttons')] },
        ]}
        options={{ search: SEARCH }}
      />,
    )
    open()
    const search = await screen.findByRole('searchbox', { name: 'Search types' })
    fireEvent.change(search, { target: { value: 'str' } })
    expect(screen.getByRole('menuitem', { name: 'Text' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Basic' })).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Number' })).toBeNull()
    fireEvent.change(search, { target: { value: 'zzz' } })
    expect(screen.getByText('No type matches')).toBeInTheDocument()
  })

  it('shows a row’s hint at its end, read with its label and found by its search', async () => {
    render(
      <Menu
        items={[
          action('Core Platform', { hint: 'CORE', shortcut: '1', icon: <svg /> }),
          action('Web', { hint: 'WEB' }),
        ]}
        options={{ search: SEARCH }}
      />,
    )
    open()
    await screen.findAllByRole('menuitem')
    const core = await screen.findByRole('menuitem', { name: 'Core Platform. CORE' })
    // The hint sits before the shortcut, which isn't read as part of the name.
    expect(core.textContent).toMatch(/CORE1$/)
    const search = screen.getByRole('searchbox', { name: 'Search types' })
    fireEvent.change(search, { target: { value: 'web' } })
    expect(screen.getByRole('menuitem', { name: 'Web. WEB' })).toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'core' } })
    expect(screen.queryByRole('menuitem', { name: /Web/ })).toBeNull()
  })

  it('runs the first match when its search takes Enter', async () => {
    const onClick = vi.fn()
    render(
      <Menu items={[action('Text'), action('Number', { onClick })]} options={{ search: SEARCH }} />,
    )
    open()
    const search = await screen.findByRole('searchbox', { name: 'Search types' })
    fireEvent.change(search, { target: { value: 'num' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('tells its opener when it closes, or another menu replaces it', async () => {
    const first = vi.fn()
    function TwoOpeners() {
      const { openMenu, contextMenu } = useContextMenu()
      return (
        <>
          <Opener
            label="First"
            openMenu={openMenu}
            items={[action('Text')]}
            options={{ onClose: first }}
          />
          <Opener label="Second" openMenu={openMenu} items={[action('Number')]} />
          {contextMenu}
        </>
      )
    }
    render(<TwoOpeners />)
    open('First')
    await menu()
    fireEvent.click(screen.getByRole('button', { name: 'Second' }))
    expect(first).toHaveBeenCalledOnce()
    expect(await screen.findByRole('menuitem', { name: 'Number' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Text' })).toBeNull()
  })

  it('keeps its row marked active while open', async () => {
    function Row() {
      const { openMenu, contextMenu } = useContextMenu()
      const { active, openMenu: openRowMenu } = useRowMenuActive(openMenu)
      return (
        <>
          <button
            type="button"
            data-active={active}
            onClick={(e) => openRowMenu(e.currentTarget, [action('Text')])}
          >
            Open
          </button>
          {contextMenu}
        </>
      )
    }
    render(<Row />)
    const opener = open()
    await menu()
    expect(opener).toHaveAttribute('data-active', 'true')
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
    await waitFor(() => expect(opener).toHaveAttribute('data-active', 'false'))
  })

  it.each([
    ['wheel', () => fireEvent.wheel(document.body)],
    ['blur', () => fireEvent.blur(window)],
    ['resize', () => fireEvent(window, new Event('resize'))],
  ] as const)('closes on %s when asked to, and tells its opener', async (trigger, happen) => {
    const onClose = vi.fn()
    render(<Menu items={[action('Copy')]} options={{ closeOn: [trigger], onClose }} />)
    open()
    await menu()
    act(happen)
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  })

  it('stays open on a wheel over the menu itself, and on what it wasn’t asked to close on', async () => {
    render(<Menu items={[action('Copy')]} options={{ closeOn: ['wheel'] }} />)
    open()
    const opened = await menu()
    fireEvent.wheel(opened)
    act(() => {
      fireEvent(window, new Event('resize'))
    })
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('closes the shared menu when its host says', async () => {
    function Host() {
      const openMenu = useOpenMenu()
      const closeMenu = useCloseMenu()
      return (
        <>
          <button type="button" onClick={(e) => openMenu(e.currentTarget, [action('Copy')])}>
            Open
          </button>
          <button type="button" onClick={closeMenu}>
            Switch pane
          </button>
        </>
      )
    }
    render(
      <ContextMenuProvider>
        <Host />
      </ContextMenuProvider>,
    )
    open()
    await menu()
    act(() => screen.getByRole('button', { name: 'Switch pane', hidden: true }).click())
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })
})
