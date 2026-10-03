import cx from 'classnames'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckIcon, ChevronDownIcon, CloudIcon, CogIcon, RetryIcon, RobotIcon } from '../../icons'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import type { ChatModel, CspKind } from '../types'

/** The search field plus the list's max-h-80, so the flip decision matches
 *  what renders. */
const MAX_PANEL_HEIGHT_PX = 380

// Brand logos are trademarks, so the host supplies them; default is generic.
function CspIcon({ cspKind, className }: { cspKind: CspKind; className?: string }) {
  const { slots } = useChatConfig()

  const custom = slots.providerIcon?.(cspKind, className)
  if (custom) {
    return <>{custom}</>
  }
  return <CloudIcon className={cx('text-purple-500', className)} />
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

export default function ModelSelector({
  targetSession,
  variant = 'default',
}: {
  targetSession?: string | null | undefined
  /** 'bare' drops the border and the icon, for a toolbar that reads as text. */
  variant?: 'default' | 'bare'
}) {
  const bare = variant === 'bare'
  const {
    providers,
    models,
    unreachableSessions,
    selectedProvider,
    setSelectedProvider,
    isLoadingModels,
    hasLoadedModels,
    modelsError,
    refreshModels,
    currentUser,
  } = useChat()
  const { extraLinks, LinkComponent } = useChatConfig()

  const [isOpen, setIsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [dropdownPosition, setDropdownPosition] = useState({
    top: 0,
    bottom: 0,
    left: 0,
    width: 0,
    flipped: false,
  })
  const containerRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  const updateDropdownPosition = useCallback(() => {
    if (!buttonRef.current) {
      return
    }
    const rect = buttonRef.current.getBoundingClientRect()
    // Anchoring the panel's bottom above a low trigger lets it grow upward on
    // its own, with no height to measure first.
    const below = window.innerHeight - rect.bottom
    setDropdownPosition({
      top: rect.bottom + 4,
      bottom: window.innerHeight - rect.top + 4,
      left: rect.left,
      width: Math.max(rect.width, 320),
      flipped: below < MAX_PANEL_HEIGHT_PX && rect.top > below,
    })
  }, [])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!isOpen) {
      return
    }

    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node
      const clickedInsideButton = containerRef.current?.contains(target)
      const clickedInsideDropdown = dropdownRef.current?.contains(target)

      if (!clickedInsideButton && !clickedInsideDropdown) {
        setIsOpen(false)
      }
    }

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside)
    }, 0)

    return () => {
      clearTimeout(timeoutId)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }
    updateDropdownPosition()
    window.addEventListener('scroll', updateDropdownPosition, true)
    window.addEventListener('resize', updateDropdownPosition)
    return () => {
      window.removeEventListener('scroll', updateDropdownPosition, true)
      window.removeEventListener('resize', updateDropdownPosition)
    }
  }, [isOpen, updateDropdownPosition])

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  // Filter models based on search
  const filteredModels = useMemo(() => {
    if (!searchQuery.trim()) {
      return models
    }
    const query = searchQuery.toLowerCase()
    return models.filter(
      (model) =>
        getModelNameFromId(model.id).toLowerCase().includes(query) ||
        (model.provider || '').toLowerCase().includes(query) ||
        (model.name || '').toLowerCase().includes(query),
    )
  }, [models, searchQuery])

  // Group filtered models by provider
  const groupedModels = useMemo(() => groupModelsByProvider(filteredModels), [filteredModels])

  // Get selected model info for the trigger button
  const selectedModelInfo = models.find((m) => m.id === selectedProvider)
  const selectedModelName = selectedModelInfo ? getModelLabel(selectedModelInfo) : null
  const selectedProviderName = selectedModelInfo?.provider || null

  const handleSelect = (modelId: string) => {
    setSelectedProvider(modelId)
    setIsOpen(false)
    setSearchQuery('')
  }

  // Determine target session display state: "connecting" while loading, "offline" if not found
  const targetSessionDisplayName = targetSession?.split(':').pop()
  const targetSessionFound =
    targetSession && models.length > 0
      ? models.some((m) => m.id.startsWith(`session:${targetSession}/`))
      : false
  const targetSessionStatus: 'connecting' | 'offline' | null = targetSession
    ? isLoadingModels
      ? 'connecting'
      : hasLoadedModels && !targetSessionFound
        ? 'offline'
        : null
    : null

  // The placeholders share the trigger's box so swapping them in and out
  // never moves the toolbar.
  const boxClass = bare
    ? 'flex items-center gap-1 rounded-md px-1.5 py-0.5 max-w-[280px]'
    : 'flex items-center gap-2 px-3 h-8 rounded-lg min-w-[180px] max-w-[280px]'
  const textClass = bare ? 'text-[11px]' : 'text-sm'

  if (isLoadingModels && models.length === 0 && !targetSession) {
    return (
      <div ref={containerRef} className="relative">
        <div className={boxClass}>
          {!bare && <RobotIcon className="h-4 w-4 text-purple-500 flex-shrink-0 animate-pulse" />}
          <span className={cx(textClass, 'theme-muted-text')}>Loading models...</span>
        </div>
      </div>
    )
  }

  if (modelsError && models.length === 0) {
    return (
      <div ref={containerRef} className="relative">
        <div className={boxClass}>
          {!bare && <RobotIcon className="h-4 w-4 text-red-500 flex-shrink-0" />}
          <span className={cx(textClass, 'text-red-600')}>Failed to load models</span>
          <button
            type="button"
            onClick={() => refreshModels()}
            className={cx(
              'flex items-center gap-1 text-blue-600 hover:underline ml-1',
              bare ? 'text-[11px]' : 'text-xs',
            )}
          >
            <RetryIcon className="h-2.5 w-2.5" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  if (
    hasLoadedModels &&
    models.length === 0 &&
    !targetSessionStatus &&
    unreachableSessions.length === 0
  ) {
    return (
      <div ref={containerRef} className="relative">
        <div className={boxClass}>
          {!bare && <RobotIcon className="h-4 w-4 theme-muted-text flex-shrink-0" />}
          <span className={cx(textClass, 'theme-muted-text')}>No models available</span>
        </div>
      </div>
    )
  }

  // Determine trigger button text
  const triggerText = selectedModelName
    ? null // will render the model name block instead
    : targetSessionStatus === 'connecting'
      ? 'Connecting...'
      : models.length === 0 && isLoadingModels
        ? 'Loading models...'
        : 'Select a model'

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        disabled={models.length === 0 && !targetSessionStatus && unreachableSessions.length === 0}
        className={cx(
          boxClass,
          'transition-all cursor-pointer bg-transparent',
          'focus:outline-none',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          bare ? 'hover:theme-muted-panel' : 'border theme-border hover:theme-hover',
        )}
      >
        {!bare && (
          <RobotIcon
            className={cx(
              'h-4 w-4 flex-shrink-0',
              targetSessionStatus === 'connecting'
                ? 'text-amber-500 animate-pulse'
                : 'text-purple-500',
            )}
          />
        )}
        <div className="flex-1 min-w-0 text-left">
          {selectedModelName ? (
            <div className="flex items-baseline gap-1.5 min-w-0">
              <span
                title={selectedModelName}
                className={cx(
                  'truncate',
                  bare
                    ? 'text-[11px] theme-muted-text'
                    : 'text-sm font-medium text-(--theme-panel)',
                )}
              >
                {selectedModelName}
              </span>
              {selectedProviderName && (
                <span
                  title={selectedProviderName}
                  className={cx(
                    'theme-muted-text truncate flex-shrink-0 max-w-[45%]',
                    bare ? 'text-[10px]' : 'text-xs',
                  )}
                >
                  {selectedProviderName}
                </span>
              )}
            </div>
          ) : (
            <span
              className={cx(
                bare ? 'text-[11px]' : 'text-sm',
                targetSessionStatus === 'connecting' ? 'text-amber-600' : 'theme-muted-text',
              )}
            >
              {triggerText}
            </span>
          )}
        </div>
        <ChevronDownIcon
          className={cx(
            'h-3 w-3 theme-muted-text transition-transform flex-shrink-0',
            !bare && 'ml-auto',
            isOpen && 'rotate-180',
          )}
        />
      </button>

      {/* Dropdown - rendered via portal to avoid layout shift */}
      {isOpen &&
        mounted &&
        createPortal(
          <div
            ref={dropdownRef}
            role="none"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                setIsOpen(false)
                buttonRef.current?.focus()
              }
            }}
            style={{
              position: 'fixed',
              ...(dropdownPosition.flipped
                ? { bottom: dropdownPosition.bottom }
                : { top: dropdownPosition.top }),
              left: dropdownPosition.left,
              width: dropdownPosition.width,
              zIndex: 9999,
            }}
            className={cx(
              'theme-panel rounded-lg shadow-lg',
              'border theme-border',
              'overflow-hidden',
            )}
          >
            {/* Search Input */}
            <div className="p-2 border-b theme-border">
              <input
                ref={inputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search models..."
                className={cx(
                  'w-full px-3 py-2 text-sm rounded-md',
                  'theme-muted-panel',
                  'border theme-border',
                  'focus:outline-none focus:ring-2 focus:ring-blue-500',
                  'placeholder:theme-muted-text',
                )}
              />
            </div>

            {/* Models List */}
            <div className="max-h-80 overflow-y-auto">
              {/* Target session entry (connecting or offline) */}
              {targetSessionStatus && (
                <div>
                  <div className="px-3 py-1.5 bg-amber-500/5 sticky top-0">
                    <div className="flex items-center gap-2">
                      <CloudIcon className="h-3 w-3 text-amber-500" />
                      <span className="text-xs font-semibold text-amber-600 uppercase tracking-wide flex-1">
                        {targetSessionDisplayName}
                      </span>
                      <span
                        className={cx(
                          'text-[10px] px-1.5 py-0.5 rounded-full',
                          targetSessionStatus === 'connecting'
                            ? 'text-amber-600 bg-amber-500/10 animate-pulse'
                            : 'text-amber-500 bg-amber-500/10',
                        )}
                      >
                        {targetSessionStatus === 'connecting' ? 'Connecting...' : 'Not responding'}
                      </span>
                    </div>
                  </div>
                  <div className="px-4 py-2 flex items-center gap-2">
                    <span className="text-sm theme-muted-text italic">
                      {targetSessionStatus === 'connecting'
                        ? 'Loading session models...'
                        : 'Service not responding — ensure it is running on the remote host'}
                    </span>
                  </div>
                </div>
              )}
              {/* Other unreachable sessions from the API (not the target) */}
              {unreachableSessions
                .filter((s) => !targetSession || `${s.owner}:${s.name}` !== targetSession)
                .map((s) => (
                  <div key={`${s.owner}:${s.name}`}>
                    <div className="px-3 py-1.5 bg-amber-500/5 sticky top-0">
                      <div className="flex items-center gap-2">
                        <CloudIcon className="h-3 w-3 text-amber-500" />
                        <span className="text-xs font-semibold text-amber-600 uppercase tracking-wide flex-1">
                          {s.name}
                        </span>
                        <span className="text-[10px] text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                          Not responding
                        </span>
                      </div>
                    </div>
                    <div className="px-4 py-2 flex items-center gap-2">
                      <span className="text-sm theme-muted-text italic">
                        Service not responding — ensure it is running on the remote host
                      </span>
                    </div>
                  </div>
                ))}
              {groupedModels.size === 0 &&
              !targetSessionStatus &&
              unreachableSessions.length === 0 ? (
                <div className="p-4 text-center theme-muted-text text-sm">No models found</div>
              ) : (
                Array.from(groupedModels.entries()).map(([providerKey, providerModels]) => {
                  // Match provider info. Provider keys are always "owner:name"
                  // (session keys start with "session:" and won't match).
                  const providerInfo = providers.find((p) => `${p.user}:${p.name}` === providerKey)
                  const providerName =
                    providerModels[0]?.provider || providerInfo?.name || 'Unknown Provider'
                  const platform = providerInfo?.platformLabel
                  const platformSuffix =
                    providerInfo &&
                    platform &&
                    platform.toLowerCase() !== providerName.toLowerCase()
                      ? platform
                      : null
                  const isOwner = providerInfo?.user === currentUser.username
                  const settingsHref =
                    providerInfo && extraLinks.providerSettings
                      ? extraLinks.providerSettings(providerInfo.user, providerInfo.name)
                      : null

                  return (
                    <div key={providerKey}>
                      {/* Provider Header */}
                      <div className="px-3 py-1.5 theme-muted-panel sticky top-0">
                        <div className="flex items-center gap-2">
                          <CspIcon cspKind={providerInfo?.cspKind ?? 'other'} className="h-3 w-3" />
                          <span className="text-xs font-semibold theme-muted-text uppercase tracking-wide">
                            {providerName}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-xs theme-muted-text">
                            {platformSuffix ? `· ${platformSuffix}` : ''}
                          </span>
                          <span className="text-xs theme-muted-text">
                            ({providerModels.length})
                          </span>
                          {isOwner && settingsHref && (
                            <LinkComponent
                              target={{
                                kind: 'external',
                                href: settingsHref,
                              }}
                              onClick={(e) => e.stopPropagation()}
                              className="p-0.5 rounded hover:theme-hover theme-muted-text hover:text-blue-600 transition-colors"
                              title="Manage provider"
                            >
                              <CogIcon className="h-3 w-3" />
                            </LinkComponent>
                          )}
                        </div>
                      </div>

                      {/* Models */}
                      {providerModels.map((model) => {
                        const modelName = getModelLabel(model)
                        const isSelected = model.id === selectedProvider

                        return (
                          <button
                            key={model.id}
                            type="button"
                            onClick={() => handleSelect(model.id)}
                            className={cx(
                              'w-full flex items-center gap-3 px-4 py-2 text-left cursor-pointer',
                              'hover:bg-blue-500/5 transition-colors',
                              isSelected && 'bg-blue-500/10',
                            )}
                          >
                            <span
                              title={modelName}
                              className={cx(
                                'flex-1 min-w-0 text-sm truncate',
                                isSelected ? 'text-blue-600 font-medium' : '',
                              )}
                              style={
                                !isSelected
                                  ? {
                                      color: 'var(--theme-panel, #1f2937)',
                                    }
                                  : undefined
                              }
                            >
                              {modelName}
                            </span>
                            {isSelected && (
                              <CheckIcon className="h-3.5 w-3.5 text-blue-600 flex-shrink-0" />
                            )}
                          </button>
                        )
                      })}
                    </div>
                  )
                })
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
