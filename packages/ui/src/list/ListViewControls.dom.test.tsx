// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { memoryStorage } from '../test/storage'
import { ListDisplayMenu, ListFilterMenu } from './ListViewControls'
import { useListView } from './listView'

type Row = { owner: string }

function Harness() {
  const view = useListView<Row>({
    storageKey: 'facet-search',
    columns: [
      { key: 'name', label: 'Name', alwaysVisible: true },
      { key: 'owner', label: 'Owner' },
    ],
    facets: [
      {
        key: 'owner',
        label: 'Owner',
        searchable: true,
        options: ['alice', 'bob', 'carol'].map((owner) => ({ value: owner, label: owner })),
        matches: (row, values) => values.includes(row.owner),
      },
    ],
  })
  return (
    <>
      <ListFilterMenu view={view} />
      <ListDisplayMenu view={view} />
    </>
  )
}

const option = (name: string) => screen.queryByRole('menuitemcheckbox', { name })

function openOwnerFacet() {
  fireEvent.click(screen.getByRole('button', { name: 'Filter' }))
  fireEvent.click(screen.getByRole('menuitem', { name: 'Owner' }))
  return screen.getByRole('searchbox', { name: 'Search options…' })
}

beforeEach(() => {
  Object.defineProperty(window, 'localStorage', { value: memoryStorage(), configurable: true })
})

describe('the filter menu', () => {
  it('is a menu button', () => {
    render(<Harness />)
    const button = screen.getByRole('button', { name: 'Filter' })
    expect(button).toHaveAttribute('aria-haspopup', 'menu')
    fireEvent.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  it('opens on F', () => {
    render(<Harness />)
    fireEvent.keyDown(window, { key: 'f' })
    expect(screen.getByRole('menuitem', { name: 'Owner' })).toBeInTheDocument()
  })

  it('narrows a facet’s options by label', async () => {
    render(<Harness />)
    const box = openOwnerFacet()
    await waitFor(() => expect(box).toHaveFocus())
    fireEvent.change(box, { target: { value: 'CAR' } })
    expect(option('carol')).toBeInTheDocument()
    expect(option('alice')).toBeNull()
    expect(option('bob')).toBeNull()
  })

  it('toggles an option and stays open, keeping a checked one listed while typing', () => {
    render(<Harness />)
    const box = openOwnerFacet()
    fireEvent.click(option('alice') as HTMLElement)
    expect(option('alice')).toHaveAttribute('aria-checked', 'true')
    fireEvent.change(box, { target: { value: 'zzz' } })
    expect(option('alice')).toBeInTheDocument()
    expect(option('bob')).toBeNull()
  })

  it('says so when nothing matches', () => {
    render(<Harness />)
    fireEvent.change(openOwnerFacet(), { target: { value: 'zzz' } })
    expect(screen.getByText('No options found')).toBeInTheDocument()
    expect(screen.queryAllByRole('menuitemcheckbox')).toHaveLength(0)
  })

  it('counts active facets and clears a selection by unticking it', () => {
    render(<Harness />)
    openOwnerFacet()
    fireEvent.click(option('bob') as HTMLElement)
    expect(screen.getByRole('button', { name: 'Filter, 1 on' })).toBeInTheDocument()
    expect(screen.queryByRole('menuitem', { name: 'Clear' })).toBeNull()
    fireEvent.click(option('bob') as HTMLElement)
    expect(screen.getByRole('menuitem', { name: 'Owner' })).toBeInTheDocument()
  })
})

describe('the display panel', () => {
  it('opens a dialog named by its button', () => {
    render(<Harness />)
    const button = screen.getByRole('button', { name: 'Display options' })
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    fireEvent.click(button)
    expect(screen.getByRole('dialog', { name: 'Display options' })).toBeInTheDocument()
  })

  it('shows and hides a column from its pill', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Display options' }))
    const pill = screen.getByRole('button', { name: 'Owner' })
    expect(pill).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(pill)
    expect(pill).toHaveAttribute('aria-pressed', 'false')
  })
})
