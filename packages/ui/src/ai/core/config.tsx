import {
  type ComponentType,
  createContext,
  type MouseEventHandler,
  type ReactNode,
  useContext,
} from 'react'
import type { Components } from 'streamdown'
import { type ChatStrings, defaultChatStrings } from '../strings'
import type {
  ApprovalAnswerValue,
  ChatLinkTarget,
  ChatMessage,
  CspKind,
  MessagePart,
  MessagePartKind,
} from '../types'

// What a part renderer receives; host overrides via slots.partRenderers get
// the same props as the built-ins.
export interface PartRendererProps {
  part: MessagePart
  message: ChatMessage
  isStreaming?: boolean
  onApprovalAnswer?: (id: string, answer: ApprovalAnswerValue) => void
}

export interface ChatLinkProps {
  target: ChatLinkTarget
  className?: string
  title?: string
  onClick?: MouseEventHandler
  children: ReactNode
}

function hrefFor(target: ChatLinkTarget): string {
  switch (target.kind) {
    case 'conversation':
      return `/chat/${target.id}`
    case 'attachments':
      return '/chat/attachments'
    case 'external':
      return target.href
  }
}

function DefaultLink({ target, className, title, onClick, children }: ChatLinkProps) {
  return (
    <a href={hrefFor(target)} className={className} title={title} onClick={onClick}>
      {children}
    </a>
  )
}

export interface ChatUIConfig {
  LinkComponent?: ComponentType<ChatLinkProps>
  // Absent links hide their UI affordances.
  extraLinks?: {
    connectTools?: string
    manageProviders?: string
    addProvider?: string
    providerSettings?: (owner: string, name: string) => string
  }
  slots?: {
    // Rendered under the composer next to the model selector, e.g. a usage meter.
    composerUsage?: ReactNode
    // Icon for cloud-platform provider kinds the package has no logo for.
    providerIcon?: (cspKind: CspKind, className?: string) => ReactNode
    // Per-kind overrides for agent-transcript part rendering; unlisted kinds
    // use the built-in renderers.
    partRenderers?: Partial<Record<MessagePartKind, ComponentType<PartRendererProps>>>
  }
  strings?: {
    [S in keyof ChatStrings]?: Partial<ChatStrings[S]>
  }
  // Per-tag overrides for rendered markdown (host wins per tag; the built-in
  // safe-link `a` override applies unless the host overrides `a` itself).
  markdownComponents?: Components
  suggestedPrompts?: string[]
}

export interface ResolvedChatConfig {
  LinkComponent: ComponentType<ChatLinkProps>
  extraLinks: NonNullable<ChatUIConfig['extraLinks']>
  slots: NonNullable<ChatUIConfig['slots']>
  strings: ChatStrings
  markdownComponents?: Components
  suggestedPrompts?: string[]
}

function resolveStrings(overrides?: ChatUIConfig['strings']): ChatStrings {
  const merged = {} as ChatStrings
  for (const key of Object.keys(defaultChatStrings) as (keyof ChatStrings)[]) {
    // biome-ignore lint/suspicious/noExplicitAny: per-group shallow merge over defaults, retyped by the return
    ;(merged as any)[key] = { ...defaultChatStrings[key], ...overrides?.[key] }
  }
  return merged
}

export function resolveChatConfig(config?: ChatUIConfig): ResolvedChatConfig {
  return {
    LinkComponent: config?.LinkComponent ?? DefaultLink,
    extraLinks: config?.extraLinks ?? {},
    slots: config?.slots ?? {},
    // resolveStrings iterates defaultChatStrings, so every group — including
    // ones added later like `queue` — merges without a per-group entry here.
    strings: resolveStrings(config?.strings),
    ...(config?.markdownComponents ? { markdownComponents: config.markdownComponents } : {}),
    ...(config?.suggestedPrompts ? { suggestedPrompts: config.suggestedPrompts } : {}),
  }
}

const ChatConfigContext = createContext<ResolvedChatConfig>(resolveChatConfig())

export const ChatConfigProvider = ChatConfigContext.Provider

export function useChatConfig(): ResolvedChatConfig {
  return useContext(ChatConfigContext)
}
