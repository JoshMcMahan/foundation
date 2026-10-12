// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import {
  type MenuSearch,
  type OpenMenu,
  type RowMenuItem,
  useRowMenu,
  useRowMenuActive,
} from './RowContextMenu'

const SEARCH: MenuSearch = { placeholder: 'Search types', empty: 'No type matches' }

// A browser's ResizeObserver reports once as soon as it starts watching, which jsdom lacks.
vi.stubGlobal(
  'ResizeObserver',
  class {
    report: (entries: unknown[]) => void
    constructor(report: (entries: unknown[]) => void) {
      this.report = report
    }
    observe(target: Element) {
      this.report([{ target }])
    }
    unobserve() {}
    disconnect() {}
  },
)

const action = (label: string, extra: Partial<Extract<RowMenuItem, { kind: 'action' }>> = {}) =>
  ({ kind: 'action', label, onSelect: () => {}, ...extra }) satisfies RowMenuItem

function Menu({
  items,
  search,
  onClose,
  wrap,
  at = 10,
}: {
  items: RowMenuItem[]
  search?: MenuSearch
  onClose?: () => void
  wrap?: (openMenu: OpenMenu) => OpenMenu
  /** How far down the window it opens. */
  at?: number
}) {
  const { openMenu, contextMenu } = useRowMenu()
  const open = wrap ? wrap(openMenu) : openMenu
  return (
    <>
      <button type="button" onClick={() => open(10, at, items, onClose, search)}>
        Open
      </button>
      {contextMenu}
    </>
  )
}

function ActiveMenu(props: { items: RowMenuItem[]; search: MenuSearch; onClose: () => void }) {
  const { openMenu, contextMenu } = useRowMenu()
  const { active, openMenu: open } = useRowMenuActive(openMenu)
  return (
    <>
      <button
        type="button"
        data-active={active}
        onClick={() => open(10, 10, props.items, props.onClose, props.search)}
      >
        Open
      </button>
      {contextMenu}
    </>
  )
}

function openFrom(name = 'Open') {
  const opener = screen.getByRole('button', { name })
  opener.focus()
  fireEvent.click(opener)
  return opener
}

afterEach(() => {
  vi.useRealTimers()
})

describe('a row menu', () => {
  it('moves through its items with the arrow keys, up from its search to the last', () => {
    render(<Menu items={[action('Text'), action('Number'), action('Date')]} search={SEARCH} />)
    openFrom()
    const search = screen.getByRole('searchbox', { name: 'Search types' })
    expect(search).toHaveFocus()
    fireEvent.keyDown(search, { key: 'ArrowUp' })
    expect(screen.getByRole('button', { name: 'Date' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement as HTMLElement, { key: 'ArrowDown' })
    expect(screen.getByRole('button', { name: 'Text' })).toHaveFocus()
  })

  it('copies as well as acts for the first match when its search takes Enter', async () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const onSelect = vi.fn()
    render(
      <Menu
        items={[action('Copy ID', { onSelect, copy: { text: 'abc-123', label: 'ID' } })]}
        search={SEARCH}
      />,
    )
    openFrom()
    const search = screen.getByRole('searchbox', { name: 'Search types' })
    fireEvent.change(search, { target: { value: 'id' } })
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(writeText).toHaveBeenCalledWith('abc-123')
    expect(onSelect).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('gives focus back to what opened it once it closes', () => {
    render(<Menu items={[action('Text')]} search={SEARCH} />)
    const opener = openFrom()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('menu')).toBeNull()
    expect(opener).toHaveFocus()
  })

  it('keeps a submenu open while its search has focus, and closes it once focus leaves', () => {
    vi.useFakeTimers()
    render(
      <Menu
        items={[
          { kind: 'submenu', label: 'Add', search: SEARCH, items: [action('Text')] },
          action('Rename'),
        ]}
      />,
    )
    openFrom()
    const row = screen.getByRole('button', { name: 'Add' })
    fireEvent.click(row)
    const search = screen.getByRole('searchbox', { name: 'Search types' })
    search.focus()
    fireEvent.mouseLeave(row.parentElement as HTMLElement)
    act(() => vi.advanceTimersByTime(500))
    expect(screen.getByRole('searchbox', { name: 'Search types' })).toBeInTheDocument()
    fireEvent.blur(search, { relatedTarget: screen.getByRole('button', { name: 'Rename' }) })
    act(() => vi.advanceTimersByTime(500))
    expect(screen.queryByRole('searchbox', { name: 'Search types' })).toBeNull()
  })

  it('keeps a submenu open on a click in its empty space, which blurs to nothing', () => {
    vi.useFakeTimers()
    render(<Menu items={[{ kind: 'submenu', label: 'Add', search: SEARCH, items: [] }]} />)
    openFrom()
    const row = screen.getByRole('button', { name: 'Add' })
    fireEvent.mouseEnter(row.parentElement as HTMLElement)
    fireEvent.click(row)
    const search = screen.getByRole('searchbox', { name: 'Search types' })
    search.focus()
    fireEvent.blur(search, { relatedTarget: null })
    act(() => vi.advanceTimersByTime(500))
    expect(screen.getByRole('searchbox', { name: 'Search types' })).toBeInTheDocument()
  })

  it('scrolls a long search in a list of its own, which a scroll inside leaves open', () => {
    const items = Array.from({ length: 40 }, (_, i) => action(`Type ${i}`))
    render(<Menu items={[{ kind: 'submenu', label: 'All', items }]} search={SEARCH} />)
    openFrom()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search types' }), {
      target: { value: 'type' },
    })
    const list = screen.getByRole('button', { name: 'Type 0' }).parentElement as HTMLElement
    expect(list).toHaveClass('overflow-y-auto')
    fireEvent.scroll(list)
    expect(screen.getByRole('menu')).toBeInTheDocument()
    fireEvent.scroll(window)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('keeps the search and the opener’s close when it marks its row active', () => {
    const onClose = vi.fn()
    render(<ActiveMenu items={[action('Text')]} search={SEARCH} onClose={onClose} />)
    const opener = openFrom()
    expect(opener).toHaveAttribute('data-active', 'true')
    expect(screen.getByRole('searchbox', { name: 'Search types' })).toBeInTheDocument()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(opener).toHaveAttribute('data-active', 'false')
  })

  it('returns focus to the first opener after its menu was replaced by another row’s', () => {
    function TwoRows() {
      const { openMenu, contextMenu } = useRowMenu()
      return (
        <>
          <button
            type="button"
            onClick={() => openMenu(10, 10, [action('Text')], undefined, SEARCH)}
          >
            First
          </button>
          <button
            type="button"
            onClick={() => openMenu(10, 40, [action('Number')], undefined, SEARCH)}
          >
            Second
          </button>
          {contextMenu}
        </>
      )
    }
    render(<TwoRows />)
    const first = openFrom('First')
    // Focus is in the first menu's search when the second row swaps the menu.
    fireEvent.click(screen.getByRole('button', { name: 'Second' }))
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(first).toHaveFocus()
  })

  it('focuses the search of a menu that replaces an open one', () => {
    function TwoRows() {
      const { openMenu, contextMenu } = useRowMenu()
      return (
        <>
          <button type="button" onClick={() => openMenu(10, 10, [action('Text')])}>
            First
          </button>
          <button
            type="button"
            onClick={() =>
              openMenu(10, 40, [action('Number')], undefined, { ...SEARCH, placeholder: 'Find' })
            }
          >
            Second
          </button>
          {contextMenu}
        </>
      )
    }
    render(<TwoRows />)
    const first = openFrom('First')
    expect(screen.getByRole('button', { name: 'Text' })).toBeInTheDocument()
    // A right-click on another row swaps the menu without closing it.
    fireEvent.click(screen.getByRole('button', { name: 'Second' }))
    expect(screen.getByRole('searchbox', { name: 'Find' })).toHaveFocus()
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(first).toHaveFocus()
  })

  it('closes a submenu the keys leave, though the pointer rests on it', () => {
    vi.useFakeTimers()
    render(
      <Menu
        items={[
          { kind: 'submenu', label: 'Add', items: [action('Text')] },
          { kind: 'submenu', label: 'Move', items: [action('Up')] },
        ]}
      />,
    )
    openFrom()
    const add = screen.getByRole('button', { name: 'Add' })
    fireEvent.mouseEnter(add.parentElement as HTMLElement)
    add.focus()
    const text = screen.getByRole('button', { name: 'Text' })
    text.focus()
    const move = screen.getByRole('button', { name: 'Move' })
    fireEvent.blur(text, { relatedTarget: move })
    move.focus()
    act(() => vi.advanceTimersByTime(500))
    expect(screen.queryByRole('button', { name: 'Text' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Up' })).toBeInTheDocument()
  })

  it('caps only a menu with a search, so one without grows with its items', () => {
    render(<Menu items={[action('Text'), action('Number')]} at={500} />)
    openFrom()
    expect(screen.getByRole('menu').style.maxHeight).toBe('')
  })

  it('keeps its search field where it opened as its list grows', () => {
    // The menu measures 100px tall until the search lists more, in a 768px window.
    let tall = 100
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const height = this.getAttribute('role') === 'menu' ? tall : 0
      return { left: 0, top: 0, right: 200, bottom: height, width: 200, height } as DOMRect
    })
    const items = Array.from({ length: 40 }, (_, i) => action(`Type ${i}`))
    render(<Menu items={[{ kind: 'submenu', label: 'All', items }]} search={SEARCH} at={500} />)
    openFrom()
    const menu = screen.getByRole('menu')
    expect(menu).toHaveStyle({ top: '500px' })
    tall = 400
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search types' }), {
      target: { value: 'type' },
    })
    expect(menu).toHaveStyle({ top: '500px', maxHeight: `${768 - 8 - 500}px` })
    vi.restoreAllMocks()
  })
})
