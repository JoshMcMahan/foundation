import type { ChatStrings } from '../strings'
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

type IssueStrings = ChatStrings['providerIssue']

/** A short name for what went wrong, such as beside the provider's heading. */
export function issueLabel(t: IssueStrings, issue: ProviderIssue): string {
  return issue.status === 'unauthorized' ? t.keyRejected : t.unreachable
}

/** What went wrong and what to do about it: the provider's own message when it sent one. */
export function issueDetail(t: IssueStrings, issue: ProviderIssue): string {
  return issue.message || (issue.status === 'unauthorized' ? t.keyRejectedHint : t.unreachableHint)
}
