// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { UIProvider } from '../components/Provider'
import { Table } from '../components/Table'
import { memoryStorage } from '../test/storage'
import { GroupRow, ListColumns, ListGroup, ListPage } from './ListPage'
import { listTableProps } from './ListTable'
import { ListDisplayMenu } from './ListViewControls'
import { useListView } from './listView'

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
})

const CLUSTERS = [
  { key: 'west', name: 'gpu-west', queues: ['batch', 'debug'] },
  { key: 'east', name: 'cpu-east', queues: ['long'] },
]

function Queues({
  storageKey = 'queues',
  defaultCollapsed,
  onCollapsedChange,
}: {
  storageKey?: string
  defaultCollapsed?: boolean
  onCollapsedChange?: (key: string, collapsed: boolean) => void
}) {
  const view = useListView<unknown>({
    storageKey,
    columns: [
      { key: 'name', label: 'Name', alwaysVisible: true },
      { key: 'state', label: 'State' },
    ],
  })
  return (
    <UIProvider>
      <ListPage
        view={view}
        toolbar={<ListDisplayMenu view={view} />}
        total={3}
        count={{ noun: 'queue', nounPlural: 'queues' }}
      >
        <Table {...listTableProps}>
          <ListColumns view={view} />
          {CLUSTERS.map((cluster) => (
            <ListGroup
              key={cluster.key}
              groupKey={cluster.key}
              defaultCollapsed={defaultCollapsed}
              onCollapsedChange={(next) => onCollapsedChange?.(cluster.key, next)}
              header={
                <GroupRow
                  label={
                    <a href={`/clusters/${cluster.key}`} onClick={(e) => e.preventDefault()}>
                      {cluster.name}
                    </a>
                  }
                  count={cluster.queues.length}
                  trailing={<button type="button">Usage of {cluster.name}</button>}
                />
              }
            >
              {cluster.queues.map((queue) => (
                <tr key={queue}>
                  <Table.Item>{queue}</Table.Item>
                  <Table.Item>up</Table.Item>
                  <Table.Item />
                </tr>
              ))}
            </ListGroup>
          ))}
        </Table>
      </ListPage>
    </UIProvider>
  )
}

const toggle = (name: string) => screen.getByRole('button', { name })

describe('ListGroup', () => {
  it('collapses its rows from the chevron, a button that says what it controls', () => {
    render(<Queues />)
    const button = toggle('gpu-west')
    // A native button, so Enter and Space press it.
    expect(button.tagName).toBe('BUTTON')
    expect(button).toHaveAttribute('aria-expanded', 'true')
    const rows = document.getElementById(button.getAttribute('aria-controls') ?? '')
    expect(rows?.tagName).toBe('TBODY')
    expect(rows).toContainElement(screen.getByText('batch'))
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('batch')).toBeNull()
    // The body stays for aria-controls to name, hidden so nothing reads it.
    expect(rows).toBeInTheDocument()
    expect(rows).not.toBeVisible()
    // The other group keeps its rows.
    expect(screen.getByText('long')).toBeInTheDocument()
    fireEvent.click(button)
    expect(screen.getByText('batch')).toBeInTheDocument()
  })

  it('keeps the header a row of the table, with its count, while collapsed', () => {
    render(<Queues />)
    fireEvent.click(toggle('gpu-west'))
    const header = toggle('gpu-west').closest('tr')
    expect(header).toBeInTheDocument()
    expect(within(header as HTMLElement).getByText('2')).toBeInTheDocument()
    expect(screen.getAllByRole('row').map((row) => row.textContent)).toEqual([
      'NameStateActions',
      'gpu-west·2Usage of gpu-west',
      'cpu-east·1Usage of cpu-east',
      'longup',
    ])
  })

  it('toggles on a click anywhere on the header but its own links and buttons', () => {
    const changes: [string, boolean][] = []
    render(<Queues onCollapsedChange={(key, next) => changes.push([key, next])} />)
    const header = toggle('gpu-west').closest('tr') as HTMLElement
    fireEvent.click(within(header).getByText('2'))
    expect(toggle('gpu-west')).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(screen.getByRole('link', { name: 'gpu-west' }))
    fireEvent.click(screen.getByRole('button', { name: 'Usage of gpu-west' }))
    expect(toggle('gpu-west')).toHaveAttribute('aria-expanded', 'false')
    expect(changes).toEqual([['west', true]])
  })

  it('still counts every match under the rows while a group is collapsed', () => {
    render(<Queues />)
    fireEvent.click(toggle('gpu-west'))
    expect(screen.getByRole('status')).toHaveTextContent('3 queues')
  })

  it('remembers collapsed groups with the view, and ignores what it cannot read', () => {
    localStorage.setItem('queues:collapsedGroups', JSON.stringify({ gone: true, east: 'yes' }))
    const { unmount } = render(<Queues />)
    // A key with no group, and a value that is no choice, change nothing.
    expect(toggle('cpu-east')).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle('gpu-west'))
    unmount()
    expect(JSON.parse(localStorage.getItem('queues:collapsedGroups') ?? '')).toEqual({
      gone: true,
      west: true,
    })
    render(<Queues />)
    expect(toggle('gpu-west')).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('batch')).toBeNull()
  })

  it('reads stored state that is not a map as no choices', () => {
    localStorage.setItem('queues:collapsedGroups', JSON.stringify(['west']))
    render(<Queues />)
    expect(toggle('gpu-west')).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(toggle('gpu-west'))
    expect(toggle('gpu-west')).toHaveAttribute('aria-expanded', 'false')
  })

  it('starts collapsed by default, and remembers a group the reader opened', () => {
    const { unmount } = render(<Queues defaultCollapsed />)
    expect(toggle('gpu-west')).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle('gpu-west'))
    unmount()
    render(<Queues defaultCollapsed />)
    expect(toggle('gpu-west')).toHaveAttribute('aria-expanded', 'true')
    expect(toggle('cpu-east')).toHaveAttribute('aria-expanded', 'false')
  })

  it('collapses and expands every group from the Display menu', () => {
    render(<Queues />)
    fireEvent.click(screen.getByRole('button', { name: 'Display options' }))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Collapse all' }),
    )
    expect(toggle('gpu-west')).toHaveAttribute('aria-expanded', 'false')
    expect(toggle('cpu-east')).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Expand all' }))
    expect(toggle('gpu-west')).toHaveAttribute('aria-expanded', 'true')
    expect(toggle('cpu-east')).toHaveAttribute('aria-expanded', 'true')
  })

  it('follows the host while controlled', () => {
    function Controlled() {
      const [collapsed, setCollapsed] = useState(true)
      return (
        <Table>
          <Table.Header>Name</Table.Header>
          <ListGroup
            collapsed={collapsed}
            onCollapsedChange={setCollapsed}
            header={<GroupRow label="gpu-west" colSpan={1} />}
          >
            <tr>
              <Table.Item>batch</Table.Item>
            </tr>
          </ListGroup>
        </Table>
      )
    }
    render(<Controlled />)
    expect(screen.queryByText('batch')).toBeNull()
    fireEvent.click(toggle('gpu-west'))
    expect(screen.getByText('batch')).toBeInTheDocument()
  })

  it('works on its own outside a list view, from its own state', () => {
    render(
      <Table>
        <Table.Header>Name</Table.Header>
        <ListGroup header={<GroupRow label="gpu-west" colSpan={1} />}>
          <tr>
            <Table.Item>batch</Table.Item>
          </tr>
        </ListGroup>
      </Table>,
    )
    fireEvent.click(toggle('gpu-west'))
    expect(screen.queryByText('batch')).toBeNull()
  })
})

describe('Table bodies', () => {
  it('keeps rows in one body while no group collapses', () => {
    const { container } = render(
      <Table>
        <Table.Header>Name</Table.Header>
        <GroupRow label="gpu-west" colSpan={1} />
        <tr>
          <Table.Item>batch</Table.Item>
        </tr>
      </Table>,
    )
    expect(container.querySelectorAll('tbody')).toHaveLength(1)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('gives rows around a group a body each, with the table’s body class', () => {
    const { container } = render(
      <Table tbodyClassName="rows">
        <Table.Header>Name</Table.Header>
        <tr>
          <Table.Item>first</Table.Item>
        </tr>
        <ListGroup header={<GroupRow label="gpu-west" colSpan={1} />}>
          <tr>
            <Table.Item>batch</Table.Item>
          </tr>
        </ListGroup>
        <tr>
          <Table.Item>last</Table.Item>
        </tr>
      </Table>,
    )
    const bodies = Array.from(container.querySelectorAll('tbody'))
    expect(bodies.map((body) => body.textContent)).toEqual(['first', 'gpu-west', 'batch', 'last'])
    for (const body of bodies) {
      expect(body).toHaveClass('rows')
    }
  })
})
