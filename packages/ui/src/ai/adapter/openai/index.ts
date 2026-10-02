export {
  createOpenAICompatibleStream,
  type OpenAIStreamConfig,
} from './createOpenAIStream'
export {
  apiErrorMessage,
  errorMessageFromResponse,
  statusFallbackMessage,
} from './errors'
export {
  createOpenAIChatAdapter,
  type OpenAIChatAdapterOptions,
} from './openaiAdapter'
export {
  buildResponsesRequestBody,
  parseResponsesSSELine,
} from './responses'
export {
  type ParsedSSELine,
  parseSSELine,
  processSSEStream,
  type SSELineParser,
} from './sse'
export type {
  CompletionChunk,
  CompletionChunkChoice,
  CompletionMessage,
  CompletionRequest,
  ModelsWireResponse,
} from './wire'
