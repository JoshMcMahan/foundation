// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
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
