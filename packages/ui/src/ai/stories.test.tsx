// @vitest-environment jsdom
// Portable-stories smoke test: every composed story must render. Stories are
// self-sufficient (they carry their own StoryChat provider wrapper), so no
// project annotations are needed; the few lines of jsdom setup are duplicated
// per package rather than shared through the workshop package — a package
// must never dev-depend on the workshop.
import '@testing-library/jest-dom/vitest'
import { composeStories } from '@storybook/react-vite'
import { cleanup, render } from '@testing-library/react'
import type React from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import * as agentParts from './components/agent/AgentMessageParts.stories'
import * as emptyState from './components/ChatEmptyState.stories'
import * as composer from './components/ChatInput.stories'
import * as messageList from './components/ChatMessageList.stories'
import * as sidebar from './components/ChatSidebar.stories'
import * as thread from './components/ChatThread.stories'
import * as shareDialog from './components/ShareDialog.stories'

// jsdom lacks these; the thread relies on them for scroll plumbing.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver
Element.prototype.scrollIntoView = () => {}

const SUITES = {
  agentParts,
  thread,
  messageList,
  sidebar,
  composer,
  emptyState,
  shareDialog,
} as const

afterEach(cleanup)

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
