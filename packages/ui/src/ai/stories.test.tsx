// @vitest-environment jsdom
// Portable-stories smoke test: every composed story must render. Stories are
// self-sufficient (they carry their own StoryChat provider wrapper), so no
// project annotations are needed; the few lines of jsdom setup are duplicated
// per package rather than shared through the workshop package — a package
// must never dev-depend on the workshop.
import '@testing-library/jest-dom/vitest'
import { composeStories } from '@storybook/react-vite'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as attachments from './components/AttachmentManager.stories'
import * as attachmentUpload from './components/AttachmentUpload.stories'
import * as agentParts from './components/agent/AgentMessageParts.stories'
import * as emptyState from './components/ChatEmptyState.stories'
import * as composer from './components/ChatInput.stories'
import * as layout from './components/ChatLayout.stories'
import * as messageList from './components/ChatMessageList.stories'
import * as sidebar from './components/ChatSidebar.stories'
import * as thread from './components/ChatThread.stories'
import * as shareDialog from './components/ShareDialog.stories'
import { useChatConfig } from './core/config'
import { StoryChat } from './stories/harness'
import * as conversationSidebar from './ui/ConversationSidebar.stories'
import * as notices from './ui/Notice.stories'

// jsdom lacks these; the thread relies on them for scroll plumbing.

const SUITES = {
  agentParts,
  attachments,
  attachmentUpload,
  thread,
  messageList,
  sidebar,
  composer,
  emptyState,
  shareDialog,
  notices,
  conversationSidebar,
  layout,
} as const

afterEach(cleanup)

it('keeps a composer draft when preview arguments change', () => {
  const { Toolbar } = composeStories(composer)
  const { rerender } = render(<Toolbar attachOpen={false} />)
  const input = screen.getByRole('textbox')
  fireEvent.change(input, { target: { value: 'Keep this draft' } })

  rerender(<Toolbar attachOpen />)

  expect(screen.getByRole('textbox')).toBe(input)
  expect(input).toHaveValue('Keep this draft')
})

function PreviewNavigationLink() {
  const { LinkComponent: Link } = useChatConfig()
  return <Link target={{ kind: 'conversation', id: 'conv-next' }}>Next conversation</Link>
}

it('keeps preview link focus and uses the current navigation callback', () => {
  const first = vi.fn()
  const next = vi.fn()
  const { rerender } = render(
    <StoryChat onNavigate={first}>
      <PreviewNavigationLink />
    </StoryChat>,
  )
  const link = screen.getByRole('link', { name: 'Next conversation' })
  link.focus()

  rerender(
    <StoryChat onNavigate={next}>
      <PreviewNavigationLink />
    </StoryChat>,
  )

  expect(screen.getByRole('link', { name: 'Next conversation' })).toBe(link)
  expect(link).toHaveFocus()
  fireEvent.click(link)
  expect(next).toHaveBeenCalledWith('conv-next')
  expect(first).not.toHaveBeenCalled()
})

for (const [name, mod] of Object.entries(SUITES)) {
  describe(`${name} stories`, () => {
    const stories = composeStories(mod)
    const entries = Object.entries(stories) as [string, React.ComponentType][]
    for (const [storyName, Story] of entries) {
      it(`renders ${storyName}`, () => {
        const { container } = render(<Story />)
        expect(container).toBeInTheDocument()
      })
    }
  })
}
