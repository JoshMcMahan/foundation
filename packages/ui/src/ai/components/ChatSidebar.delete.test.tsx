// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { makeStaticAdapter, makeSummaries, StoryChat } from '../stories/harness'
import ChatSidebar from './ChatSidebar'

const storage = new Map<string, string>()
Object.defineProperty(window, 'localStorage', {
  configurable: true,
  value: {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => storage.set(k, String(v)),
    removeItem: (k: string) => storage.delete(k),
    clear: () => storage.clear(),
  },
})

// Today holds sessions 1 and 6; yesterday, this week, this month and older one each.
const summaries = () => makeSummaries({ count: 6, now: new Date().toISOString() })

const row = (n: number) =>
  screen.getByText(`Slurm sizing session ${n}`).closest('li') as HTMLElement
const moreButton = (n: number) => within(row(n)).getByRole('button', { name: 'More actions' })

async function deleteSession(n: number) {
  const more = moreButton(n)
  more.focus()
  fireEvent.click(more)
  fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
  const dialog = await screen.findByRole('alertdialog')
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  await waitFor(() => expect(screen.queryByText(`Slurm sizing session ${n}`)).toBeNull())
}

describe('ChatSidebar delete', () => {
  it('moves focus to the next conversation’s menu button', async () => {
    render(
      <StoryChat adapter={makeStaticAdapter({ summaries: summaries() })} conversationId={null}>
        <ChatSidebar />
      </StoryChat>,
    )
    await screen.findByText('Slurm sizing session 1')
    await deleteSession(1)
    await waitFor(() => expect(moreButton(6)).toHaveFocus())
  })

  it('moves focus into the next group when the deleted conversation was its group’s only one', async () => {
    render(
      <StoryChat adapter={makeStaticAdapter({ summaries: summaries() })} conversationId={null}>
        <ChatSidebar />
      </StoryChat>,
    )
    await screen.findByText('Slurm sizing session 2')
    await deleteSession(2)
    await waitFor(() => expect(moreButton(3)).toHaveFocus())
  })

  it('returns focus to where it was on Cancel after a right-click, not to the row’s button', async () => {
    render(
      <StoryChat adapter={makeStaticAdapter({ summaries: summaries() })} conversationId={null}>
        <ChatSidebar />
      </StoryChat>,
    )
    await screen.findByText('Slurm sizing session 1')
    const search = screen.getByPlaceholderText('Search conversations')
    search.focus()
    fireEvent.contextMenu(screen.getByText('Slurm sizing session 1'))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    await waitFor(() => expect(search).toHaveFocus())
  })
})
