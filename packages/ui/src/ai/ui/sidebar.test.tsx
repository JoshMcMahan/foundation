// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import type { MenuAction, MenuEntry } from '../../components/MenuEntries'
import { hoverTooltip } from '../../test/tooltip'
import { SidebarRow, SidebarRowBody, useRowDialogs, useSessionMenu } from './sidebar'

const labels = (entries: MenuEntry[]) =>
  entries.map((e) => ('divider' in e ? '—' : (e as MenuAction).label))

describe('useSessionMenu', () => {
  const menu = () => renderHook(() => useSessionMenu()).result.current

  it('lists the actions it is given in one order, delete set apart', () => {
    const items = menu()({
      remove: { onClick: vi.fn() },
      download: { onClick: vi.fn() },
      rename: { onClick: vi.fn() },
      share: { onClick: vi.fn() },
    })
    expect(labels(items)).toEqual(['Rename', 'Share', 'Download', '—', 'Delete'])
    expect((items[4] as MenuAction).destructive).toBe(true)
  })

  it('leaves out what it is not given, and the divider with nothing above it', () => {
    expect(labels(menu()({ remove: { onClick: vi.fn() } }))).toEqual(['Delete'])
    expect(labels(menu()({ rename: { onClick: vi.fn() } }))).toEqual(['Rename'])
  })

  it('disables an action with the reason it is unavailable', () => {
    const [rename] = menu()({
      rename: { onClick: vi.fn(), disabledReason: 'Wait for the turn to end' },
    }) as MenuAction[]
    expect(rename?.disabled).toBe(true)
    expect(rename?.disabledReason).toBe('Wait for the turn to end')
  })

  it('shows the key that does the same beside an action', () => {
    const [remove] = menu()({ remove: { onClick: vi.fn(), shortcut: '⌫' } }) as MenuAction[]
    expect(remove?.shortcut).toBe('⌫')
  })
})

describe('SidebarRowBody', () => {
  it('shows the mark, title, time and the line under it', () => {
    render(
      <SidebarRowBody
        leading={<span data-testid="dot" />}
        title="Rate limit retries"
        time="11m"
        detail={<span>gpu-box</span>}
      />,
    )
    expect(screen.getByTestId('dot')).toBeInTheDocument()
    expect(screen.getByText('Rate limit retries')).toBeInTheDocument()
    expect(screen.getByText('11m')).toBeInTheDocument()
    expect(screen.getByText('gpu-box')).toBeInTheDocument()
  })

  it('shows a clipped title whole on hover', async () => {
    const name = 'Default title for sessions started from the composer'
    render(<SidebarRowBody title={name} time="11m" />)
    const title = screen.getByText(name)
    Object.defineProperty(title, 'scrollWidth', { configurable: true, value: 400 })
    Object.defineProperty(title, 'clientWidth', { configurable: true, value: 200 })
    expect(await hoverTooltip(title)).toHaveTextContent(name)
  })
})

describe('SidebarRow shortcuts', () => {
  function Row({ onDelete, onArchive }: { onDelete: () => void; onArchive: () => void }) {
    return (
      <ul>
        <SidebarRow
          selected={false}
          menuItems={[]}
          openMenu={vi.fn()}
          shortcuts={[
            { keys: ['Backspace', 'Delete'], onPress: onDelete },
            { keys: 'A', onPress: onArchive },
          ]}
        >
          <a href="#build">Build</a>
          <input aria-label="Name" />
        </SidebarRow>
      </ul>
    )
  }

  it('acts on the row a key is pressed in, given the row', () => {
    const onDelete = vi.fn()
    const onArchive = vi.fn()
    render(<Row onDelete={onDelete} onArchive={onArchive} />)
    const link = screen.getByRole('link', { name: 'Build' })
    fireEvent.keyDown(link, { key: 'Backspace' })
    fireEvent.keyDown(link, { key: 'Delete' })
    expect(onDelete).toHaveBeenCalledTimes(2)
    expect(onDelete).toHaveBeenCalledWith(screen.getByRole('listitem'))
    fireEvent.keyDown(screen.getByRole('button', { name: 'More actions' }), { key: 'a' })
    expect(onArchive).toHaveBeenCalledTimes(1)
  })

  it('ignores a key held down, one with a modifier, and one typed in a field', () => {
    const onDelete = vi.fn()
    const onArchive = vi.fn()
    render(<Row onDelete={onDelete} onArchive={onArchive} />)
    const link = screen.getByRole('link', { name: 'Build' })
    fireEvent.keyDown(link, { key: 'Backspace', repeat: true })
    fireEvent.keyDown(link, { key: 'Backspace', metaKey: true })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), { key: 'Backspace' })
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Name' }), { key: 'a' })
    expect(onDelete).not.toHaveBeenCalled()
    expect(onArchive).not.toHaveBeenCalled()
  })
})

describe('useRowDialogs delete', () => {
  function Tasks({ initial }: { initial: string[] }) {
    const [names, setNames] = useState(initial)
    const { requestDelete, dialogs } = useRowDialogs<string>({
      strings: {
        deleteTitle: 'Delete task?',
        deleteBody: (name) => `${name} goes for good.`,
        deleteAction: 'Delete',
        renameTitle: 'Rename task',
        renameLabel: 'Name',
        renamePlaceholder: '',
        renameAction: 'Save',
      },
      nameOf: (name) => name,
      onDelete: (name) => {
        setNames((all) => all.filter((other) => other !== name))
        return true
      },
      onRename: () => true,
    })
    return (
      <>
        <ul>
          {names.map((name) => (
            <SidebarRow
              key={name}
              selected={false}
              menuItems={(row) => [{ label: 'Delete', onClick: () => requestDelete(name, row) }]}
              openMenu={(_, items) => {
                const [remove] = items as (MenuAction & { onClick: () => void })[]
                remove?.onClick()
              }}
              shortcuts={[
                {
                  keys: 'Backspace',
                  onPress: (row) => requestDelete(name, row, { initialFocus: 'confirm' }),
                },
              ]}
            >
              <a href={`#${name}`}>{name}</a>
            </SidebarRow>
          ))}
        </ul>
        {dialogs}
      </>
    )
  }

  it('opens on Delete when a key asked, then moves focus on to the next row', async () => {
    render(<Tasks initial={['Build', 'Deploy']} />)
    const build = screen.getByRole('link', { name: 'Build' })
    build.focus()
    fireEvent.keyDown(build, { key: 'Backspace' })
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete task?' })
    const remove = within(dialog).getByRole('button', { name: 'Delete' })
    await waitFor(() => expect(remove).toHaveFocus())
    fireEvent.click(remove)
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    await waitFor(() => expect(screen.getByRole('link', { name: 'Deploy' })).toHaveFocus())
  })

  it('opens on Cancel when asked from the menu', async () => {
    render(<Tasks initial={['Build', 'Deploy']} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'More actions' })[0] as HTMLElement)
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete task?' })
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Cancel' })).toHaveFocus(),
    )
  })
})
