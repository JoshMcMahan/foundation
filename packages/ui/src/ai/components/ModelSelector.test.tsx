// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { mockListLayout } from '../../test/layout'
import type { ChatAdapter } from '../adapter/types'
import { makeStaticAdapter, StoryChat } from '../stories/harness'
import ModelSelector from './ModelSelector'
import ProviderIssueBanner from './ProviderIssueBanner'

const PROVIDERS = [
  { id: 'p-1', name: 'gateway', user: 'alice', cspKind: 'openai', status: 'active' },
  { id: 'p-2', name: 'gateway', user: 'bob', cspKind: 'openai', status: 'active' },
  { id: 'p-3', name: 'pool', user: 'org', cspKind: 'other', status: 'active' },
] as const

async function openPicker(adapter: ChatAdapter, targetSession?: string) {
  render(
    <StoryChat adapter={adapter}>
      <ModelSelector targetSession={targetSession} />
    </StoryChat>,
  )
  const trigger = await screen.findByRole('combobox', { name: 'Model' })
  await vi.waitFor(() => expect(trigger).toBeEnabled())
  fireEvent.click(trigger)
  return screen.findByRole('listbox')
}

describe('ModelSelector', () => {
  // The list is virtual and draws no rows without a size.
  let restoreLayout: () => void
  beforeAll(() => {
    restoreLayout = mockListLayout()
  })
  afterAll(() => restoreLayout())

  it.each([
    ['lists providers', true],
    ['lists models only', false],
  ])(
    'names the owner of a provider shared with the reader when the adapter %s',
    async (_, listProviders) => {
      const list = await openPicker(makeStaticAdapter({ providers: [...PROVIDERS], listProviders }))
      expect(await within(list).findByText(/Shared by bob/)).toBeInTheDocument()
      expect(within(list).queryByText(/Shared by alice/)).not.toBeInTheDocument()
      expect(within(list).queryByText(/Shared by org/)).not.toBeInTheDocument()
    },
  )

  it('shows sessions that did not answer as headings with no models', async () => {
    const adapter = makeStaticAdapter({
      providers: [PROVIDERS[0]],
      unreachableSessions: [
        { name: 'gpu-box', owner: 'alice' },
        { name: 'build-01', owner: 'alice' },
      ],
    })
    const list = await openPicker(adapter, 'alice:gpu-box')
    expect(await within(list).findByText('gpu-box')).toBeInTheDocument()
    expect(within(list).getByText('build-01')).toBeInTheDocument()
    expect(within(list).getAllByText(/Not responding/)).toHaveLength(2)
    expect(within(list).getAllByRole('option')).toHaveLength(1)
  })

  it('disables a provider’s models while it has an issue', async () => {
    const adapter = makeStaticAdapter({
      providers: [PROVIDERS[0]],
      providerIssues: [
        {
          provider: 'gateway',
          provider_name: 'gateway',
          provider_owner: 'alice',
          status: 'unauthorized',
        },
      ],
    })
    const list = await openPicker(adapter)
    expect(await within(list).findByText(/API key rejected/)).toBeInTheDocument()
    expect(within(list).getByRole('option')).toHaveAttribute('aria-disabled', 'true')
  })
})

describe('ProviderIssueBanner', () => {
  const issue = {
    provider: 'gateway',
    provider_name: 'gateway',
    status: 'unauthorized',
  } as const

  it.each([
    ['links the provider’s settings for its owner', 'alice', true],
    ['offers no link to someone it was shared with', 'bob', false],
  ])('%s', async (_, owner, linked) => {
    const adapter = makeStaticAdapter({
      providers: [{ ...PROVIDERS[0], user: owner }],
      providerIssues: [{ ...issue, provider_owner: owner }],
    })
    render(
      <StoryChat
        adapter={adapter}
        config={{ extraLinks: { providerSettings: (o, name) => `/providers/${o}/${name}` } }}
      >
        <ProviderIssueBanner />
      </StoryChat>,
    )
    expect(await screen.findByText(/API key rejected/)).toBeInTheDocument()
    const link = screen.queryByRole('link', { name: 'Manage provider' })
    if (linked) {
      expect(link).toHaveAttribute('href', `/providers/${owner}/gateway`)
    } else {
      expect(link).not.toBeInTheDocument()
    }
  })
})
