// The wire an agent session daemon serves, as far as the transcript reads it. A host
// that types its API from a spec asserts its types extend these.

export type SessionStatus = 'idle' | 'running' | 'awaiting_approval' | 'live_elsewhere'

export type SessionHistoryKind =
  | 'user'
  | 'assistant'
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'notice'
  | 'warning'
  | 'error'
  | 'plan_view'
  | 'goal_view'
  | 'goal_progress'
  | 'turn_end'
  | 'recap'
  | 'compaction'

export interface SessionPasteView {
  placeholder: string
  id: number
  lines: number
  bytes: number
  inline?: boolean
  text?: string
}

/** How a call that needed an answer was settled, as the daemon records it. */
export interface SessionToolDecision {
  callId: string
  by: 'user' | 'auto-reviewer'
  username?: string
  status: 'reviewing' | 'approved' | 'denied' | 'timed_out' | 'failed' | 'aborted'
  note?: string
  rationale?: string
  /** What was decided on, such as the command, in the decider's words. */
  action?: string
  at: string
  answers?: SessionAskAnswer[] | null
}

/** One question's answer: the options picked, the user's own words, and their notes on a question with previews. */
export interface SessionAskAnswer {
  question?: string
  picked?: string[] | null
  text?: string
  notes?: string
}

export interface SessionHistoryItem {
  kind: SessionHistoryKind
  text?: string
  turnId?: string
  toolName?: string
  toolArgs?: string
  callId?: string
  decision?: SessionToolDecision
  planBody?: string
  fromMain?: boolean
  pastes?: SessionPasteView[] | null
  images?: SessionImage[] | null
  turnEnd?: SessionTurnEnd
  /** On an EditFile call: the line its hunk begins on, as a live tool_start carries it. */
  startLine?: number
}

/** A preview of an image a message carried, base64-encoded; ref names the
 *  full-size image when the daemon can serve it, and originalMime and
 *  originalSize describe that image. */
export interface SessionImage {
  mime: string
  data: string
  ref?: string
  originalMime?: string
  originalSize?: number
}

/** An image the session saved, sent with the message that names its placeholder. */
export interface SessionImageRef {
  placeholder: string
  path: string
  mime: 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'
}

export interface SessionAskOption {
  label: string
  description?: string
  preview?: string
}

export interface SessionAskQuestion {
  question: string
  header?: string
  multiSelect?: boolean
  options?: SessionAskOption[] | null
}

export interface SessionApprovalRequest {
  id: string
  kind: 'confirm' | 'ask' | 'plan'
  createdAt: string
  agent?: string
  callId?: string
  tool?: string
  command?: string
  mode?: string
  plan?: string
  planPath?: string
  questions?: SessionAskQuestion[] | null
  reason?: string
  subagentId?: string
}

/** The settings a session reports on its state frames, as far as a
 *  transcript's host reads them back. */
export interface SessionState {
  name?: string
  autoName?: string
  claudeAccount?: string
  model: string
  /** The names to show in place of model IDs; an ID it leaves out has none. */
  modelNames?: Record<string, string>
  /** Empty for the model's own default. */
  effort?: string
  allocation?: string
  permissionMode?: string
  inputTokens?: number
  outputTokens?: number
  /** Pastes up to this size reach the model inline; unset from a daemon that
   *  cannot store pastes. */
  pasteInlineMaxBytes?: number
  goal?: SessionGoalStatus
  /** The directories open to the file tools besides the working directory. */
  addDirs?: string[] | null
  /** The session's directory in the git worktree it moved into; unset while it works where it launched. */
  worktree?: string
}

/** Where a session's /goal loop stands; unset when it has no goal. */
export interface SessionGoalStatus {
  active?: boolean
  paused?: boolean
  /** An evaluation is in flight, which spends tokens with no turn to show. */
  checking?: boolean
}

/** One step of a /goal loop, as the daemon files and announces it. */
export interface SessionGoalProgress {
  turns?: number
  condition?: string
  reason?: string
  outcome?: string
  err?: string
  /** Set when a usage limit stopped the check; the goal is checked again then. */
  resumeAt?: string
  elapsedMs?: number
  tokens?: number
}

/** The line a main-conversation turn ends with. */
export interface SessionTurnEnd {
  durationMs: number
  endedAt: string
  pendingAgents?: number
}

export interface SessionStreamEvent {
  seq: number
  type: string
  agentType?: string
  goalProgress?: SessionGoalProgress
  /** On the frame that ends a main-conversation turn nobody stopped. */
  turnEnd?: SessionTurnEnd
  approval?: SessionApprovalRequest
  approvalId?: string
  args?: string
  callId?: string
  decision?: SessionToolDecision
  background?: boolean
  color?: string
  content?: string
  id?: string
  /** On the error that ends a turn someone stopped. */
  interrupted?: boolean
  /** On a notice or warning the session's history also holds. */
  recorded?: boolean
  isError?: boolean
  name?: string
  newId?: string
  result?: string
  startLine?: number
  state?: SessionState
  turnId?: string
  pastes?: SessionPasteView[] | null
  images?: SessionImage[] | null
  /** On a usage_limit_wait that starts a wait: when the limit resets. */
  resumeAt?: string
  /** On subagent_delivered: the line the main conversation was handed. */
  notice?: string
}

export interface SessionDetail {
  status: SessionStatus
  history?: SessionHistoryItem[] | null
  approvals?: SessionApprovalRequest[] | null
  lastSeq?: number
  /** The turn in flight as of lastSeq, cleared with that turn's last frame. */
  turnId?: string
  /** When the running turn began; only the daemon knows for a turn that was
   *  already running when the session was opened. */
  turnStartedAt?: string
  /** The running turn is waiting for a usage limit to reset. */
  waitingForUsageLimit?: boolean
  /** When that usage limit resets. */
  usageLimitResumeAt?: string
  goal?: SessionGoalStatus
  addDirs?: string[] | null
}

/** The body the daemon accepts as the answer to an approval. */
export interface SessionApprovalAnswer {
  allowed?: boolean
  allowDir?: boolean
  denyMessage?: string
  /** One per question, its picks, text and notes only: a host may filter request bodies, and these fields are the ones it has to let through. */
  answers?: Pick<SessionAskAnswer, 'picked' | 'text' | 'notes'>[]
  chat?: boolean
}
