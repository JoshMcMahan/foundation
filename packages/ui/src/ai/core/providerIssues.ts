import type { ChatModel, ProviderIssue } from '../types'

export function providerIssueFor(
  issues: ProviderIssue[],
  model: Pick<ChatModel, 'provider_name' | 'provider_owner'> | undefined,
): ProviderIssue | undefined {
  if (!model?.provider_name) {
    return undefined
  }
  return issues.find(
    (issue) =>
      issue.provider_name === model.provider_name &&
      (issue.provider_owner ?? '') === (model.provider_owner ?? ''),
  )
}
