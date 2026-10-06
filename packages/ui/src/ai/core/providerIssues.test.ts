import type { ChatModel, ProviderIssue } from '../types'
import { providerIssueFor } from './providerIssues'

function model(overrides: Partial<ChatModel>): ChatModel {
  return {
    id: 'org:acme/model-a',
    object: 'model',
    created: 0,
    owned_by: 'acme',
    tool_calling_mode: 'native',
    ...overrides,
  }
}

const orgIssue: ProviderIssue = {
  provider: 'Acme',
  provider_name: 'acme',
  status: 'unauthorized',
}

const userIssue: ProviderIssue = {
  provider: 'Mine',
  provider_name: 'mine',
  provider_owner: 'tester',
  status: 'unreachable',
}

describe('providerIssueFor', () => {
  it('matches an organization connection by name with an empty owner', () => {
    expect(providerIssueFor([orgIssue, userIssue], model({ provider_name: 'acme' }))).toBe(orgIssue)
  })

  it('matches a user connection by name and owner', () => {
    expect(
      providerIssueFor(
        [orgIssue, userIssue],
        model({ provider_name: 'mine', provider_owner: 'tester' }),
      ),
    ).toBe(userIssue)
  })

  it('does not match the same name under a different owner', () => {
    expect(
      providerIssueFor(
        [userIssue],
        model({ provider_name: 'mine', provider_owner: 'someone-else' }),
      ),
    ).toBeUndefined()
  })

  it('ignores models without a provider name, like session models', () => {
    expect(providerIssueFor([orgIssue], model({}))).toBeUndefined()
    expect(providerIssueFor([orgIssue], undefined)).toBeUndefined()
  })
})
