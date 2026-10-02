import { WarningTriangleIcon } from '../../icons'
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
    <div className="mx-4 mt-2 flex items-start gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
      <WarningTriangleIcon className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-amber-700">
          {strings.blockedGroup.title.replace('{group}', provider.group)}
        </p>
        <p className="text-xs text-amber-600/80 mt-0.5">{strings.blockedGroup.message}</p>
      </div>
    </div>
  )
}
