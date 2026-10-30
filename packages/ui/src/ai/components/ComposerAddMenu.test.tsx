// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
    fireEvent.click(within(modal).getByRole('button', { name: 'Disable results' }))
    for (const toggle of within(modal).getAllByRole('switch')) {
      expect(toggle).not.toBeChecked()
    }
    expect(within(modal).getByRole('button', { name: 'Enable results' })).toBeInTheDocument()
    expect(JSON.parse(localStorage.getItem('aiChat.disabledTools.u-1') ?? '[]')).toHaveLength(
      matching.length,
    )
  })

  it('opens the modal straight from the + when many tools come without files', async () => {
    renderComposer({ tools: makeManyTools() })
    fireEvent.click(await screen.findByRole('button', { name: /^Tools$/ }))

    expect(await screen.findByRole('dialog', { name: 'Tools' })).toBeInTheDocument()
  })

  it('filters approval tools and only changes the matching tools', async () => {
    const tools = makeManyTools()
    const approvals = tools.filter((tool) => tool.asksFirst)
    renderComposer({ tools })
    fireEvent.click(await screen.findByRole('button', { name: /^Tools$/ }))
    const modal = await screen.findByRole('dialog', { name: 'Tools' })

    fireEvent.click(within(modal).getByRole('button', { name: 'Asks first' }))
    expect(within(modal).getAllByRole('switch')).toHaveLength(approvals.length)
    fireEvent.change(within(modal).getByRole('searchbox'), { target: { value: 'storage' } })
    expect(within(modal).getAllByRole('switch')).toHaveLength(2)
    fireEvent.click(within(modal).getByRole('button', { name: 'Disable results' }))
    expect(JSON.parse(localStorage.getItem('aiChat.disabledTools.u-1') ?? '[]')).toEqual([
      'create_storage',
      'destroy_storage',
    ])

    fireEvent.click(within(modal).getByRole('button', { name: 'Lookups' }))
    const lookup = within(modal).getByRole('switch', { name: 'List storage' })
    expect(lookup).toBeChecked()
    expect(lookup).toHaveAccessibleDescription('Names your buckets and disks')
    expect(within(modal).getByRole('status')).toHaveTextContent(
      `${tools.length - 2} of ${tools.length} enabled`,
    )
  })

  it('recovers from an empty search and resets filters when reopened', async () => {
    renderComposer({ tools: makeManyTools() })
    fireEvent.click(await screen.findByRole('button', { name: /^Tools$/ }))
    const modal = await screen.findByRole('dialog', { name: 'Tools' })
    const search = within(modal).getByRole('searchbox')

    await waitFor(() => expect(search).toHaveFocus())
    fireEvent.click(within(modal).getByRole('button', { name: 'Asks first' }))
    fireEvent.change(search, { target: { value: 'no-such-tool' } })
    expect(within(modal).getByText('No tools match')).toBeInTheDocument()
    expect(within(modal).queryByRole('button', { name: 'Disable results' })).toBeNull()
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(search).toHaveValue('')
    expect(within(modal).getAllByRole('switch')).toHaveLength(
      makeManyTools().filter((tool) => tool.asksFirst).length,
    )

    fireEvent.click(within(modal).getByRole('button', { name: 'Done' }))
    fireEvent.click(await screen.findByRole('button', { name: /^Tools$/ }))
    const reopened = await screen.findByRole('dialog', { name: 'Tools' })
    expect(within(reopened).getByRole('button', { name: 'All' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(within(reopened).getAllByRole('switch')).toHaveLength(makeManyTools().length)
  })

  it('leaves the provider’s tools out of a turn it does not run', async () => {
    renderComposer({ tools: makeTools(), attachments: true, agentTurn: true })

    fireEvent.click(await screen.findByRole('button', { name: 'Attach files' }))
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
