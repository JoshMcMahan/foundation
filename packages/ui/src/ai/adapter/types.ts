import type {
  Allocation,
  ApprovalPart,
  AttachmentRef,
  ChatModel,
  Conversation,
  ConversationSummary,
  ProviderInfo,
  ShareGroup,
  SharePermission,
  SharePermissionLevel,
  TodoItem,
  ToolCall,
  UnreachableSession,
} from '../types'
import type { CompletionMessage } from './openai/wire'

// Adapter methods throw ChatAdapterError with a user-facing message; the UI
// renders `message` directly.
export class ChatAdapterError extends Error {
  status?: number | undefined

  constructor(message: string, options?: { status?: number; cause?: unknown }) {
    super(message, options?.cause === undefined ? {} : { cause: options.cause })
    this.name = 'ChatAdapterError'
    this.status = options?.status
  }
}

export interface ModelsList {
  models: ChatModel[]
  unreachableSessions: UnreachableSession[]
}

export interface StreamRequest {
  model: string
  // Wire-shaped history including the new user turn, oldest first.
  messages: CompletionMessage[]
  conversationId: string
  parentMessageId?: string | null
  // Client-generated ID for the user turn so the backend can persist it.
  userMessageId: string
  allocation?: string | null
  // Use the OpenAI Responses API transport (models advertising
  // supports_responses); reasoning items replay across turns.
  useResponses?: boolean
}

export interface StreamHandlers {
  onContent: (content: string) => void
  onReasoning?: (reasoning: string) => void
  // Backend-assigned ID for the assistant message being streamed.
  onMessageId?: (messageId: string) => void
  // Agent-protocol adapters stream transcript parts progressively; the
  // OpenAI-compatible adapter never emits these.
  onPart?: (delta: PartDelta) => void
}

// Progressive events an agent adapter maps onto MessagePart timelines.
export type PartDelta =
  | {
      type: 'tool_start'
      id: string
      name: string
      args: string
      startLine?: number
    }
  | { type: 'tool_update'; id: string; args: string }
  | { type: 'tool_end'; id: string; result: string; isError?: boolean }
  | {
      type: 'subagent_start'
      id: string
      agentType?: string
      color?: string
      background?: boolean
      description?: string
    }
  | { type: 'subagent_action'; id: string; action: string }
  | {
      type: 'subagent_end'
      id: string
      ok: boolean
      summary?: string
      report?: string
    }
  | { type: 'approval_request'; approval: ApprovalPart }
  | { type: 'approval_resolved'; id: string; answer?: string }
  | { type: 'notice' | 'warning'; text: string }
  | { type: 'todo_snapshot'; todos: TodoItem[] }

export interface StreamResult {
  content: string
  messageId: string
  toolCalls: ToolCall[]
  finishReason: string | null
  model: string | null
  reasoning: string
  responsesOutput: unknown[]
}

// Aborting the signal must leave any partial content persisted server-side;
// the UI refetches the conversation shortly after cancelling to pick up the
// server-assigned message ID.
export type StreamCompletion = (
  req: StreamRequest,
  handlers: StreamHandlers,
  signal?: AbortSignal,
) => Promise<StreamResult>

export interface ConversationsAdapter {
  list(): Promise<ConversationSummary[]>
  get(id: string): Promise<Conversation>
  create(title?: string): Promise<ConversationSummary>
  rename(id: string, title: string): Promise<void>
  remove(id: string): Promise<void>
}

export interface ProvidersAdapter {
  list(): Promise<ProviderInfo[]>
}

export interface AttachmentPage {
  attachments: AttachmentRef[]
  total: number
  nextCursor?: string
  hasMore: boolean
}

export interface AttachmentsAdapter {
  list(opts: { limit: number; cursor?: string }): Promise<AttachmentPage>
  upload(file: File, conversationId?: string): Promise<AttachmentRef>
  remove(id: string): Promise<void>
  downloadUrl(id: string): string
  // When present, attachment tiles and message attachments become clickable
  // and route the click here (e.g. an in-app viewer). Downloads keep their
  // own affordances.
  onOpen?(attachment: AttachmentRef): void
}

export interface SharingAdapter {
  listPermissions(conversationId: string): Promise<SharePermission[]>
  listGroups(): Promise<ShareGroup[]>
  addPermission(
    conversationId: string,
    permission: Omit<SharePermission, 'id' | 'teamName'>,
  ): Promise<void>
  updatePermission(
    conversationId: string,
    permissionId: string,
    permission: SharePermissionLevel,
  ): Promise<void>
  removePermission(conversationId: string, permissionId: string): Promise<void>
}

export interface AllocationsAdapter {
  list(): Promise<Allocation[]>
}

// The backend boundary for the chat UI. Optional capability groups hide their
// corresponding UI affordances when absent.
export interface ChatAdapter {
  conversations: ConversationsAdapter
  models: { list(): Promise<ModelsList> }
  streamCompletion: StreamCompletion
  providers?: ProvidersAdapter
  attachments?: AttachmentsAdapter
  sharing?: SharingAdapter
  allocations?: AllocationsAdapter
}
