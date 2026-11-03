// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createPortal } from 'react-dom'
import type { MockInstance } from 'vitest'
import { isPlainClick } from '../components/AppLink'
import { type UILinkComponent, UIProvider } from '../components/Provider'
import { Table } from '../components/Table'
import { clearSelection, selectText } from '../test/selection'
import { memoryStorage } from '../test/storage'
import { openTooltip } from '../test/tooltip'
import { ListColumns, ListPage, ListRow, ListRowActionsProvider } from './ListPage'
import { HEADERS_OFF, ListError, ListSelectAllHeader, listTableProps, NameCell } from './ListTable'
import { ListDisplayMenu } from './ListViewControls'
import { type ListViewChrome, useListView } from './listView'
import type { RowAction } from './rowMenu'

function renderRow(disabled: boolean, onSelect: () => void) {
  return renderPinned({
    key: 'stop',
    label: 'Stop',
    icon: <span data-testid="stop-icon" />,
    onClick: onSelect,
    disabled,
  })
}

function renderPinned(action: RowAction) {
  return render(
    <table>
      <tbody>
        <ListRow
          href={null}
          items={[]}
          goTo={() => {}}
          openMenu={() => {}}
          pinnedActions={[action]}
        >
          <Table.Item>row</Table.Item>
        </ListRow>
      </tbody>
    </table>,
  )
}

describe('ListRow pinned actions', () => {
  it('keeps a disabled action focusable and readable but inert', async () => {
    const onSelect = vi.fn()
    renderRow(true, onSelect)

    const action = screen.getByRole('button', { name: 'Stop' })

    expect(action).toHaveAttribute('aria-disabled', 'true')
    expect(action).not.toBeDisabled()

    act(() => action.focus())
    expect(action).toHaveFocus()
    await waitFor(() => expect(openTooltip()).toHaveTextContent('Stop'))

    fireEvent.click(action)
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('still runs an enabled action', () => {
    const onSelect = vi.fn()
    renderRow(false, onSelect)

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('copies a copy action’s text', () => {
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    renderPinned({ key: 'copy-id', label: 'Copy ID', copy: { text: 'c-1', label: 'ID' } })

    fireEvent.click(screen.getByRole('button', { name: 'Copy ID' }))
    expect(writeText).toHaveBeenCalledWith('c-1')
  })

  it('warns about an action with no behavior', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    // A cast stands in for a JavaScript caller, which the types don't reach.
    renderPinned({ key: 'restart', label: 'Restart' } as RowAction)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"Restart" has no onClick'))
    warn.mockRestore()
  })
})

describe('ListRow onActivate', () => {
  it('runs on a plain row click when there is no href', () => {
    const onActivate = vi.fn()
    render(
      <table>
        <tbody>
          <ListRow
            href={null}
            onActivate={onActivate}
            items={[]}
            goTo={() => {}}
            openMenu={() => {}}
          >
            <Table.Item>row</Table.Item>
          </ListRow>
        </tbody>
      </table>,
    )

    fireEvent.click(screen.getByText('row'))
    expect(onActivate).toHaveBeenCalledOnce()
  })

  it('doesn’t run on the click that ends selecting the row’s text', () => {
    const onActivate = vi.fn()
    render(
      <table>
        <tbody>
          <ListRow
            href={null}
            onActivate={onActivate}
            items={[]}
            goTo={() => {}}
            openMenu={() => {}}
          >
            <Table.Item>row</Table.Item>
          </ListRow>
        </tbody>
      </table>,
    )

    selectText(screen.getByText('row'))
    fireEvent.click(screen.getByText('row'))
    expect(onActivate).not.toHaveBeenCalled()
    clearSelection()
  })
})

// A middle click, as a mouse sends it: the browser's auxclick, which only the middle and right
// buttons fire.
function middleClick(element: Element) {
  fireEvent(element, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }))
}

describe('ListRow and what it opens in a portal', () => {
  // A drawer or a popover a cell opens renders outside the row, in a portal, but React passes
  // its events up to the row all the same.
  function RowWithPortal({
    goTo,
    onActivate,
    openMenu,
  }: {
    goTo: (to: string) => void
    onActivate?: () => void
    openMenu: () => void
  }) {
    return (
      <table>
        <tbody>
          <ListRow
            href={onActivate ? null : '/runs/17'}
            onActivate={onActivate}
            items={[{ label: 'Rename', onClick: () => {} }]}
            goTo={goTo}
            openMenu={openMenu}
          >
            <Table.Item>
              row
              {createPortal(<div>opened panel</div>, document.body)}
            </Table.Item>
          </ListRow>
        </tbody>
      </table>
    )
  }

  it('doesn’t navigate on a click in it, as on a drawer’s backdrop or text', () => {
    const goTo = vi.fn()
    render(<RowWithPortal goTo={goTo} openMenu={() => {}} />)
    fireEvent.click(screen.getByText('opened panel'))
    expect(goTo).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('row'))
    expect(goTo).toHaveBeenCalledWith('/runs/17')
  })

  it('doesn’t activate on a click in it', () => {
    const onActivate = vi.fn()
    render(<RowWithPortal goTo={() => {}} onActivate={onActivate} openMenu={() => {}} />)
    fireEvent.click(screen.getByText('opened panel'))
    expect(onActivate).not.toHaveBeenCalled()
  })

  it('doesn’t open the row’s menu on a right-click in it', () => {
    const openMenu = vi.fn()
    render(<RowWithPortal goTo={() => {}} openMenu={openMenu} />)
    fireEvent.contextMenu(screen.getByText('opened panel'))
    expect(openMenu).not.toHaveBeenCalled()
    fireEvent.contextMenu(screen.getByText('row'))
    expect(openMenu).toHaveBeenCalledOnce()
  })

  it('doesn’t open a new tab on a middle click in it', () => {
    const open = vi.spyOn(window, 'open').mockReturnValue(null)
    render(<RowWithPortal goTo={() => {}} openMenu={() => {}} />)
    middleClick(screen.getByText('opened panel'))
    expect(open).not.toHaveBeenCalled()
    middleClick(screen.getByText('row'))
    expect(open).toHaveBeenCalledWith('/runs/17', '_blank', 'noopener')
    open.mockRestore()
  })
})

describe('ListRow with an href', () => {
  // Stands in for a host router's link, which takes over only a plain click.
  const routed: string[] = []
  const RouterLink: UILinkComponent = ({ href, onClick, ...props }) => (
    <a
      {...props}
      href={href}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented && isPlainClick(e)) {
          e.preventDefault()
          routed.push(href)
        }
      }}
    />
  )

  function renderLinked({
    href = '/runs/17',
    selecting = false,
    onRowSelect,
  }: {
    href?: string
    selecting?: boolean
    onRowSelect?: () => void
  } = {}) {
    const goTo = vi.fn()
    render(
      <UIProvider slots={{ link: RouterLink }}>
        <table>
          <tbody>
            <ListRow
              href={href}
              items={[]}
              goTo={goTo}
              openMenu={() => {}}
              selectionActive={selecting}
              onRowSelect={onRowSelect}
            >
              <NameCell icon={null} name="rnaseq-quant" subtitle="Run 17" href={href} />
              <Table.Item>18m 4s</Table.Item>
            </ListRow>
          </tbody>
        </table>
      </UIProvider>,
    )
    return {
      goTo,
      name: screen.getByRole('link', { name: /rnaseq-quant/ }),
      runtime: screen.getByText('18m 4s'),
    }
  }

  let open: MockInstance<typeof window.open>
  beforeEach(() => {
    open = vi.spyOn(window, 'open').mockReturnValue(null)
  })
  afterEach(() => {
    open.mockRestore()
    clearSelection()
    routed.length = 0
  })

  it('makes its name the row’s link, which takes its own clicks', () => {
    const { goTo, name } = renderLinked()
    expect(name).toHaveAttribute('href', '/runs/17')
    expect(name).toHaveAttribute('data-row-link')
    fireEvent.click(name)
    expect(routed).toEqual(['/runs/17'])
    // The browser opens the link's own new tab.
    fireEvent.click(name, { metaKey: true })
    middleClick(name)
    expect(open).not.toHaveBeenCalled()
    expect(goTo).not.toHaveBeenCalled()
  })

  it('opens on a plain click anywhere else on the row', () => {
    const { goTo, runtime } = renderLinked()
    fireEvent.click(runtime)
    expect(goTo).toHaveBeenCalledWith('/runs/17')
    expect(open).not.toHaveBeenCalled()
  })

  it('doesn’t open on the click that ends selecting its text, as to copy it', () => {
    const { goTo, runtime } = renderLinked()
    selectText(runtime)
    fireEvent.click(runtime)
    // Across cells, letting go lands on the row itself.
    fireEvent.click(runtime.closest('tr') as HTMLElement)
    fireEvent.click(runtime, { metaKey: true })
    expect(goTo).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
    // The next click, with nothing selected, opens it.
    clearSelection()
    fireEvent.click(runtime)
    expect(goTo).toHaveBeenCalledOnce()
  })

  it('opens with text selected outside the row', () => {
    const { goTo, runtime } = renderLinked()
    const outside = document.createElement('p')
    outside.textContent = 'elsewhere'
    document.body.append(outside)
    selectText(outside)
    fireEvent.click(runtime)
    expect(goTo).toHaveBeenCalledWith('/runs/17')
    outside.remove()
  })

  it('opens in a new tab on a Cmd, Ctrl, Shift or middle click anywhere on the row', () => {
    const { goTo, runtime } = renderLinked()
    fireEvent.click(runtime, { metaKey: true })
    fireEvent.click(runtime, { ctrlKey: true })
    fireEvent.click(runtime, { shiftKey: true })
    middleClick(runtime)
    expect(open.mock.calls).toEqual(Array(4).fill(['/runs/17', '_blank', 'noopener']))
    // Alt asks for neither, on a link.
    fireEvent.click(runtime, { altKey: true })
    expect(open).toHaveBeenCalledTimes(4)
    expect(goTo).not.toHaveBeenCalled()
  })

  it('keeps a Shift press from selecting text, and a middle press from scrolling', () => {
    const { runtime } = renderLinked()
    expect(fireEvent.mouseDown(runtime, { shiftKey: true })).toBe(false)
    expect(fireEvent.mouseDown(runtime, { button: 1 })).toBe(false)
    // A plain press still starts selecting text.
    expect(fireEvent.mouseDown(runtime)).toBe(true)
  })

  it('opens no new tab for a URL a link wouldn’t take', () => {
    const { runtime } = renderLinked({ href: 'javascript:alert(1)' })
    fireEvent.click(runtime, { metaKey: true })
    middleClick(runtime)
    expect(open).not.toHaveBeenCalled()
  })

  it('selects on a click while selecting, except one that ends selecting text, and opens no tab', () => {
    const onRowSelect = vi.fn()
    const { goTo, name, runtime } = renderLinked({ selecting: true, onRowSelect })
    expect(name).not.toHaveAttribute('data-row-link')
    selectText(runtime)
    fireEvent.click(runtime)
    expect(onRowSelect).not.toHaveBeenCalled()
    clearSelection()
    fireEvent.click(runtime)
    expect(onRowSelect).toHaveBeenCalledOnce()
    middleClick(runtime)
    expect(open).not.toHaveBeenCalled()
    expect(goTo).not.toHaveBeenCalled()
  })
})

describe('ListRow stacked columns', () => {
  const view: ListViewChrome = {
    showActions: false,
    alwaysShowActions: false,
    columnClasses: ['', 'hidden @[36rem]:table-cell', 'hidden @[36rem]:table-cell'],
    columnStacks: [false, false, true],
  }

  it('shows a stacked column under the first cell where its own cell gives way', () => {
    render(
      <ListRowActionsProvider view={view}>
        <table>
          <tbody>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <Table.Item>Ada</Table.Item>
              <Table.Item>Lisbon</Table.Item>
              <Table.Item>Running</Table.Item>
            </ListRow>
          </tbody>
        </table>
      </ListRowActionsProvider>,
    )
    const cells = screen.getAllByRole('cell')
    // The first cell keeps its content and carries the stacked one, shown only when narrow.
    expect(cells[0]).toHaveTextContent('AdaRunning')
    const stacked = cells[0]?.querySelector('[data-stacked]')
    expect(stacked).toHaveTextContent('Running')
    expect(stacked?.closest('[data-stacked-line]')).toHaveClass('@[36rem]:hidden')
    // Its own cell gives way when narrow, like a medium-priority column.
    expect(cells[2]).toHaveTextContent('Running')
    expect(cells[2]).toHaveClass('hidden', '@[36rem]:table-cell')
    // A column that only drops (priority) isn't stacked.
    expect(cells[0]).not.toHaveTextContent('Lisbon')
  })

  it('gives the name the rest of the row on a phone, and at every width once it stands alone', () => {
    const row = (columnClasses: string[]) =>
      render(
        <ListRowActionsProvider view={{ ...view, columnClasses, columnStacks: [] }}>
          <table>
            <tbody>
              <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
                {columnClasses.map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: fixed cells
                  <Table.Item key={i}>cell</Table.Item>
                ))}
              </ListRow>
            </tbody>
          </table>
        </ListRowActionsProvider>,
      )
    const { unmount } = row(['', ''])
    expect(screen.getAllByRole('cell')[0]).toHaveClass('@max-[36rem]:w-auto!')
    expect(screen.getAllByRole('cell')[0]).not.toHaveClass('w-auto!')
    unmount()
    row([''])
    expect(screen.getAllByRole('cell')[0]).toHaveClass('w-auto!')
  })

  it('stacks under a NameCell too, past its icon and outside its link', () => {
    render(
      <ListRowActionsProvider
        view={{
          ...view,
          columnClasses: ['', 'hidden @[36rem]:table-cell'],
          columnStacks: [false, true],
        }}
      >
        <table>
          <tbody>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <NameCell icon={<span />} name="gpu-trainer" subtitle="2 nodes" href={null} />
              <Table.Item>Running</Table.Item>
            </ListRow>
          </tbody>
        </table>
      </ListRowActionsProvider>,
    )
    const first = screen.getAllByRole('cell')[0]
    expect(first).toHaveTextContent('gpu-trainer2 nodesRunning')
    expect(first?.querySelector('[data-stacked]')).toHaveTextContent('Running')
  })

  it('styles and stacks cells a component of the host’s renders, as it does cells given straight', () => {
    // Cells as a host wraps them: each its own component, rendering a Table.Item.
    const NameText = ({ name }: { name: string }) => (
      <Table.Item className="py-2.5">{name}</Table.Item>
    )
    const TextCell = ({ value }: { value?: string }) => (
      <Table.Item className="py-2.5">{value ? <span>{value}</span> : null}</Table.Item>
    )
    render(
      <ListRowActionsProvider view={view}>
        <table>
          <tbody>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <NameText name="gpu-trainer" />
              <TextCell value="us-east-1" />
              <TextCell value="Running" />
            </ListRow>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <NameText name="scratch" />
              <TextCell value="us-west-2" />
              <TextCell />
            </ListRow>
          </tbody>
        </table>
      </ListRowActionsProvider>,
    )
    const [first, other] = screen.getAllByRole('row')
    const cells = within(first as HTMLElement).getAllByRole('cell')
    expect(cells[0]?.querySelector('[data-stacked]')).toHaveTextContent('Running')
    expect(cells[0]?.querySelector('[data-stacked-line]')).toHaveClass('@[36rem]:hidden')
    // Each keeps its own classes and takes its column's.
    expect(cells[1]).toHaveClass('py-2.5', 'hidden', '@[36rem]:table-cell')
    expect(cells[2]).toHaveClass('hidden', '@[36rem]:table-cell')
    // A stacked cell is a line, not a cell inside a cell.
    expect(cells[0]?.querySelector('td')).toBeNull()
    // A wrapped cell with nothing in it adds no line.
    const second = within(other as HTMLElement).getAllByRole('cell')
    expect(second[0]?.querySelector('[data-stacked]')).toBeNull()
  })

  it('stacks a wrapped cell under a NameCell, past its icon', () => {
    const TextCell = ({ value }: { value: string }) => <Table.Item>{value}</Table.Item>
    render(
      <ListRowActionsProvider
        view={{
          ...view,
          columnClasses: ['', 'hidden @[36rem]:table-cell'],
          columnStacks: [false, true],
        }}
      >
        <table>
          <tbody>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <NameCell icon={<span />} name="gpu-trainer" subtitle="2 nodes" href={null} />
              <TextCell value="Running" />
            </ListRow>
          </tbody>
        </table>
      </ListRowActionsProvider>,
    )
    const stacked = screen.getAllByRole('cell')[0]?.querySelector('[data-stacked]')
    expect(stacked).toHaveTextContent('Running')
    // Under the name's column of the grid, not after it.
    expect(stacked?.closest('[data-stacked-line]')?.parentElement).toHaveClass('col-start-2')
  })

  it('flows several stacked values inline on one line that wraps between them', () => {
    render(
      <ListRowActionsProvider
        view={{
          ...view,
          columnClasses: ['', ...Array(3).fill('hidden @[36rem]:table-cell')],
          columnStacks: [false, true, true, true],
        }}
      >
        <table>
          <tbody>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <NameCell icon={<span />} name="gpu-trainer" href={null} />
              <Table.Item>Instance</Table.Item>
              <Table.Item>
                <span>Running</span>
              </Table.Item>
              <td>us-west-2</td>
            </ListRow>
          </tbody>
        </table>
      </ListRowActionsProvider>,
    )
    const first = screen.getAllByRole('cell')[0]
    const lines = first?.querySelectorAll('[data-stacked-line]') ?? []
    expect(lines).toHaveLength(1)
    expect(lines[0]).toHaveClass('flex-wrap')
    const items = Array.from(lines[0]?.querySelectorAll('[data-stacked]') ?? [])
    expect(items.map((item) => item.textContent)).toEqual(['Instance', 'Running', 'us-west-2'])
    // A value never breaks inside itself.
    for (const item of items) {
      expect(item).toHaveClass('whitespace-nowrap')
    }
  })

  it('puts a stacked value on a line of its own, or joins it to the one before after a dot', () => {
    render(
      <ListRowActionsProvider
        view={{
          ...view,
          columnClasses: ['', ...Array(4).fill('hidden @[36rem]:table-cell')],
          columnStacks: [false, true, true, true, true],
          columnStackLines: [undefined, 'own', 'own', 'own', 'join'],
        }}
      >
        <table>
          <tbody>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <NameCell icon={<span />} name="wrf-forecast" href={null} />
              <Table.Item>Running</Table.Item>
              <Table.Item>maya</Table.Item>
              <Table.Item>compute</Table.Item>
              <Table.Item>compute-[01-04]</Table.Item>
            </ListRow>
          </tbody>
        </table>
      </ListRowActionsProvider>,
    )
    const first = screen.getAllByRole('cell')[0]
    const group = first?.querySelector('[data-stacked-lines]')
    expect(group).toHaveClass('@[36rem]:hidden')
    const lines = Array.from(first?.querySelectorAll('[data-stacked-line]') ?? [])
    expect(lines.map((line) => line.textContent)).toEqual([
      'Running',
      'maya',
      'computecompute-[01-04]',
    ])
    // The joined value brings its own dot, drawn before it, so it is only seen.
    const [partition, nodes] = Array.from(lines[2]?.querySelectorAll('[data-stacked]') ?? [])
    expect(partition).not.toHaveClass("before:content-['·']")
    expect(nodes).toHaveClass("before:content-['·']")
  })

  it('leaves no dot where a joined value is empty, as a job not yet placed has no nodes', () => {
    render(
      <ListRowActionsProvider
        view={{
          ...view,
          columnClasses: ['', 'hidden @[36rem]:table-cell', 'hidden @[36rem]:table-cell'],
          columnStacks: [false, true, true],
          columnStackLines: [undefined, 'own', 'join'],
        }}
      >
        <table>
          <tbody>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <Table.Item>lammps-md</Table.Item>
              <Table.Item>compute</Table.Item>
              <Table.Item>{''}</Table.Item>
            </ListRow>
          </tbody>
        </table>
      </ListRowActionsProvider>,
    )
    const items = screen.getAllByRole('cell')[0]?.querySelectorAll('[data-stacked]') ?? []
    expect(Array.from(items).map((item) => item.textContent)).toEqual(['compute'])
  })

  it('collapses a stacked value whose host component renders nothing, so the next starts the line', () => {
    // A status only some rows have, rendered by the host's own component inside the cell.
    const NoStatus = () => null
    render(
      <ListRowActionsProvider
        view={{
          ...view,
          columnClasses: ['', ...Array(2).fill('hidden @[36rem]:table-cell')],
          columnStacks: [false, true, true],
        }}
      >
        <table>
          <tbody>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <NameCell icon={<span />} name="job-48210-scratch" href={null} />
              <Table.Item>
                <NoStatus />
              </Table.Item>
              <Table.Item>maya</Table.Item>
            </ListRow>
          </tbody>
        </table>
      </ListRowActionsProvider>,
    )
    const line = screen.getAllByRole('cell')[0]?.querySelector('[data-stacked-line]')
    const [status, owner] = Array.from(line?.querySelectorAll('[data-stacked]') ?? [])
    // Hidden while empty, so it leaves no gap before the owner.
    expect(status).toBeEmptyDOMElement()
    expect(status).toHaveClass('empty:hidden')
    expect(owner).toHaveTextContent('maya')
    // And a line of nothing but such values is gone with them.
    expect(line).toHaveClass('not-has-[>:not(:empty)]:hidden')
  })

  it('reads stacked values as secondary text, the size of a subtitle', () => {
    render(
      <ListRowActionsProvider view={view}>
        <table>
          <tbody>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <Table.Item>Ada</Table.Item>
              <Table.Item>Lisbon</Table.Item>
              <Table.Item>Running</Table.Item>
            </ListRow>
          </tbody>
        </table>
      </ListRowActionsProvider>,
    )
    const line = screen.getAllByRole('cell')[0]?.querySelector('[data-stacked-line]')
    expect(line).toHaveClass('text-xs')
  })

  it('adds nothing for a stacked cell with nothing in it', () => {
    render(
      <ListRowActionsProvider view={view}>
        <table>
          <tbody>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <Table.Item>Ada</Table.Item>
              <Table.Item>Lisbon</Table.Item>
              <Table.Item>{false}</Table.Item>
            </ListRow>
          </tbody>
        </table>
      </ListRowActionsProvider>,
    )
    expect(screen.getAllByRole('cell')[0]?.querySelector('[data-stacked]')).toBeNull()
  })

  it('leaves rows alone when nothing stacks', () => {
    render(
      <ListRowActionsProvider view={{ ...view, columnStacks: [false, false, false] }}>
        <table>
          <tbody>
            <ListRow href={null} items={[]} goTo={() => {}} openMenu={() => {}}>
              <Table.Item>Ada</Table.Item>
              <Table.Item>Lisbon</Table.Item>
              <Table.Item>Running</Table.Item>
            </ListRow>
          </tbody>
        </table>
      </ListRowActionsProvider>,
    )
    expect(screen.getAllByRole('cell')[0]?.querySelector('[data-stacked]')).toBeNull()
  })
})

describe('ListPage bleed', () => {
  it("reaches past the host's padding only when asked", () => {
    const { container, rerender } = render(<ListPage>rows</ListPage>)
    expect(container.firstElementChild).not.toHaveClass('-m-4')
    rerender(<ListPage bleed>rows</ListPage>)
    expect(container.firstElementChild).toHaveClass('-m-4')
  })
})

describe('ListError', () => {
  it("announces the failure and names what failed, never in the server's words", () => {
    render(<ListError error={new Error('upstream timed out')} noun="clusters" />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent("Couldn't load clusters")
    expect(alert).toHaveTextContent('Something went wrong. Try again in a moment.')
    expect(alert).not.toHaveTextContent('upstream timed out')
  })

  it("says what went wrong in the host's words, or the provider's", () => {
    const { unmount } = render(
      <ListError error={new Error('503')} noun="clusters" message="The service is down." />,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('The service is down.')
    unmount()
    render(
      <UIProvider strings={{ list: { couldNotLoadHint: 'Inténtalo de nuevo.' } }}>
        <ListError error={new Error('503')} />
      </UIProvider>,
    )
    expect(screen.getByRole('alert')).toHaveTextContent('Inténtalo de nuevo.')
  })

  it("falls back to the provider's noun", () => {
    render(<ListError error={null} />)
    expect(screen.getByRole('alert')).toHaveTextContent("Couldn't load data")
  })
})

type Host = { name: string; nodes: number; favorite: boolean }

const HOSTS: Host[] = [
  { name: 'beta', nodes: 1, favorite: false },
  { name: 'alpha', nodes: 3, favorite: true },
  { name: 'gamma', nodes: 2, favorite: false },
]

function SortableList({ favorites = false }: { favorites?: boolean }) {
  const view = useListView<Host>({
    storageKey: 'sortable-list',
    columns: [
      { key: 'name', label: 'Name', alwaysVisible: true, orderBy: 'name' },
      { key: 'nodes', label: 'Nodes', orderBy: 'nodes' },
      // Names an order the view doesn't offer, so it stays a plain title.
      { key: 'owner', label: 'Owner', orderBy: 'owner' },
    ],
    orderBys: [
      { value: 'name', label: 'Name', compare: (a, b) => a.name.localeCompare(b.name) },
      { value: 'nodes', label: 'Nodes', compare: (a, b) => a.nodes - b.nodes },
    ],
    ...(favorites && { isFavorite: (row: Host) => row.favorite }),
  })
  return (
    <>
      <ListDisplayMenu view={view} />
      <Table {...listTableProps}>
        <ListColumns view={view} />
        {view.applyOrder(HOSTS).map((row) => (
          <tr key={row.name}>
            <Table.Item>{row.name}</Table.Item>
            <Table.Item>{row.nodes}</Table.Item>
            <Table.Item />
          </tr>
        ))}
      </Table>
    </>
  )
}

// The name's header also holds the phone's sort menu, which jsdom doesn't hide, so it names
// the column first.
const header = (name: string) => screen.getByRole('columnheader', { name: new RegExp(`^${name}`) })
const names = () =>
  screen
    .getAllByRole('row')
    .slice(1)
    .map((row) => row.firstChild?.textContent)
const openDisplay = () => fireEvent.click(screen.getByRole('button', { name: 'Display options' }))

describe('ListColumns sorting', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  })

  it('marks the column the list orders by, and only sortable columns', () => {
    render(<SortableList />)
    expect(header('Name')).toHaveAttribute('aria-sort', 'ascending')
    expect(header('Nodes')).toHaveAttribute('aria-sort', 'none')
    expect(header('Owner')).not.toHaveAttribute('aria-sort')
    expect(within(header('Owner')).queryByRole('button')).toBeNull()
  })

  it('orders by an unsorted column ascending, then flips it, and Display options follows', () => {
    render(<SortableList />)
    fireEvent.click(within(header('Nodes')).getByRole('button'))
    expect(header('Nodes')).toHaveAttribute('aria-sort', 'ascending')
    expect(header('Name')).toHaveAttribute('aria-sort', 'none')
    expect(names()).toEqual(['beta', 'gamma', 'alpha'])

    fireEvent.click(within(header('Nodes')).getByRole('button'))
    expect(header('Nodes')).toHaveAttribute('aria-sort', 'descending')
    expect(names()).toEqual(['alpha', 'gamma', 'beta'])

    openDisplay()
    expect(screen.getByRole('combobox', { name: 'Ordering' })).toHaveTextContent('Nodes')
    expect(screen.getByRole('button', { name: 'Descending' })).toBeInTheDocument()
  })

  it('a third click flips it back rather than dropping the order', () => {
    render(<SortableList />)
    const nodes = () => within(header('Nodes')).getByRole('button')
    fireEvent.click(nodes())
    fireEvent.click(nodes())
    fireEvent.click(nodes())
    expect(header('Nodes')).toHaveAttribute('aria-sort', 'ascending')
  })

  it('follows Display options', async () => {
    render(<SortableList />)
    openDisplay()
    fireEvent.click(screen.getByRole('button', { name: 'Ascending' }))
    expect(header('Name')).toHaveAttribute('aria-sort', 'descending')
    expect(names()).toEqual(['gamma', 'beta', 'alpha'])

    fireEvent.click(screen.getByRole('combobox', { name: 'Ordering' }))
    const nodes = await screen.findByRole('option', { name: 'Nodes' })
    // Base UI commits a mouse click only when the press started on the option.
    fireEvent.pointerDown(nodes)
    fireEvent.click(nodes)
    await waitFor(() => expect(header('Nodes')).toHaveAttribute('aria-sort', 'descending'))
    expect(header('Name')).toHaveAttribute('aria-sort', 'none')
  })

  it('persists the order a header picks', () => {
    const { unmount } = render(<SortableList />)
    fireEvent.click(within(header('Nodes')).getByRole('button'))
    unmount()
    render(<SortableList />)
    expect(header('Nodes')).toHaveAttribute('aria-sort', 'ascending')
  })

  it('reads a saved order the list no longer offers as its default, in every control', async () => {
    window.localStorage.setItem('sortable-list:orderBy', JSON.stringify('renamed'))
    render(<SortableList favorites />)
    expect(screen.getByRole('button', { name: 'Default order, ascending' })).toBeInTheDocument()
    openDisplay()
    expect(screen.getByRole('combobox', { name: 'Ordering' })).toHaveTextContent('Default')
    // Nothing the viewer chose differs from the list's defaults, so there is nothing to reset.
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull()
  })

  it('reads a stale saved order as the default the host names', () => {
    window.localStorage.setItem('sortable-list:orderBy', JSON.stringify('owner'))
    render(<SortableList />)
    expect(header('Name')).toHaveAttribute('aria-sort', 'ascending')
    expect(names()).toEqual(['alpha', 'beta', 'gamma'])
    openDisplay()
    expect(screen.getByRole('combobox', { name: 'Ordering' })).toHaveTextContent('Name')
    expect(screen.queryByRole('button', { name: 'Reset' })).toBeNull()
  })

  it('shows no column as sorted under the built-in default order', () => {
    render(<SortableList favorites />)
    expect(header('Name')).toHaveAttribute('aria-sort', 'none')
    expect(header('Nodes')).toHaveAttribute('aria-sort', 'none')
    fireEvent.click(within(header('Name')).getByRole('button', { name: 'Name' }))
    expect(header('Name')).toHaveAttribute('aria-sort', 'ascending')
  })

  it('keeps the header row in view as the rows scroll', () => {
    render(<SortableList />)
    const thead = screen.getAllByRole('rowgroup')[0]
    expect(thead?.tagName).toBe('THEAD')
    expect(thead).toHaveClass('sticky', 'z-(--layer-sticky)')
    // Nothing else is pinned in the list's scroller, so it pins at the top.
    expect(thead).toHaveStyle({ top: '0px' })
  })
})

describe('ListColumns on a phone', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  })

  const sortMenu = () => screen.getByRole('button', { name: /^Sorted by/ })

  it('gives the name the rest of the row where the other columns stack under it', () => {
    render(<SortableList />)
    // Over any share a host's class gives it at wider widths.
    expect(header('Name')).toHaveClass('@max-[36rem]:w-auto!')
    expect(header('Nodes')).not.toHaveClass('@max-[36rem]:w-auto!')
  })

  it('gives the name the rest of the row at every width with every other column hidden', () => {
    window.localStorage.setItem('sortable-list:hiddenColumns', JSON.stringify(['nodes', 'owner']))
    render(<SortableList />)
    expect(screen.getAllByRole('columnheader')[0]).toHaveTextContent('Name')
    // As a row's name cell does: the header alone sizes a fixed-layout table.
    expect(header('Name')).toHaveClass('w-auto!')
    // Nothing gives way, so the name's header keeps its title rather than a sort menu.
    expect(screen.queryByRole('button', { name: /^Sorted by/ })).toBeNull()
  })

  it('says what the list is sorted by and which way in the name’s header', () => {
    render(<SortableList />)
    fireEvent.click(within(header('Nodes')).getByRole('button'))
    fireEvent.click(within(header('Nodes')).getByRole('button'))
    // Its own header gives way below the medium width; the name's then names the order.
    expect(header('Nodes')).toHaveClass('hidden', '@[36rem]:table-cell')
    expect(within(header('Name')).getByRole('button', { name: 'Name' })).toHaveClass(
      'hidden',
      '@[36rem]:inline-flex',
    )
    expect(sortMenu()).toHaveAccessibleName('Sorted by Nodes, descending')
    expect(sortMenu()).toHaveClass('@[36rem]:hidden')
    expect(header('Name')).toContainElement(sortMenu())
  })

  it('changes the order and its direction, and Display options follows', async () => {
    render(<SortableList />)
    fireEvent.click(sortMenu())
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Nodes' }))
    await waitFor(() => expect(header('Nodes')).toHaveAttribute('aria-sort', 'ascending'))
    expect(names()).toEqual(['beta', 'gamma', 'alpha'])

    fireEvent.click(sortMenu())
    const descending = await screen.findByRole('menuitemradio', { name: 'Descending' })
    expect(screen.getByRole('menuitemradio', { name: 'Nodes' })).toBeChecked()
    fireEvent.click(descending)
    await waitFor(() => expect(header('Nodes')).toHaveAttribute('aria-sort', 'descending'))
    expect(names()).toEqual(['alpha', 'gamma', 'beta'])
    expect(sortMenu()).toHaveAccessibleName('Sorted by Nodes, descending')

    openDisplay()
    expect(screen.getByRole('combobox', { name: 'Ordering' })).toHaveTextContent('Nodes')
  })

  it('names the built-in default order as a phrase of its own', () => {
    render(<SortableList favorites />)
    const menu = screen.getByRole('button', { name: 'Default order, ascending' })
    expect(menu).toHaveTextContent('Default')
  })

  it('takes the default order’s phrase from the host, not its label set into "Sorted by"', () => {
    render(
      <UIProvider
        strings={{
          list: {
            sortedBy: (order) => `Ordenado por ${order}`,
            orderDefault: 'Predeterminado',
            sortedByDefault: () => 'Orden predeterminado',
          },
        }}
      >
        <SortableList favorites />
      </UIProvider>,
    )
    expect(screen.getByRole('button', { name: 'Orden predeterminado' })).toHaveTextContent(
      'Orden predeterminado',
    )
  })
})

describe('ListColumns with headers off', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
  })

  it('collapses the header row when Display options turns headers off, keeping its cells', () => {
    render(<SortableList />)
    const thead = screen.getAllByRole('rowgroup')[0] as HTMLElement
    // The list's own thead class collapses the row once a cell carries the marker.
    expect(thead).toHaveClass('has-[.list-headers-off]:collapse')
    expect(thead.querySelector(`.${HEADERS_OFF}`)).toBeNull()

    openDisplay()
    fireEvent.click(screen.getByRole('switch', { name: 'Show column headers' }))
    // The columns' cells stay to size the columns; the actions header rides along.
    expect(thead.querySelectorAll(`th.${HEADERS_OFF}`)).toHaveLength(3)
  })
})

describe('ListSelectAllHeader', () => {
  const renderHeader = (selected: number, total: number, onToggle = () => {}) =>
    render(
      <Table>
        <ListSelectAllHeader selected={selected} total={total} onToggle={onToggle} />
      </Table>,
    )
  const box = () => screen.getByRole('checkbox', { name: 'Select all' })

  it('sits in the header row', () => {
    renderHeader(0, 3)
    expect(box().closest('thead')).not.toBeNull()
  })

  it('is clear with nothing selected, mixed with some, and ticked with all', () => {
    const { unmount } = renderHeader(0, 3)
    expect(box()).toHaveAttribute('aria-checked', 'false')
    unmount()
    const some = renderHeader(1, 3)
    expect(box()).toHaveAttribute('aria-checked', 'mixed')
    some.unmount()
    renderHeader(3, 3)
    expect(box()).toHaveAttribute('aria-checked', 'true')
  })

  it('toggles on press, and is off with no rows', () => {
    const onToggle = vi.fn()
    const { unmount } = renderHeader(1, 3, onToggle)
    fireEvent.click(box())
    expect(onToggle).toHaveBeenCalledOnce()
    unmount()
    renderHeader(0, 0)
    expect(box()).toHaveAttribute('aria-disabled', 'true')
  })
})
