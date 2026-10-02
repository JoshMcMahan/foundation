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
  it('renders a button and exposes the sort direction', () => {
    const onClick = vi.fn()
    render(
      <Table>
        <Table.Header onClick={onClick} sort="descending">
          Name
        </Table.Header>
        <Table.Header onClick={onClick} sort="unsorted">
          Size
        </Table.Header>
        <Table.Header>Static</Table.Header>
      </Table>,
    )

    const name = screen.getByRole('columnheader', { name: 'Name' })
    expect(name).toHaveAttribute('aria-sort', 'descending')
    expect(screen.getByRole('columnheader', { name: 'Size' })).toHaveAttribute('aria-sort', 'none')
    expect(screen.getByRole('columnheader', { name: 'Static' })).not.toHaveAttribute('aria-sort')

    fireEvent.click(screen.getByRole('button', { name: 'Name' }))
    expect(onClick).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: 'Static' })).toBeNull()
  })
})
