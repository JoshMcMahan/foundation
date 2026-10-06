// Package-owned chat domain types. Adapters map backend responses into these
// shapes; no generated API client types cross the package boundary.

export interface ChatUser {
  id: string
  username: string
  name?: string
  avatarUrl?: string
}

export interface AttachmentRef {
  id: string
  filename: string
  contentType: string
  size: number
  uploadedAt: string
  conversationId?: string
  messageId?: string
}

// What the composer knows about the files it just uploaded, by attachment id,
// so a sent message can show them before the server echoes it back.
export type AttachmentMeta = Record<
  string,
  Pick<AttachmentRef, 'filename' | 'contentType' | 'size'>
>

export interface FunctionCall {
  name: string
  arguments: string
}

export interface ToolCall {
  function: FunctionCall
  id?: string
  index?: number
  type?: string
}

// Tool call delta for streaming (may have partial data)
export interface ToolCallDelta {
  index?: number
  id?: string
  type?: string
  function?: {
    name?: string
    arguments?: string
  }
}

export interface TokenUsage {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

// --- Agent transcript parts -------------------------------------------------
// An ordered timeline of what happened inside one message. Messages without
// `parts` render through the legacy flat-content path unchanged; adapters that
// speak an agent protocol populate parts.

export type ToolCallStatus = 'running' | 'ok' | 'error'

export interface TextPart {
  kind: 'text'
  text: string
}

export interface ReasoningPart {
  kind: 'reasoning'
  text: string
  durationMs?: number
}

export interface ToolCallPart {
  kind: 'tool_call'
  id: string
  name: string
  // Raw JSON string, exactly as the agent recorded it.
  args: string
  status: ToolCallStatus
  result?: string
  // First line of an EditFile diff, when the producer resolved it.
  startLine?: number
}

export type SubagentStatus = 'running' | 'done' | 'failed'

export interface SubagentPart {
  kind: 'subagent'
  id: string
  status: SubagentStatus
  agentType?: string
  color?: string
  background?: boolean
  description?: string
  actions?: string[]
  summary?: string
  // The report the child delivered, in full; summary is its first line.
  report?: string
}

export interface ApprovalOption {
  label: string
  description?: string
}

export type ApprovalAnswerValue =
  | {
      kind: 'confirm'
      allowed: boolean
      allowDir?: boolean
      denyMessage?: string
    }
  | { kind: 'ask'; text: string; chat?: boolean }

export interface ApprovalPart {
  kind: 'approval'
  id: string
  approvalKind: 'confirm' | 'ask' | 'plan'
  // confirm fields
  toolName?: string
  command?: string
  reason?: string
  agent?: string
  mode?: string
  // ask fields
  question?: string
  header?: string
  multiSelect?: boolean
  options?: ApprovalOption[]
  // plan fields: the finished plan body awaiting approval, as markdown.
  plan?: string
  // Set false by producers whose backend refuses standing directory grants.
  canAllowDirectory?: boolean
  resolved?: boolean
  // Display form of the chosen answer, once resolved.
  answer?: string
}

export interface NoticePart {
  kind: 'notice' | 'warning' | 'error'
  text: string
  // A longer body behind the line, shown on request.
  detail?: string
}

export type TodoStatus = 'pending' | 'in_progress' | 'completed'

export interface TodoItem {
  content: string
  status: TodoStatus
  activeForm?: string
}

export interface TodoSnapshotPart {
  kind: 'todo_snapshot'
  todos: TodoItem[]
}

export type MessagePart =
  | TextPart
  | ReasoningPart
  | ToolCallPart
  | SubagentPart
  | ApprovalPart
  | NoticePart
  | TodoSnapshotPart

export type MessagePartKind = MessagePart['kind']

// A user-role message that is really a recorded artifact (slash-command or
// shell block, compaction summary), not something the human typed.
export type PseudoUserKind = 'command-input' | 'shell-input' | 'compaction'

// Streaming and optimistically-created messages don't have all fields yet, so
// everything beyond the identity fields is optional.
/** A saved paste a user message names by its placeholder. The model got an
 *  inline paste as text; a larger one as its saved file. */
export interface MessagePaste {
  placeholder: string
  id: number
  lines: number
  bytes: number
  inline?: boolean | undefined
  text?: string | undefined
}

export interface ChatMessage {
  id: string
  role: string
  content?: string | null | undefined
  parentId?: string | null | undefined
  model?: string | null | undefined
  providerId?: string | null | undefined
  reasoning?: string | undefined
  reasoningDuration?: number | undefined
  responsesOutput?: unknown[] | null | undefined
  stopped?: boolean | undefined
  timestamp?: string | undefined
  tokensUsed?: TokenUsage | undefined
  toolCallId?: string | undefined
  toolCalls?: ToolCall[] | null | undefined
  attachments?: AttachmentRef[] | null | undefined
  author?: ChatUser | undefined
  conversationId?: string | undefined
  error?: string | null | undefined
  // Ordered agent-transcript timeline; when present it replaces the flat
  // content rendering. See MessagePart.
  parts?: MessagePart[] | null | undefined
  // Set by adapters (via classifyPseudoUserMessage) to hide recorded blocks
  // that arrive with role "user"; unset messages render normally.
  pseudo?: PseudoUserKind | null | undefined
  // Placeholders in content that stand for saved pastes.
  pastes?: MessagePaste[] | null | undefined
}

export interface Conversation {
  id: string
  messages: ChatMessage[]
  title?: string | null
  activeBranchId?: string | null
  branches?: string[] | null
  canCollaborate?: boolean
  createdAt?: string
  isOwner?: boolean
  updatedAt?: string | null
}

export interface ConversationSummary {
  id: string
  canCollaborate: boolean
  createdAt: string
  isOwner: boolean
  messageCount: number
  activeBranchId?: string
  preview?: string
  title?: string
  updatedAt?: string
}

// Model entries keep the OpenAI-compatible /v1/models wire field names so an
// OpenAI-compatible backend's response maps in without translation.
export interface ChatModel {
  id: string
  object: string
  created: number
  owned_by: string
  tool_calling_mode: 'native' | 'emulated' | 'none'
  name?: string
  provider?: string
  provider_name?: string
  provider_owner?: string
  provider_type?: string
  context_window?: number
  input_rate?: number
  output_rate?: number
  reasoning_efforts?: string[] | null
  supports_responses?: boolean
  supports_usage?: boolean
  usage_not_supported?: boolean
}

export interface UnreachableSession {
  name: string
  owner: string
}

// A connection the gateway reported as unable to serve inference. Field names
// follow the /v1/models wire extension; models match on provider_name +
// provider_owner (empty owner = organization connection).
export interface ProviderIssue {
  provider: string
  provider_name: string
  provider_owner?: string
  status: 'unauthorized' | 'unreachable'
  message?: string
}

export type CspKind = 'openai' | 'anthropic' | 'google' | 'azure' | 'aws' | 'other'

export interface ProviderInfo {
  id: string
  name: string
  displayName?: string
  // Owner username, or 'org' for organization-managed providers.
  user: string
  cspKind: CspKind
  // Human label for the hosting platform, e.g. "Azure AI Foundry".
  platformLabel?: string
  status: string
  group?: string
  groupBlocked?: boolean
}

export interface Allocation {
  name: string
  total: number
  used?: number
}

// Host-provided routing: the package never imports a router.
export interface ChatNavigation {
  toConversation(id: string): void
  toNewChat(): void
}

// Host-provided notifications (e.g. a toast system).
export interface ChatNotify {
  success(message: string): void
  error(message: string): void
  info(message: string): void
}

export type SharePermissionLevel = 'view' | 'collaborate'

export interface SharePermission {
  id?: string
  team?: string | null
  teamName?: string | null
  permission: SharePermissionLevel
  entireOrganization: boolean
}

export interface ShareGroup {
  id: string
  name: string
}

export type ChatLinkTarget =
  | { kind: 'conversation'; id: string }
  | { kind: 'attachments' }
  | { kind: 'external'; href: string }
