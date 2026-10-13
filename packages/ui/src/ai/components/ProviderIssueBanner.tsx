import { SettingsIcon, WarningIcon } from '../../icons'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import { issueDetail, providerIssueFor } from '../core/providerIssues'
import { getProviderKeyFromModelId } from './ModelSelector'

/** Why the selected model can't answer, with a way to fix it for the
 *  provider's owner, who alone can change its key or endpoint. */
export default function ProviderIssueBanner() {
  const { strings, extraLinks, LinkComponent } = useChatConfig()
  const { models, providers, providerIssues, selectedProvider, currentUser } = useChat()

  const selectedModel = models.find((m) => m.id === selectedProvider)
  const issue = providerIssueFor(providerIssues, selectedModel)
  if (!selectedModel || !issue) {
    return null
  }

  const t = strings.providerIssue
  const title =
    issue.status === 'unauthorized'
      ? t.bannerKeyRejected(issue.provider)
      : t.bannerUnreachable(issue.provider)
  const providerKey = getProviderKeyFromModelId(selectedModel.id)
  const provider = providers.find((p) => `${p.user}:${p.name}` === providerKey)
  const settingsHref =
    provider?.user === currentUser.username
      ? extraLinks.providerSettings?.(provider.user, provider.name)
      : undefined

  return (
    <div className="mx-4 mt-2 flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
      <WarningIcon className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-700">{title}</p>
        <p className="text-xs text-amber-600/80 mt-0.5">{issueDetail(t, issue)}</p>
      </div>
      {settingsHref && (
        <LinkComponent
          target={{ kind: 'external', href: settingsHref }}
          className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-500/10"
        >
          <SettingsIcon className="h-3.5 w-3.5" />
          {strings.modelPicker.manageProvider}
        </LinkComponent>
      )}
    </div>
  )
}
