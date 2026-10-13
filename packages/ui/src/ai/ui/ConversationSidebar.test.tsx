// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ConversationSidebar, type ConversationSidebarGroup } from './ConversationSidebar'

const storage = new Map<string, string>()
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, String(v)),
    removeItem: (k: string) => storage.delete(k),
    clear: () => storage.clear(),
  },
})

interface Item {
  id: string
  title: string
}

const item = (id: string): Item => ({ id, title: `Item ${id}` })

const groups: ConversationSidebarGroup<Item>[] = [
  { key: 'waiting', label: 'Waiting', tone: 'attention', items: [item('a')] },
  { key: 'rest', label: 'Rest', items: [item('b'), item('c')] },
]

function Sidebar(
  props: Partial<Parameters<typeof ConversationSidebar<Item>>[0]> & { collapsed?: boolean },
) {
  return (
    <ConversationSidebar<Item>
      label="Items"
      collapsed={false}
      onToggle={() => {}}
      toggleLabels={{ open: 'Open', close: 'Close' }}
      groups={groups}
      getKey={(i) => i.id}
      renderRow={(i) => <li>{i.title}</li>}
      {...props}
    />
  )
}

const panel = () => screen.getByRole('complementary', { name: 'Items' })
const keyDown = (key: string) => fireEvent.keyDown(document, { key, metaKey: true, altKey: true })

beforeEach(() => storage.clear())

describe('ConversationSidebar', () => {
  it('lists each group under its heading, in order', () => {
    render(<Sidebar />)
    expect(screen.getAllByRole('heading').map((h) => h.textContent)).toEqual(['Waiting', 'Rest'])
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Item a',
      'Item b',
      'Item c',
    ])
  })

  it('shows the placeholder when there are no groups, and nothing of it otherwise', () => {
    const { rerender } = render(<Sidebar groups={[]} placeholder={<p>Nothing yet</p>} />)
    expect(screen.getByText('Nothing yet')).toBeInTheDocument()
    rerender(<Sidebar placeholder={<p>Nothing yet</p>} />)
    expect(screen.queryByText('Nothing yet')).not.toBeInTheDocument()
  })

  it('shows skeleton rows instead of the list while loading', () => {
    render(<Sidebar loading />)
    expect(screen.queryByText('Item a')).not.toBeInTheDocument()
  })

  it('swaps the list for the rail while collapsed', () => {
    render(<Sidebar collapsed rail={<li>dot</li>} />)
    expect(screen.getByText('dot')).toBeInTheDocument()
    expect(screen.queryByText('Item a')).not.toBeInTheDocument()
    expect(panel().style.width).toBe('48px')
  })

  it('keeps a fixed width and no handle without resize', () => {
    render(<Sidebar />)
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
    expect(panel().style.width).toBe('256px')
  })

  it('stores the width under its own key', () => {
    storage.set('itemsWidth', '300')
    render(<Sidebar resize={{ storageKey: 'itemsWidth', label: 'Resize', hint: 'Drag' }} />)
    expect(panel().style.width).toBe('300px')
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize' }), { key: 'ArrowRight' })
    expect(panel().style.width).toBe('316px')
    expect(storage.get('itemsWidth')).toBe('316')
  })

  it('opens in a drawer at full width, with no rail or handle, and closes from it', () => {
    const onClose = vi.fn()
    render(
      <Sidebar
        collapsed
        rail={<li>dot</li>}
        resize={{ storageKey: 'itemsWidth', label: 'Resize', hint: 'Drag' }}
        drawer={{ open: true, onClose, label: 'Items drawer' }}
      />,
    )
    expect(screen.getByRole('dialog', { name: 'Items drawer' })).toBeInTheDocument()
    expect(screen.getByText('Item a')).toBeInTheDocument()
    expect(screen.queryByText('dot')).not.toBeInTheDocument()
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
    expect(panel().style.width).toBe('100%')
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Items drawer' }), { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('cycles through the items in list order and wraps', () => {
    const onSelect = vi.fn()
    const { rerender } = render(<Sidebar cycle={{ current: groups[1]?.items[1], onSelect }} />)
    keyDown('ArrowDown')
    expect(onSelect).toHaveBeenLastCalledWith(groups[0]?.items[0])
    keyDown('ArrowUp')
    expect(onSelect).toHaveBeenLastCalledWith(groups[1]?.items[0])

    rerender(<Sidebar cycle={{ current: undefined, onSelect }} />)
    keyDown('ArrowUp')
    expect(onSelect).toHaveBeenLastCalledWith(groups[1]?.items[1])
  })

  it('ignores arrows without both modifiers, and cycles nothing without cycle', () => {
    const onSelect = vi.fn()
    const { rerender } = render(<Sidebar cycle={{ current: undefined, onSelect }} />)
    fireEvent.keyDown(document, { key: 'ArrowDown', metaKey: true })
    expect(onSelect).not.toHaveBeenCalled()
    rerender(<Sidebar />)
    keyDown('ArrowDown')
    expect(onSelect).not.toHaveBeenCalled()
  })
})
