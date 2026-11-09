import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, screen, userEvent, waitFor, within } from 'storybook/test'
import { makeStaticAdapter, makeSummaries, StoryChat, StoryViewport } from '../stories/harness'
import ChatSidebar from './ChatSidebar'

const meta: Meta = {
  title: 'Chat/Sidebar',
  component: ChatSidebar,
  parameters: { layout: 'fullscreen' },
}

export default meta

export const Conversations: StoryObj<{
  count: number
  sharedEvery: number
}> = {
  args: { count: 12, sharedEvery: 4 },
  argTypes: {
    count: { control: { type: 'range', min: 0, max: 60 } },
    sharedEvery: {
      control: { type: 'range', min: 0, max: 10 },
      description: 'Every Nth conversation is shared-with-you (0 = none)',
    },
  },
  render: (args) => (
    <StoryChat
      adapter={makeStaticAdapter({ summaries: makeSummaries(args) })}
      conversationId="conv-1"
    >
      <StoryViewport>
        <ChatSidebar />
      </StoryViewport>
    </StoryChat>
  ),
}

export const Empty: StoryObj = {
  render: () => (
    <StoryChat
      adapter={makeStaticAdapter({ summaries: [], conversations: [] })}
      conversationId={null}
    >
      <StoryViewport>
        <ChatSidebar />
      </StoryViewport>
    </StoryChat>
  ),
}

// Attachments sit under New chat; the footer strip appears only when the host wires Manage providers.
export const FooterLinks: StoryObj = {
  render: () => (
    <StoryChat
      adapter={makeStaticAdapter({
        summaries: makeSummaries({ count: 6, sharedEvery: 0 }),
        attachments: true,
      })}
      config={{ extraLinks: { manageProviders: '#providers' } }}
      conversationId="conv-1"
    >
      <StoryViewport>
        <ChatSidebar />
      </StoryViewport>
    </StoryChat>
  ),
}

/** Deleting a conversation from its menu moves focus on to the next one's menu button, into
 *  the next group when it was the only one in its group. */
export const DeleteMovesFocus: StoryObj = {
  name: 'Delete, focus moves on',
  render: () => (
    <StoryChat
      adapter={makeStaticAdapter({
        summaries: makeSummaries({ count: 6, now: new Date().toISOString() }),
      })}
      conversationId="conv-1"
    >
      <StoryViewport>
        <ChatSidebar />
      </StoryViewport>
    </StoryChat>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const more = async (title: string) =>
      within((await canvas.findByText(title)).closest('li') as HTMLElement).getByRole('button', {
        name: 'More actions',
      })
    // The only conversation from yesterday.
    await userEvent.click(await more('Slurm sizing session 2'))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }))
    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(canvas.queryByText('Slurm sizing session 2')).toBeNull())
    const next = await more('Slurm sizing session 3')
    await waitFor(() => expect(next).toHaveFocus())
  },
}
