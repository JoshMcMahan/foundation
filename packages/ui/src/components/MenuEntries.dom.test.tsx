// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ToolbarButton } from '../list/ActionToolbar'
import type { RowAction } from '../list/rowMenu'
import { useContextMenu } from './ContextMenu'
import type { MenuAction, MenuEntry } from './MenuEntries'

// tsc checks these: each `@ts-expect-error` fails the typecheck if its line compiles.
describe('the MenuAction type', () => {
  it('takes exactly one of onClick, href or copy', () => {
    const run = () => {}
    const actions: MenuAction[] = [
      { label: 'Rename', onClick: run },
      { label: 'Wrap lines', checked: true, onClick: run },
      { label: 'Docs', href: '/docs', reloadDocument: true },
      { label: 'Console', href: 'https://example.com/console', target: '_blank' },
      { label: 'Copy ID', copy: { text: 'c-1', label: 'ID' } },
      { label: 'Archive', disabled: true, disabledReason: 'Stop it first', onClick: run },
    ]
    expect(actions).toHaveLength(6)
  })

  it('rejects an action that does nothing or more than one thing', () => {
    const run = () => {}
    const when = Math.random() > 2
    const rejected = [
      // @ts-expect-error: onSelect is not a behavior; the row would do nothing.
      { label: 'Rename', onSelect: run } satisfies MenuAction,
      // @ts-expect-error: no behavior.
      { label: 'Rename' } satisfies MenuAction,
      // @ts-expect-error: disabled still needs the behavior it has once enabled.
      { label: 'Archive', disabled: true } satisfies MenuAction,
      // @ts-expect-error: a link or a handler, not both.
      { label: 'Docs', href: '/docs', onClick: run } satisfies MenuAction,
      // @ts-expect-error: a copy or a handler, not both.
      { label: 'Copy', copy: { text: 'c-1', label: 'ID' }, onClick: run } satisfies MenuAction,
      // @ts-expect-error: only a handler row can be an on/off choice.
      { label: 'Docs', href: '/docs', checked: true } satisfies MenuAction,
      // @ts-expect-error: only a link can reload the document.
      { label: 'Rename', onClick: run, reloadDocument: true } satisfies MenuAction,
      // @ts-expect-error: only a link can open a new tab.
      { label: 'Rename', onClick: run, target: '_blank' } satisfies MenuAction,
      // @ts-expect-error: only a link can open a new tab.
      { label: 'Copy', copy: { text: 'c-1', label: 'ID' }, target: '_blank' } satisfies MenuAction,
      // @ts-expect-error: a new tab, not another window's name.
      { label: 'Docs', href: '/docs', target: 'docs' } satisfies MenuAction,
      // @ts-expect-error: leave an action that can't run out instead.
      { label: 'Share', onClick: when ? run : undefined } satisfies MenuAction,
    ]
    expect(rejected).toHaveLength(11)
  })

  it('rejects a row action built elsewhere with no behavior', () => {
    // No excess-property check reaches an object built apart from the array,
    // so only a required behavior catches a handler under the wrong name.
    const legacy = { key: 'rename', label: 'Rename', onSelect: () => {} }
    // @ts-expect-error: legacy has no onClick, href or copy.
    const actions: RowAction[] = [legacy]
    expect(actions).toHaveLength(1)
  })
})

function Menu({ items }: { items: MenuEntry[] }) {
  const { openMenu, contextMenu } = useContextMenu()
  return (
    <>
      <button type="button" onClick={(e) => openMenu(e.currentTarget, items)}>
        Open
      </button>
      {contextMenu}
    </>
  )
}

describe('an action with no behavior', () => {
  // A JavaScript caller or a cast gets past the types; the warning catches it.
  const inert = (label: string) => ({ label }) as MenuAction

  it('warns once in a menu', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<Menu items={[inert('Rename'), { label: 'Delete', onClick: () => {} }]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    await screen.findByRole('menuitem', { name: 'Rename' })
    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    expect(warn).toHaveBeenCalledOnce()
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('"Rename" has no onClick, href or copy'),
    )
    warn.mockRestore()
  })

  it('warns on a toolbar button', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(<ToolbarButton action={{ key: 'stop', ...inert('Stop') }} />)
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"Stop" has no onClick'))
    warn.mockRestore()
  })
})
