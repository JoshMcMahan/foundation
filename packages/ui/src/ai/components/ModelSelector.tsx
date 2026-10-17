import { useMemo } from 'react'
import { Combobox, type ComboboxGroup } from '../../components/Combobox'
import { useStrings } from '../../components/Provider'
import { cx } from '../../cx'
import { ChevronDownIcon, CloudIcon, RetryIcon, WarningIcon } from '../../icons'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import { issueDetail, issueLabel, providerIssueFor } from '../core/providerIssues'
import type { ChatModel, CspKind, ProviderInfo } from '../types'
import { chipClassName } from '../ui/chip'

// ProviderInfo.user for a provider the organization manages rather than a user.
const ORG_OWNER = 'org'

/** Who registered a provider: the provider list's owner when the adapter
 *  lists providers, otherwise the owner each model carries. Empty means the
 *  organization, which is nobody to name. */
function providerOwner(info: ProviderInfo | undefined, model: ChatModel | undefined): string {
  if (info) {
    return info.user === ORG_OWNER ? '' : info.user
  }
  return model?.provider_owner ?? ''
}

// Brand logos are trademarks, so the host supplies them; default is generic.
function CspIcon({ cspKind, className }: { cspKind: CspKind; className?: string }) {
  const { slots } = useChatConfig()

  const custom = slots.providerIcon?.(cspKind, className)
  if (custom) {
    return <>{custom}</>
  }
  return <CloudIcon className={cx('theme-muted-text', className)} />
}

// Extract provider key from a model ID.
// Model IDs use the format "owner:provider-name/model-name"
// or "session:owner:session-name/model-name". The provider key is everything before the first "/".
export function getProviderKeyFromModelId(modelId: string): string {
  const idx = modelId.indexOf('/')
  return idx > 0 ? modelId.substring(0, idx) : modelId
}

// Extract the model name from a model ID (everything after the first "/").
function getModelNameFromId(modelId: string): string {
  const idx = modelId.indexOf('/')
  return idx > 0 ? modelId.substring(idx + 1) : modelId
}

function getModelLabel(model: ChatModel): string {
  const idName = getModelNameFromId(model.id)
  const name = model.name?.trim()
  // The gateway names models "<provider> (<model>)"; the picker shows the provider already.
  if (!name || name === `${model.provider} (${idName})`) {
    return idName
  }
  return name
}

// Group models by provider key (the portion before the first "/" in the model
// ID). Bare OpenAI-style IDs have no "/" — group those by provider label so a
// plain endpoint's models don't each become their own group.
function groupModelsByProvider(models: ChatModel[]): Map<string, ChatModel[]> {
  const groups = new Map<string, ChatModel[]>()

  for (const model of models) {
    const key = model.id.includes('/')
      ? getProviderKeyFromModelId(model.id)
      : (model.provider ?? model.owned_by)
    const group = groups.get(key)
    if (group) {
      group.push(model)
    } else {
      groups.set(key, [model])
    }
  }

  return groups
}

/** Picks the model a conversation runs on, grouped by provider. Sessions that
 *  are still connecting or not responding show as headings with their status,
 *  so the reader sees why their models are missing. */
export default function ModelSelector({
  targetSession,
}: {
  /** A session, as "owner:name", whose models the reader is waiting for. */
  targetSession?: string | null | undefined
}) {
  const {
    providers,
    models,
    unreachableSessions,
    providerIssues,
    selectedProvider,
    setSelectedProvider,
    isLoadingModels,
    hasLoadedModels,
    modelsError,
    refreshModels,
    currentUser,
  } = useChat()
  const { strings } = useChatConfig()
  const { common } = useStrings()
  const t = strings.modelPicker

  const targetSessionFound =
    !!targetSession && models.some((m) => m.id.startsWith(`session:${targetSession}/`))
  const targetSessionStatus: 'connecting' | 'offline' | null = !targetSession
    ? null
    : isLoadingModels
      ? 'connecting'
      : hasLoadedModels && !targetSessionFound
        ? 'offline'
        : null

  const groups = useMemo(() => {
    const status = (label: string, description: string): ComboboxGroup => ({
      label,
      icon: <CloudIcon className="h-3 w-3 text-(--theme-warning)" />,
      description,
      items: [],
    })
    const sessions: ComboboxGroup[] = unreachableSessions
      .filter((s) => `${s.owner}:${s.name}` !== targetSession)
      .map((s) => status(s.name, t.notResponding))
    if (targetSession && targetSessionStatus) {
      sessions.unshift(
        status(
          targetSession.split(':').pop() ?? targetSession,
          targetSessionStatus === 'connecting' ? t.connecting : t.notResponding,
        ),
      )
    }
    const byProvider = [...groupModelsByProvider(models)].map(
      ([providerKey, providerModels]): ComboboxGroup => {
        // Provider keys are "owner:name"; session keys start with "session:" and match none.
        const info = providers.find((p) => `${p.user}:${p.name}` === providerKey)
        const first = providerModels[0]
        const name = first?.provider || info?.name || providerKey
        const platform = info?.platformLabel
        // A provider shared with the reader can carry the same name as one of
        // their own; the owner tells the two apart.
        const owner = providerOwner(info, first)
        const issue = providerIssueFor(providerIssues, first)
        const description = [
          platform && platform.toLowerCase() !== name.toLowerCase() ? platform : null,
          owner && owner !== currentUser.username ? t.sharedBy(owner) : null,
          issue ? issueLabel(strings.providerIssue, issue) : null,
        ]
          .filter(Boolean)
          .join(' · ')
        return {
          label: name,
          icon: <CspIcon cspKind={info?.cspKind ?? 'other'} className="h-3 w-3" />,
          description: description || undefined,
          items: providerModels.map((model) => ({
            label: getModelLabel(model),
            value: model.id,
            disabled: !!issue,
          })),
        }
      },
    )
    return [...sessions, ...byProvider]
  }, [
    models,
    providers,
    providerIssues,
    unreachableSessions,
    targetSession,
    targetSessionStatus,
    currentUser.username,
    strings.providerIssue,
    t,
  ])

  if (isLoadingModels && models.length === 0 && !targetSession) {
    return <span className={cx(chipClassName, 'cursor-default animate-pulse')}>{t.loading}</span>
  }
  if (modelsError && models.length === 0) {
    return (
      <span className={cx(chipClassName, 'cursor-default text-(--theme-error-text)')}>
        {t.failed}
        <button
          type="button"
          onClick={() => refreshModels()}
          className="flex items-center gap-1 text-xs text-(--theme-accent) hover:underline"
        >
          <RetryIcon className="h-2.5 w-2.5" />
          {common.retry}
        </button>
      </span>
    )
  }
  if (groups.length === 0 && hasLoadedModels) {
    return <span className={cx(chipClassName, 'cursor-default')}>{t.none}</span>
  }

  const selected = models.find((m) => m.id === selectedProvider)
  const issue = providerIssueFor(providerIssues, selected)
  return (
    <Combobox<string>
      aria-label={t.choose}
      placeholder={t.search}
      items={groups}
      value={selectedProvider}
      onValueChange={(id) => id && setSelectedProvider(id)}
      disabled={groups.length === 0}
      triggerTooltip={
        issue
          ? `${issueLabel(strings.providerIssue, issue)} \u2014 ${issueDetail(strings.providerIssue, issue)}`
          : undefined
      }
      trigger={
        <button type="button" className={chipClassName}>
          {selected ? (
            <>
              <span className="truncate font-medium theme-text">{getModelLabel(selected)}</span>
              {selected.provider && (
                <span className="hidden max-w-[45%] shrink-0 truncate text-xs @md:inline">
                  {selected.provider}
                </span>
              )}
              {issue && <WarningIcon className="h-3.5 w-3.5 shrink-0 text-(--theme-warning)" />}
            </>
          ) : (
            <span
              className={cx('truncate', targetSessionStatus === 'connecting' && 'animate-pulse')}
            >
              {targetSessionStatus === 'connecting' ? t.connecting : t.select}
            </span>
          )}
          <ChevronDownIcon className="h-3 w-3 shrink-0" />
        </button>
      }
    />
  )
}
