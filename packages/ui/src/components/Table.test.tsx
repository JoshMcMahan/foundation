// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Table } from './Table'

// FileTableHeaders depends on both of these: it is a wrapper opting in via
// isTableHeader precisely because a fragment would not be hoisted.
describe('Table child hoisting', () => {
  it('hoists a wrapper component that opts in via isTableHeader', () => {
    function Headers() {
      return (
        <>
          <Table.Header>One</Table.Header>
          <Table.Header>Two</Table.Header>
        </>
      )
    }
    Headers.isTableHeader = true

    const { container } = render(
      <Table>
        <Headers />
        <tr>
          <td>body</td>
        </tr>
      </Table>,
    )

    expect(container.querySelectorAll('thead th')).toHaveLength(2)
    expect(container.querySelectorAll('tbody th')).toHaveLength(0)
    expect(container.querySelectorAll('tbody tr')).toHaveLength(1)
  })

  it('does NOT flatten a fragment, so wrapped headers fall into tbody', () => {
    // Children.toArray treats a fragment as one opaque child, which is not a
    // header, so grouped headers need an isTableHeader wrapper instead.
    const { container } = render(
      <Table>
        {/* biome-ignore lint/complexity/noUselessFragments: the fragment is the subject under test — removing it inverts the assertion */}
        <>
          <Table.Header>A</Table.Header>
          <Table.Header>B</Table.Header>
        </>
      </Table>,
    )

    expect(container.querySelectorAll('thead th')).toHaveLength(0)
    expect(container.querySelectorAll('tbody th')).toHaveLength(2)
  })
})

describe('sortable Table.Header', () => {
  it('is a button that says the sort direction, and sorts on press', () => {
    const onSort = vi.fn()
    render(
      <Table>
        <Table.Header onSort={onSort} sort="descending">
          Name
        </Table.Header>
        <Table.Header onSort={onSort}>Size</Table.Header>
        <Table.Header>Static</Table.Header>
      </Table>,
    )

    const name = screen.getByRole('columnheader', { name: 'Name' })
    expect(name).toHaveAttribute('aria-sort', 'descending')
    // A sortable column that isn't the sorted one says so.
    expect(screen.getByRole('columnheader', { name: 'Size' })).toHaveAttribute('aria-sort', 'none')
    expect(screen.getByRole('columnheader', { name: 'Static' })).not.toHaveAttribute('aria-sort')

    fireEvent.click(screen.getByRole('button', { name: 'Name' }))
    expect(onSort).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Static' })).toBeNull()
  })

  it('shows the sorted column’s mark, and an unsorted one’s only on hover or focus, in reserved space', () => {
    render(
      <Table>
        <Table.Header onSort={() => {}} sort="ascending">
          Name
        </Table.Header>
        <Table.Header onSort={() => {}}>Size</Table.Header>
      </Table>,
    )
    const mark = (name: string) =>
      screen.getByRole('button', { name }).querySelector('svg') as SVGElement
    expect(mark('Name')).not.toHaveClass('opacity-0')
    expect(mark('Size')).toHaveClass(
      'opacity-0',
      'group-hover/sort:opacity-40',
      'group-focus-visible/sort:opacity-40',
    )
  })
})

describe('Table layout', () => {
  it('pads a header and the cells under it alike, so the column lines up', () => {
    render(
      <Table>
        <Table.Header>Name</Table.Header>
        <tr>
          <Table.Item>ada</Table.Item>
        </tr>
      </Table>,
    )
    const padding = (el: HTMLElement) => [...el.classList].filter((c) => /^p[xlr]-/.test(c))
    expect(padding(screen.getByRole('columnheader'))).toEqual(padding(screen.getByRole('cell')))
  })

  it('holds a compact row to 32px, padding only a cell that wraps', () => {
    render(
      <Table density="compact">
        <Table.Header>Name</Table.Header>
        <tr>
          <Table.Item>ada</Table.Item>
          <Table.Item wrap>a note that wraps</Table.Item>
        </tr>
      </Table>,
    )
    expect(screen.getByRole('cell', { name: 'ada' })).toHaveClass(
      'h-8',
      'py-0',
      'whitespace-nowrap',
    )
    expect(screen.getByRole('cell', { name: 'a note that wraps' })).toHaveClass('h-8', 'py-1')
    expect(screen.getByRole('columnheader')).toHaveClass('py-1.5')
  })

  it('lets a caller pad a cell its own way, and spans columns', () => {
    render(
      <Table density="compact">
        <tr>
          <Table.Item className="py-2.5 px-6" colSpan={2}>
            ada
          </Table.Item>
        </tr>
      </Table>,
    )
    const cell = screen.getByRole('cell')
    expect(cell).toHaveClass('py-2.5', 'px-6')
    expect(cell).not.toHaveClass('py-1.5', 'px-3')
    expect(cell).toHaveAttribute('colspan', '2')
  })
})

describe('Table sticky header', () => {
  // jsdom lays nothing out, so each box reports the height its test gives it.
  let observers: ResizeObserverCallback[] = []
  beforeEach(() => {
    observers = []
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const height = Number(this.dataset['height'] ?? 0)
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
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  const pinned = (top: number, height: number, label: string) => (
    <div style={{ position: 'sticky', top }} data-height={height}>
      {label}
    </div>
  )

  function Rows() {
    return (
      <Table stickyHeader>
        <Table.Header>Name</Table.Header>
        <tr>
          <Table.Item>ada</Table.Item>
        </tr>
      </Table>
    )
  }

  const thead = () => screen.getAllByRole('rowgroup')[0] as HTMLElement

  it('pins below the page header and toolbar its scroller pins, not behind them', () => {
    render(
      <div style={{ overflow: 'auto' }}>
        {pinned(0, 44, 'Page header')}
        <div>
          {pinned(44, 40, 'Toolbar')}
          <section>
            <h2>Nodes</h2>
            <Rows />
          </section>
        </div>
      </div>,
    )
    expect(thead()).toHaveStyle({ top: '84px' })
  })

  it('pins at the top of a box that scrolls on its own, whatever the page pins', () => {
    render(
      <div style={{ overflow: 'auto' }}>
        {pinned(0, 44, 'Page header')}
        <div style={{ overflow: 'auto', height: 200 }}>
          <Rows />
        </div>
      </div>,
    )
    expect(thead()).toHaveStyle({ top: '0px' })
  })

  it('leaves out what stops pinning before the table passes, or pins only after it', () => {
    render(
      <div style={{ overflow: 'auto' }}>
        {pinned(0, 44, 'Page header')}
        {/* Pinned only within its own section, which ends above the table. */}
        <section>{pinned(44, 40, 'Section toolbar')}</section>
        <Rows />
        {pinned(44, 40, 'Later toolbar')}
        {/* Pinned to the bottom, not the top. */}
        <div style={{ position: 'sticky', bottom: 0 }} data-height={40} />
      </div>,
    )
    expect(thead()).toHaveStyle({ top: '44px' })
  })

  it('finds a tab row whose root is display: contents', () => {
    render(
      <div style={{ overflow: 'auto' }}>
        <div style={{ display: 'contents' }}>{pinned(44, 37, 'Tabs')}</div>
        <Rows />
      </div>,
    )
    expect(thead()).toHaveStyle({ top: '81px' })
  })

  it('follows chrome as it wraps to a new height, appears or goes', async () => {
    function Page({ toolbar }: { toolbar: boolean }) {
      return (
        <div style={{ overflow: 'auto' }}>
          {pinned(0, 44, 'Page header')}
          {toolbar && pinned(44, 40, 'Toolbar')}
          <Rows />
        </div>
      )
    }
    const { rerender } = render(<Page toolbar={false} />)
    expect(thead()).toHaveStyle({ top: '44px' })

    rerender(<Page toolbar />)
    await waitFor(() => expect(thead()).toHaveStyle({ top: '84px' }))

    // The toolbar wraps to a second row on a narrow screen.
    screen.getByText('Toolbar').dataset['height'] = '76'
    for (const observer of observers) {
      observer([], {} as ResizeObserver)
    }
    expect(thead()).toHaveStyle({ top: '120px' })

    rerender(<Page toolbar={false} />)
    await waitFor(() => expect(thead()).toHaveStyle({ top: '44px' }))
  })

  it('pins nothing when the header does not stick', () => {
    render(
      <div style={{ overflow: 'auto' }}>
        {pinned(0, 44, 'Page header')}
        <Table>
          <Table.Header>Name</Table.Header>
        </Table>
      </div>,
    )
    expect(thead()).not.toHaveClass('sticky')
    expect(thead().style.top).toBe('')
  })
})

describe('table options', () => {
  it('sizes its columns, sets its headers in sentence case, and keeps a header’s own choice', () => {
    const { container } = render(
      <Table columns={['20%', undefined]} caps={false} density="dense" flush columnDividers>
        <Table.Header>Name</Table.Header>
        <Table.Header caps>Nodes</Table.Header>
        <tr>
          <Table.Item>a</Table.Item>
          <Table.Item>1</Table.Item>
        </tr>
      </Table>,
    )
    const cols = container.querySelectorAll('colgroup col')
    expect(cols).toHaveLength(2)
    expect(cols[0]).toHaveStyle({ width: '20%' })
    expect(screen.getByRole('columnheader', { name: 'Name' })).not.toHaveClass('uppercase')
    expect(screen.getByRole('columnheader', { name: 'Nodes' })).toHaveClass('uppercase')
    expect(screen.getByRole('cell', { name: 'a' })).toHaveClass('py-1', 'text-xs')
    // The colgroup stays out of the body, where the table's rows go.
    expect(container.querySelector('tbody colgroup')).toBeNull()
  })
})
