import type {
  ChatModel,
  ProviderIssue,
  TokenUsage,
  ToolCall,
  ToolCallDelta,
  UnreachableSession,
} from '../../types'

// OpenAI chat-completions wire message. `attachment_ids` and
// `responses_output` are gateway extensions carried alongside the standard
// fields.
export interface CompletionMessage {
  role: string
  content?: unknown
  name?: string
  reasoning_content?: string
  responses_output?: unknown[] | null
  tool_call_id?: string
  tool_calls?: ToolCall[] | null
  attachment_ids?: string[] | null | undefined
}

export interface CompletionRequest {
  model: string
  messages: CompletionMessage[]
  stream?: boolean
  [key: string]: unknown
}

export interface CompletionChunkChoice {
  delta?: {
    content?: unknown
    reasoning_content?: string
    tool_calls?: ToolCallDelta[] | null
  }
  finish_reason?: string | null
  index?: number
}

export interface CompletionChunk {
  id: string
  model: string
  object?: string
  created?: number
  // Gateway extension: backend-generated message ID for persistence.
  messageId?: string
  choices?: CompletionChunkChoice[] | null
  usage?: TokenUsage
}

// OpenAI-compatible /v1/models response with gateway extensions.
export interface ModelsWireResponse {
  object: string
  data: ChatModel[] | null
  unreachable_sessions?: UnreachableSession[] | null
  provider_issues?: ProviderIssue[] | null
}
