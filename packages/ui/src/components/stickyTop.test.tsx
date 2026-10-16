// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActionToolbar } from '../list/ActionToolbar'
import { StickyBar } from './StickyBar'
import { Table } from './Table'
import { Tabs } from './Tabs'

// jsdom lays nothing out, so each box reports the height the test gives its
// test id, and a tab row is 37px. jsdom does cascade a stylesheet, so the
// utilities the components pin with get theirs.
let heights: Record<string, number> = {}
let observers: ResizeObserverCallback[] = []
let sheet: HTMLStyleElement

beforeEach(() => {
  heights = { header: 44, toolbar: 40 }
  observers = []
  sheet = document.createElement('style')
  sheet.textContent =
    '.sticky { position: sticky } .top-0 { top: 0 } .contents { display: contents }'
  document.head.append(sheet)
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const tabs = this.querySelector(':scope > [role="tablist"]') ? 37 : 0
    const height = heights[this.dataset['testid'] ?? ''] ?? tabs
    return { height, width: 0, top: 0, left: 0, right: 0, bottom: height } as DOMRect
  })
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        observers.push(callback)
      }
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  sheet.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const resize = () => {
  for (const observer of observers) {
    observer([], {} as ResizeObserver)
  }
}

const items = [
  { value: 'overview', label: 'Overview', href: '#overview' },
  { value: 'nodes', label: 'Nodes', href: '#nodes' },
]

/** The shape of a host's shell: its page header pinned at the top of the
 *  page's scroller, ahead of the page, which pins its own chrome below it. */
function Shell({ toolbar, children }: { toolbar: ReactNode; children?: ReactNode }) {
  return (
    <div style={{ overflow: 'auto' }}>
      <div data-testid="header" style={{ position: 'sticky', top: 0 }}>
        Page header
      </div>
      <div>
        {toolbar}
        <div className="p-4">
          <Tabs label="Cluster" sticky value="nodes" items={items} />
          <section>
            <Table stickyHeader>
              <Table.Header>Name</Table.Header>
              <tr>
                <Table.Item>node-01</Table.Item>
              </tr>
            </Table>
          </section>
          {children}
        </div>
      </div>
    </div>
  )
}

const toolbar = () => screen.getByTestId('toolbar')
const tabRow = () => screen.getByRole('tablist').parentElement as HTMLElement
const thead = () => screen.getAllByRole('rowgroup')[0] as HTMLElement

describe('sticky page chrome', () => {
  it('stacks a toolbar, tabs and a table header under the page header', () => {
    render(<Shell toolbar={<StickyBar testId="toolbar">Filters</StickyBar>} />)
    expect(toolbar()).toHaveStyle({ top: '44px' })
    expect(tabRow()).toHaveStyle({ top: '84px' })
    expect(thead()).toHaveStyle({ top: '121px' })
  })

  it('moves the tabs and table header down when the toolbar wraps', async () => {
    render(<Shell toolbar={<StickyBar testId="toolbar">Filters</StickyBar>} />)
    heights['toolbar'] = 76
    resize()
    await waitFor(() => expect(tabRow()).toHaveStyle({ top: '120px' }))
    await waitFor(() => expect(thead()).toHaveStyle({ top: '157px' }))

    heights['toolbar'] = 40
    resize()
    await waitFor(() => expect(thead()).toHaveStyle({ top: '121px' }))
    expect(tabRow()).toHaveStyle({ top: '84px' })
  })

  it('follows a page header of another height', async () => {
    heights['header'] = 64
    render(<Shell toolbar={<StickyBar testId="toolbar">Filters</StickyBar>} />)
    expect(toolbar()).toHaveStyle({ top: '64px' })
    expect(thead()).toHaveStyle({ top: '141px' })
  })

  it('pins a sticky ActionToolbar under the page header', () => {
    render(
      <Shell
        toolbar={
          <ActionToolbar
            sticky
            label="Cluster controls"
            groups={[[{ key: 'stop', label: 'Stop', onClick: () => {} }]]}
          />
        }
      />,
    )
    expect(screen.getByRole('toolbar', { name: 'Cluster controls' })).toHaveStyle({ top: '44px' })
    expect(tabRow()).toHaveStyle({ top: '44px' })
  })

  it('settles: a resize that changes nothing writes nothing', async () => {
    render(<Shell toolbar={<StickyBar testId="toolbar">Filters</StickyBar>} />)
    const writes: MutationRecord[] = []
    const watch = new MutationObserver((records) => writes.push(...records))
    for (const el of [toolbar(), tabRow(), thead()]) {
      watch.observe(el, { attributes: true, attributeFilter: ['style'] })
    }
    resize()
    await new Promise((resolve) => setTimeout(resolve, 0))
    watch.disconnect()
    expect(writes).toEqual([])
  })

  it('hands back its own top when it stops sticking', () => {
    const { rerender } = render(<Tabs label="Cluster" sticky value="nodes" items={items} />)
    expect(tabRow()).toHaveStyle({ top: '0px' })
    rerender(<Tabs label="Cluster" value="nodes" items={items} />)
    expect(tabRow().style.top).toBe('')
  })
})
