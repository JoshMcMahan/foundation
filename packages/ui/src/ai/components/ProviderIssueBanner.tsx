import { WarningTriangleIcon } from '../../icons'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import { providerIssueFor } from '../core/providerIssues'

export default function ProviderIssueBanner() {
  const { strings } = useChatConfig()
  const { models, providerIssues, selectedProvider } = useChat()

  const selectedModel = models.find((m) => m.id === selectedProvider)
  const issue = providerIssueFor(providerIssues, selectedModel)
  if (!issue) {
    return null
  }

  const title =
    issue.status === 'unauthorized'
      ? strings.providerIssue.bannerKeyRejected(issue.provider)
      : strings.providerIssue.bannerUnreachable(issue.provider)
  const detail =
    issue.message ||
    (issue.status === 'unauthorized'
      ? strings.providerIssue.keyRejectedHint
      : strings.providerIssue.unreachableHint)

  return (
    <div className="mx-4 mt-2 flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
      <WarningTriangleIcon className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-700">{title}</p>
        <p className="text-xs text-amber-600/80 mt-0.5">{detail}</p>
      </div>
    </div>
  )
}
