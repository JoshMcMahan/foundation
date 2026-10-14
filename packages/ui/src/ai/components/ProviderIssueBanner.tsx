import { buttonClasses } from '../../components/buttonClasses'
import { Callout } from '../../components/Callout'
import { SettingsIcon } from '../../icons'
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
    <Callout
      tone="warning"
      size="sm"
      className="mx-4 mt-2"
      title={title}
      action={
        settingsHref && (
          <LinkComponent
            target={{ kind: 'external', href: settingsHref }}
            className={buttonClasses({ variant: 'outline', size: 'sm' })}
          >
            <SettingsIcon />
            {strings.modelPicker.manageProvider}
          </LinkComponent>
        )
      }
    >
      {issueDetail(t, issue)}
    </Callout>
  )
}
