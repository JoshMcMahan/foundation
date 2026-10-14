import { Callout } from '../../components/Callout'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import { getProviderKeyFromModelId } from './ModelSelector'

export default function BlockedGroupBanner() {
  const { strings } = useChatConfig()
  const { providers, selectedProvider } = useChat()

  if (!selectedProvider) {
    return null
  }

  const providerKey = getProviderKeyFromModelId(selectedProvider)
  const provider = providers.find((p) => `${p.user}:${p.name}` === providerKey)
  if (!provider?.groupBlocked || !provider.group) {
    return null
  }

  return (
    <Callout
      tone="warning"
      size="sm"
      className="mx-4 mt-2"
      title={strings.blockedGroup.title(provider.group)}
    >
      {strings.blockedGroup.message}
    </Callout>
  )
}
