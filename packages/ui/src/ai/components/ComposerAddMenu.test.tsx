// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { ChatToolOption } from '../adapter/types'
import { makeManyTools, makeStaticAdapter, makeTools, StoryChat } from '../stories/harness'
import { defaultChatStrings } from '../strings'
import ChatInput from './ChatInput'
import { ConnectToolsLink } from './ComposerChrome'

const ADD_FILES_PANEL = defaultChatStrings.attachmentUpload.addFiles
const CONNECT = { extraLinks: { connectTools: '#connect-tools' } }

function renderComposer(options: {
  tools?: ChatToolOption[]
  attachments?: boolean
  connect?: boolean
  agentTurn?: boolean
}) {
  const adapter = makeStaticAdapter({
    attachments: options.attachments ?? false,
    ...(options.tools ? { tools: options.tools } : {}),
  })
  render(
    <StoryChat adapter={adapter} {...(options.connect ? { config: CONNECT } : {})}>
      <ChatInput
        onSend={() => {}}
        conversationId="conv-tools"
        settingsLeft={<ConnectToolsLink />}
        {...(options.agentTurn ? { turn: { running: false, onStop: () => {} } } : {})}
      />
    </StoryChat>,
  )
}

async function openMenu(name: RegExp) {
  fireEvent.click(await screen.findByRole('button', { name }))
  return screen.findByRole('menu')
}

async function openToolsSubmenu(menu: HTMLElement) {
  const tools = within(menu).getByRole('menuitem', { name: /^Tools/ })
  tools.focus()
  fireEvent.keyDown(tools, { key: 'ArrowRight' })
  await screen.findAllByRole('menuitemcheckbox')
}

afterEach(() => {
  localStorage.clear()
})

describe('the composer + menu', () => {
  it('opens the attachments panel directly when the adapter lists no tools', async () => {
    renderComposer({ attachments: true, connect: true })
    const plus = await screen.findByRole('button', { name: 'Attach files' })

    expect(plus).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(plus)

    expect(plus).toHaveAttribute('aria-expanded', 'true')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Connect tools' })).toBeInTheDocument()
  })

  it('offers Add files and Tools, whose submenu has each tool on and the connect link', async () => {
    renderComposer({ attachments: true, tools: makeTools(), connect: true })
    const menu = await openMenu(/^Add files and tools$/)
    expect(within(menu).getByRole('menuitem', { name: 'Add files' })).toBeInTheDocument()

    await openToolsSubmenu(menu)
    const toggles = screen.getAllByRole('menuitemcheckbox')
    expect(toggles).toHaveLength(3)
    for (const toggle of toggles) {
      expect(toggle).toHaveAttribute('aria-checked', 'true')
    }
    expect(
      screen.getByRole('menuitemcheckbox', { name: /List storage/ }),
    ).toHaveAccessibleDescription('Names your buckets and disks')
    expect(screen.getByRole('menuitem', { name: 'Connect tools' })).toHaveAttribute(
      'href',
      '#connect-tools',
    )
    expect(screen.queryAllByRole('link', { name: 'Connect tools' })).toHaveLength(0)
  })

  it('opens the attachments panel from Add files', async () => {
    renderComposer({ attachments: true, tools: makeTools() })
    const menu = await openMenu(/^Add files and tools$/)

    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Add files' }))

    expect(await screen.findByText(ADD_FILES_PANEL)).toBeInTheDocument()
  })

  it('turns a tool off, keeps the menu open, remembers it and marks the +', async () => {
    renderComposer({ attachments: true, tools: makeTools() })
    await openToolsSubmenu(await openMenu(/^Add files and tools$/))

    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /List clusters/ }))

    expect(screen.getByRole('menuitemcheckbox', { name: /List clusters/ })).toHaveAttribute(
      'aria-checked',
      'false',
    )
    expect(
      screen.getByRole('button', {
        name: 'Add files and tools · Some tools are off',
        hidden: true,
      }),
    ).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('aiChat.disabledTools.u-1') ?? '[]')).toEqual([
      'list_clusters',
    ])
  })

  it('lists the tools in the menu itself when the adapter takes no files', async () => {
    renderComposer({ tools: makeTools() })
    const menu = await openMenu(/^Tools$/)

    expect(within(menu).queryByRole('menuitem', { name: 'Add files' })).not.toBeInTheDocument()
    expect(within(menu).getAllByRole('menuitemcheckbox')).toHaveLength(3)
  })

  it('lists many tools in a modal, searched and turned off together', async () => {
    renderComposer({ attachments: true, tools: makeManyTools() })
    const menu = await openMenu(/^Add files and tools$/)

    fireEvent.click(within(menu).getByRole('menuitem', { name: /^Tools/ }))
    const modal = await screen.findByRole('dialog', { name: 'Tools' })
    expect(within(modal).getAllByRole('switch')).toHaveLength(makeManyTools().length)

    fireEvent.change(within(modal).getByRole('searchbox', { name: 'Search tools' }), {
      target: { value: 'list' },
    })
    const matching = within(modal).getAllByRole('switch')
    expect(matching.length).toBeLessThan(makeManyTools().length)
    fireEvent.click(within(modal).getByRole('button', { name: 'Turn all off' }))
    for (const toggle of within(modal).getAllByRole('switch')) {
      expect(toggle).not.toBeChecked()
    }
    expect(within(modal).getByRole('button', { name: 'Turn all on' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('aiChat.disabledTools.u-1') ?? '[]')).toHaveLength(
      matching.length,
    )
  })

  it('opens the modal straight from the + when many tools come without files', async () => {
    renderComposer({ tools: makeManyTools() })
    fireEvent.click(await screen.findByRole('button', { name: /^Tools$/ }))

    expect(await screen.findByRole('dialog', { name: 'Tools' })).toBeInTheDocument()
  })

  it('leaves the provider’s tools out of a turn it does not run', async () => {
    renderComposer({ tools: makeTools(), attachments: true, agentTurn: true })

    fireEvent.click(await screen.findByRole('button', { name: 'Attach files' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
