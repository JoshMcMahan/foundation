// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Table } from '../components/Table'
import { openTooltip } from '../test/tooltip'
import { ListRow, ListRowActionsProvider } from './ListPage'
import { NameCell } from './ListTable'
import type { ListViewChrome } from './listView'

function renderRow(disabled: boolean, onSelect: () => void) {
  return render(
    <table>
      <tbody>
        <ListRow
          href={null}
          items={[]}
          goTo={() => {}}
          openMenu={() => {}}
          pinnedActions={[
            {
              key: 'stop',
              label: 'Stop',
              icon: <span data-testid="stop-icon" />,
              onClick: onSelect,
              disabled,
            },
          ]}
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
    expect(stacked).toHaveClass('@[36rem]:hidden')
    // Its own cell gives way when narrow, like a medium-priority column.
    expect(cells[2]).toHaveTextContent('Running')
    expect(cells[2]).toHaveClass('hidden', '@[36rem]:table-cell')
    // A column that only drops (priority) isn't stacked.
    expect(cells[0]).not.toHaveTextContent('Lisbon')
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
