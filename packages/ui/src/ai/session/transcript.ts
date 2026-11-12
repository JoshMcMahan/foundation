// Maps what an agent session daemon serves, its replayed history and its live event
// stream, onto chat messages and parts. Pure: the host owns the socket and the
// fetch, and useSessionTranscript holds the React state these reduce into.

import { DateTime } from 'luxon'
import { classifyPseudoUserMessage } from '../agent/classifier'
import { resultFailed } from '../agent/toolfmt'
import {
  askQuestionsFromArgs,
  firstNonEmptyLine,
  hiddenTranscriptTool,
  INTERRUPTED_NOTICE,
  interruptionNotice,
  parseSubagentNotice,
  planFromArgs,
  type SubagentNotice,
  subagentDeliveryLine,
  taskCallFromArgs,
} from '../agent/transcript'
import { applyPartDelta, finalizeParts } from '../core/parts'
import type {
  ApprovalAnswerValue,
  ApprovalPart,
  ApprovalQuestion,
  ApprovalQuestionAnswer,
  ApprovalSubject,
  AttachmentRef,
  ChatMessage,
  CommandAnswer,
  MessagePart,
  MessagePaste,
  TodoItem,
  ToolDecision,
} from '../types'
import type {
  SessionApprovalAnswer,
  SessionApprovalRequest,
  SessionAskQuestion,
  SessionDetail,
  SessionGoalProgress,
  SessionGoalStatus,
  SessionHistoryItem,
  SessionImage,
  SessionState,
  SessionStatus,
  SessionStreamEvent,
  SessionToolDecision,
  SessionTurnEnd,
} from './types'

export interface TranscriptState {
  messages: ChatMessage[]
  streaming: ChatMessage | null
  cursor: number
  // Until a turn is seen to end, the fetched status is the only word on liveness.
  turnEnded: boolean
  // Own messages the daemon holds as turns of their own; each joins the
  // transcript when the turn it runs as starts.
  queued: ChatMessage[]
  // Own messages steered into the running turn that the model has not been
  // handed yet.
  steered: ChatMessage[]
  // Steered messages the model has been handed; they join the transcript where
  // it next speaks, so the reply in flight is not split mid-sentence.
  notes: ChatMessage[]
  // When the running turn began: the fetch's word for a turn already in flight,
  // otherwise the frame that opened it. Null while nothing runs or nobody knows.
  turnStartedAt: string | null
  // The running turn is sending nothing until a usage limit resets.
  waitingForUsageLimit?: boolean
  // When it resets, if the daemon said.
  usageLimitResumeAt?: string | null
  // The feed position the fetch reported; frames at or before it happened
  // before this transcript was loaded.
  seededSeq?: number
  // A recorded terminal part may precede its closing frame in the feed.
  seededTerminal?: { part: MessagePart; turnId: string } | null
  // When the model step under way began: the turn opening, a call ending, or
  // the last thought ending. A thought is timed from there, as the terminal does.
  stepStartedAt?: string | null
  // When the thought streaming now began, until something else arrives.
  thoughtStartedAt?: string | null
  // Calls the auto-reviewer is deciding on, by who asked: '' for the main
  // conversation, otherwise the subagent's id.
  reviews?: Record<string, string[]>
  // Calls it has decided on lately: a review's start can reach the page after its verdict.
  decided?: string[]
  // The feed position of the last frame this transcript saw end a main turn
  // with its line; a turn that ended before it was loaded leaves it unset.
  turnEndSeq?: number
}

export type StreamEffect =
  | { type: 'refetch' }
  | { type: 'cleared'; newId: string }
  | { type: 'state'; state: SessionState }
  | { type: 'notice'; text: string; warn: boolean }

const MAIN_SESSION_AUTHOR = { id: 'main', username: 'main session' }

/** Where the host serves the full-size image a preview's ref names. */
export type ImageUrl = (ref: string) => string

let synthCounter = 0
function synthId(prefix: string): string {
  synthCounter += 1
  return `${prefix}-${synthCounter}`
}

function userMessage(
  text: string,
  fromMain: boolean,
  id?: string,
  pastes?: MessagePaste[] | null,
  images?: SessionImage[] | null,
  imageUrl?: ImageUrl,
): ChatMessage {
  const pseudo = classifyPseudoUserMessage('user', text)
  const attachments = imageAttachments(images, imageUrl)
  return {
    id: id ?? synthId('u'),
    role: 'user',
    content: text,
    ...(pseudo ? { pseudo } : {}),
    ...(fromMain ? { author: MAIN_SESSION_AUTHOR } : {}),
    ...(pastes?.length ? { pastes } : {}),
    ...(attachments.length ? { attachments } : {}),
  }
}

/** The daemon sends a preview of each image inline; one whose original it
 *  names opens at full size from the host, any other from its preview. */
function imageAttachments(images?: SessionImage[] | null, imageUrl?: ImageUrl): AttachmentRef[] {
  return (images ?? [])
    .filter((image) => image.mime.startsWith('image/'))
    .map((image) => {
      const preview = `data:${image.mime};base64,${image.data}`
      const previewSize =
        Math.floor((image.data.length * 3) / 4) - (image.data.match(/=*$/)?.[0].length ?? 0)
      const original = image.ref && imageUrl ? imageUrl(image.ref) : undefined
      return {
        id: original ?? preview,
        previewUrl: preview,
        filename: '',
        contentType: (original && image.originalMime) || image.mime,
        size: original ? (image.originalSize ?? 0) : previewSize,
        uploadedAt: '',
      }
    })
}

function assistantMessage(parts: MessagePart[] = [], id?: string): ChatMessage {
  return { id: id ?? synthId('a'), role: 'assistant', parts }
}

// The output is last and can itself contain the closing tag, so it runs to the final one.
const SHELL_RECORD =
  /^<shell-input>([\s\S]*?)<\/shell-input>\s*<shell-stdout>([\s\S]*)<\/shell-stdout>\s*$/

/** A `!` command and what it printed, from the user message the daemon records them as. */
function parseShellRecord(text: string): { command: string; output: string } | null {
  const match = SHELL_RECORD.exec(text.trim())
  if (!match) {
    return null
  }
  return { command: (match[1] ?? '').trim(), output: match[2] ?? '' }
}

function fenced(text: string): string {
  const longest = (text.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0)
  const fence = '`'.repeat(Math.max(3, longest + 1))
  return `${fence}\n${text}\n${fence}`
}

/** A `!` run as the terminal shows it: the command, then its output. */
function shellRunPart(command: string, output: string): MessagePart {
  // Only blank lines go from the front: the first line's indentation is output.
  const shown = output.replace(/^\s*\n/, '').trimEnd()
  return {
    kind: 'notice',
    text: `! ${command}`,
    ...(shown ? { detail: fenced(shown), open: true } : {}),
  }
}

/** The daemon emits nothing for a `!` run, so the page that ran it shows it. */
export function appendShellRun(
  state: TranscriptState,
  command: string,
  output: string,
): TranscriptState {
  return {
    ...state,
    messages: [...state.messages, assistantMessage([shellRunPart(command, output)])],
  }
}

/** The daemon pairs results to calls positionally; the wire carries no ids. */
function completeOldestRunning(parts: MessagePart[], result: string): MessagePart[] {
  const idx = parts.findIndex((p) => p.kind === 'tool_call' && p.status === 'running')
  if (idx === -1) {
    return parts
  }
  return parts.map((p, i) =>
    i === idx && p.kind === 'tool_call'
      ? {
          ...p,
          status: resultFailed(p.name, result) ? ('error' as const) : ('ok' as const),
          result,
        }
      : p,
  )
}

// The reasons are serverapi.OutsideFileConfirmReason and permissions.KernelConfirmReason; older daemons send no tool.
function approvalSubject(req: SessionApprovalRequest): ApprovalSubject {
  if (req.reason === 'file is outside the workspace') {
    return 'path'
  }
  if (req.tool === 'NotebookRun' || req.reason === 'code in the notebook kernel') {
    return 'code'
  }
  if (req.tool !== undefined && req.tool !== 'Bash') {
    return 'call'
  }
  return 'command'
}

export function approvalToPart(req: SessionApprovalRequest): ApprovalPart {
  return {
    kind: 'approval',
    id: req.id,
    approvalKind: req.kind,
    ...(req.kind === 'confirm' ? { subject: approvalSubject(req) } : {}),
    ...(req.tool !== undefined ? { toolName: req.tool } : {}),
    ...(req.command !== undefined ? { command: req.command } : {}),
    ...(req.reason !== undefined ? { reason: req.reason } : {}),
    ...(req.agent !== undefined ? { agent: req.agent } : {}),
    ...(req.mode !== undefined ? { mode: req.mode } : {}),
    // An older daemon asks without questions, which the card leaves to the terminal.
    ...(req.kind === 'ask' ? { questions: askQuestions(req.questions) } : {}),
    ...(req.callId !== undefined ? { toolCallId: req.callId } : {}),
    ...(req.plan !== undefined ? { plan: req.plan } : {}),
    // The daemon clears AllowDir for answers arriving over the tunnel.
    canAllowDirectory: false,
  }
}

function askQuestions(questions: SessionAskQuestion[] | null | undefined): ApprovalQuestion[] {
  return (questions ?? []).map((q) => ({
    question: q.question,
    ...(q.header ? { header: q.header } : {}),
    ...(q.multiSelect ? { multiSelect: true } : {}),
    ...(q.options?.length
      ? {
          options: q.options.map((o) => ({
            label: o.label,
            ...(o.description !== undefined ? { description: o.description } : {}),
            ...(o.preview !== undefined ? { preview: o.preview } : {}),
          })),
        }
      : {}),
  }))
}

export function approvalAnswerBody(answer: ApprovalAnswerValue): SessionApprovalAnswer {
  if (answer.kind === 'confirm') {
    return {
      allowed: answer.allowed,
      ...(answer.denyMessage !== undefined ? { denyMessage: answer.denyMessage } : {}),
    }
  }
  return {
    answers: answer.answers,
    ...(answer.chat !== undefined ? { chat: answer.chat } : {}),
  }
}

/** What a recorded ask gave each question; denied is the reader choosing to chat about them instead. */
function askOutcome(d: SessionToolDecision): {
  answers: ApprovalQuestionAnswer[]
  chat?: boolean
} {
  const answers = (d.answers ?? []).map((a) => ({
    ...(a.picked?.length ? { picked: a.picked } : {}),
    ...(a.text ? { text: a.text } : {}),
    ...(a.notes ? { notes: a.notes } : {}),
  }))
  return d.status === 'denied' ? { answers, chat: true } : { answers }
}

/** A review still under way, or one the turn cut short, settled nothing. */
export function toolDecision(d: SessionToolDecision): ToolDecision | null {
  if (d.status === 'reviewing' || d.status === 'aborted') {
    return null
  }
  return {
    status: d.status,
    by: d.by,
    at: d.at,
    ...(d.username ? { name: d.username } : {}),
    ...(d.note ? { note: d.note } : {}),
    ...(d.rationale ? { reason: d.rationale } : {}),
    ...(d.action ? { action: d.action } : {}),
  }
}

/** Ids come from the item's position, so a refetch keeps message identity and
 *  React does not remount (and collapse) the whole transcript. */
export function historyToMessages(
  history: SessionHistoryItem[],
  options: {
    finalizeOpen?: boolean
    goalNotice?: GoalNotice | undefined
    compactionNotice?: CompactionNotice | undefined
    recapNotice?: RecapNotice | undefined
    words?: TranscriptWords | undefined
    imageUrl?: ImageUrl | undefined
  } = {},
): ChatMessage[] {
  const finalizeOpen = options.finalizeOpen ?? true
  const { words } = options
  // A turn left background agents running reads as waiting on them until a later turn ends with none.
  const lastSettledTurnEnd = history.findLastIndex(
    (item) => item.kind === 'turn_end' && !item.turnEnd?.pendingAgents,
  )
  const messages: ChatMessage[] = []
  let current: ChatMessage | null = null
  const flush = (finalize: boolean) => {
    if (current) {
      if (finalize) {
        current = { ...current, parts: finalizeParts(current.parts ?? []) }
      }
      messages.push(current)
      current = null
    }
  }
  const open = (index: number) => {
    if (!current) {
      current = assistantMessage([], `h-a-${index}`)
    }
    return current
  }
  const append = (part: MessagePart, index: number) => {
    const message = open(index)
    current = { ...message, parts: [...(message.parts ?? []), part] }
  }
  // What the user ran is their message, with its answer hung under it as the
  // terminal draws it; an automatic compaction has no command, and its line
  // joins the reply.
  const ranCommand = (command: string | undefined, index: number, answer: CommandAnswer) => {
    if (!command) {
      append(
        answer.document
          ? { kind: 'text', text: answer.document }
          : {
              kind: 'notice',
              text: answer.text,
              ...(answer.detail ? { detail: answer.detail } : {}),
            },
        index,
      )
      return
    }
    flush(true)
    messages.push({
      ...userMessage(command, false, `h-u-${index}`),
      commandAnswer: answer,
    })
  }

  // Results pair to calls in order, and a call the transcript does not draw
  // still takes a slot, or the next result would land on the wrong block.
  const pending: PendingCall[] = []
  const settle = (call: PendingCall, result: string) => {
    const message = open(-1)
    current = {
      ...message,
      parts: settleCall(message.parts ?? [], call, result),
    }
  }
  // A question with no result yet is still waiting, and its pending approval draws it rather than a card from history.
  const dropWaitingAsks = () => {
    const waiting = new Set(pending.flatMap((call) => (call.kind === 'ask' ? [call.id] : [])))
    if (current && waiting.size > 0) {
      current = {
        ...current,
        parts: (current.parts ?? []).filter((p) => !(p.kind === 'approval' && waiting.has(p.id))),
      }
    }
  }

  history.forEach((item, index) => {
    switch (item.kind) {
      case 'user': {
        flush(true)
        const shell = parseShellRecord(item.text ?? '')
        if (shell) {
          append(shellRunPart(shell.command, shell.output), index)
          return
        }
        messages.push(
          userMessage(
            item.text ?? '',
            item.fromMain ?? false,
            `h-u-${index}`,
            item.pastes,
            item.images,
            options.imageUrl,
          ),
        )
        return
      }
      case 'assistant': {
        const interrupted = interruptionNotice(item.text ?? '')
        append(
          interrupted
            ? { kind: 'notice', text: interrupted }
            : { kind: 'text', text: item.text ?? '' },
          index,
        )
        return
      }
      case 'thinking':
        append({ kind: 'reasoning', text: item.text ?? '' }, index)
        return
      case 'tool_call': {
        const name = item.toolName ?? ''
        const args = item.toolArgs ?? ''
        const id = `h-${index}`
        if (name === 'Task') {
          const { description, agentType } = taskCallFromArgs(args)
          append(
            {
              kind: 'subagent',
              id,
              status: 'running',
              description,
              ...(agentType ? { agentType } : {}),
            },
            index,
          )
          pending.push({ kind: 'subagent', id })
          return
        }
        if (name === 'AskUserQuestion') {
          const [card, call] = askCard(id, args, item.decision)
          append(card, index)
          pending.push(call)
          return
        }
        if (name === 'ExitPlanMode') {
          append({ kind: 'text', text: planFromArgs(args) }, index)
          pending.push({ kind: 'hidden' })
          return
        }
        const todos = name === 'TodoWrite' ? todosFromArgs(args) : null
        if (todos?.length) {
          const message = open(index)
          current = {
            ...message,
            parts: applyPartDelta(message.parts ?? [], {
              type: 'todo_snapshot',
              todos,
            }),
          }
          pending.push({ kind: 'hidden' })
          return
        }
        if (hiddenTranscriptTool(name)) {
          pending.push({ kind: 'hidden' })
          return
        }
        const decision = item.decision && toolDecision(item.decision)
        append(
          {
            kind: 'tool_call',
            // Keyed like a live tool_start, so a turn joined mid-flight can end the calls history drew.
            id: item.callId || id,
            name,
            args,
            status: 'running',
            ...(item.startLine ? { startLine: item.startLine } : {}),
            ...(planFileEdit(name, args) ? { foldDiff: true } : {}),
            ...(decision ? { decision } : {}),
          },
          index,
        )
        pending.push({ kind: 'tool' })
        return
      }
      case 'tool_result': {
        const call = pending.shift()
        if (call) {
          settle(call, item.text ?? '')
        }
        const images = imageAttachments(item.images, options.imageUrl)
        if (images.length) {
          append({ kind: 'image', images }, index)
        }
        return
      }
      case 'plan_view': {
        // The record names the file; its body is the plan as the file reads now, if it is still there.
        const path = item.text ?? ''
        ranCommand(item.toolName, index, {
          text: words ? words.planAnswer(path, item.toolName === '/plan open') : path,
          ...(item.planBody ? { document: item.planBody } : {}),
        })
        return
      }
      case 'notice': {
        const text = item.text ?? ''
        const delivery = parseSubagentNotice(text)
        if (delivery?.silent) {
          return
        }
        append(
          delivery
            ? {
                kind: 'notice',
                text: deliveryLine(delivery, words),
                ...(delivery.body ? { detail: delivery.body } : {}),
              }
            : { kind: 'notice', text: text.trim() },
          index,
        )
        return
      }
      case 'warning':
        append({ kind: 'warning', text: item.text ?? '' }, index)
        return
      case 'error':
        append({ kind: 'error', text: item.text ?? '' }, index)
        return
      case 'goal_view':
        ranCommand(item.toolName, index, { text: item.text ?? '' })
        return
      case 'compaction': {
        const notice = options.compactionNotice
        if (notice) {
          ranCommand(item.toolName, index, {
            text: item.toolName ? notice.command : notice.automatic,
            ...(item.text ? { detail: item.text } : {}),
          })
        }
        return
      }
      case 'goal_progress': {
        const progress = parseGoalProgress(item.text)
        const text = goalText(progress, options.goalNotice)
        const detail = goalDetail(progress, words)
        if (text) {
          append({ kind: 'notice', text, ...(detail ? { detail } : {}) }, index)
        }
        return
      }
      case 'turn_end': {
        const te = item.turnEnd
        if (te && words) {
          const waiting = index > lastSettledTurnEnd && (te.pendingAgents ?? 0) > 0
          append(
            {
              kind: 'notice',
              text: words.turnEnd(te, turnVerb(te.endedAt), waiting),
            },
            index,
          )
        }
        return
      }
      case 'recap': {
        const text = recapText(item.text, options.recapNotice)
        if (text) {
          append({ kind: 'notice', text }, index)
        }
        return
      }
      default:
        return
    }
  })
  dropWaitingAsks()
  flush(finalizeOpen)
  return messages
}

type PendingCall =
  | { kind: 'tool' }
  | { kind: 'hidden' }
  | { kind: 'subagent'; id: string }
  | { kind: 'ask'; id: string }

/** An ask's card, settled from its record when it has one, or else by the result that follows. */
function askCard(
  id: string,
  args: string,
  d: SessionToolDecision | undefined,
): [ApprovalPart, PendingCall] {
  const card: ApprovalPart = {
    kind: 'approval',
    id,
    approvalKind: 'ask',
    questions: askQuestionsFromArgs(args),
    canAllowDirectory: false,
  }
  if (!d?.answers?.length) {
    return [card, { kind: 'ask', id }]
  }
  // The record holds every answer; its result still takes its slot, so later results pair.
  return [{ ...card, resolved: true, ...askOutcome(d) }, { kind: 'hidden' }]
}

const BACKGROUND_STARTED_PREFIX = 'Started background subagent'

function settleCall(parts: MessagePart[], call: PendingCall, result: string): MessagePart[] {
  switch (call.kind) {
    case 'tool':
      return completeOldestRunning(parts, result)
    case 'subagent':
      return parts.map((p) => {
        if (p.kind !== 'subagent' || p.id !== call.id) {
          return p
        }
        // A launch says nothing of how the child will end; its report arrives on a line of its own.
        if (result.startsWith(BACKGROUND_STARTED_PREFIX)) {
          return { ...p, background: true }
        }
        return {
          ...p,
          status: resultFailed('Task', result) ? ('failed' as const) : ('done' as const),
          summary: firstNonEmptyLine(result, 60),
        }
      })
    case 'ask':
      return parts.map((p) =>
        p.kind === 'approval' && p.id === call.id
          ? { ...p, resolved: true, answer: result.trim() }
          : p,
      )
    default:
      return parts
  }
}

/** A session with no history resumes from the start: the daemon stamps a seq
 *  before the agent records it, so a prompt sent with `create` falls in that
 *  window, and replaying a session that seeded nothing can duplicate nothing. */
export function resumeCursor(detail: SessionDetail): number {
  return detail.history?.length ? (detail.lastSeq ?? 0) : 0
}

export function initialTranscript(
  detail: SessionDetail,
  options: {
    goalNotice?: GoalNotice | undefined
    compactionNotice?: CompactionNotice | undefined
    recapNotice?: RecapNotice | undefined
    words?: TranscriptWords | undefined
    imageUrl?: ImageUrl | undefined
  } = {},
): TranscriptState {
  // Only a turn the detail names is in flight: the status also reads running
  // between goal turns, and just after a done this snapshot already covers.
  const running = detail.status === 'awaiting_approval' || !!detail.turnId
  const messages = historyToMessages(detail.history ?? [], {
    ...options,
    finalizeOpen: !running,
  })
  let streaming: ChatMessage | null = null
  // A turn in flight keeps its history-seeded parts so open calls can complete.
  const last = messages[messages.length - 1]
  if (running && last && last.role === 'assistant') {
    streaming = last
    messages.pop()
  }
  if (detail.approvals && detail.approvals.length > 0) {
    const approvals = detail.approvals.map(approvalToPart)
    streaming = streaming
      ? { ...streaming, parts: [...(streaming.parts ?? []), ...approvals] }
      : assistantMessage(approvals)
  }
  const terminal = (streaming ?? messages.at(-1))?.parts?.at(-1)
  const seededTerminalTurnId = detail.history?.findLast((item) => item.kind !== 'turn_end')?.turnId
  return {
    messages,
    streaming,
    seededTerminal:
      seededTerminalTurnId && (terminal?.kind === 'error' || terminal?.kind === 'notice')
        ? { part: terminal, turnId: seededTerminalTurnId }
        : null,
    cursor: resumeCursor(detail),
    turnEnded: !running,
    queued: [],
    steered: [],
    notes: [],
    turnStartedAt: running ? (detail.turnStartedAt ?? null) : null,
    waitingForUsageLimit: running && !!detail.waitingForUsageLimit,
    usageLimitResumeAt:
      running && detail.waitingForUsageLimit ? (detail.usageLimitResumeAt ?? null) : null,
    seededSeq: detail.lastSeq ?? 0,
  }
}

/** The approvals the live feed is still waiting on. */
export function pendingApprovals(transcript: TranscriptState): ApprovalPart[] {
  return (transcript.streaming?.parts ?? []).filter(
    (p): p is ApprovalPart => p.kind === 'approval' && !p.resolved,
  )
}

/** Status as the live feed shows it; `detail.status` is only the fetch moment. */
export function liveSessionStatus(
  status: SessionStatus,
  transcript: TranscriptState | null,
  goal?: SessionGoalStatus,
): SessionStatus {
  if (status === 'live_elsewhere' || !transcript) {
    return status
  }
  if (pendingApprovals(transcript).length > 0) {
    return 'awaiting_approval'
  }
  if (turnRunning(transcript) || goal?.checking) {
    return 'running'
  }
  return transcript.turnEnded ? 'idle' : status
}

/** A recorded ask settles its card with each question's answer, whether they were given here or in the terminal. */
function answeredAsk(parts: MessagePart[], d: SessionToolDecision): MessagePart[] {
  const card = parts.find(
    (p): p is ApprovalPart => p.kind === 'approval' && p.toolCallId === d.callId,
  )
  return card
    ? applyPartDelta(parts, {
        type: 'approval_resolved',
        id: card.id,
        ...askOutcome(d),
      })
    : parts
}

/** The running call an event names; a daemon older than tool_end's callId names none, so the newest call of its name stands in. */
function runningToolId(
  parts: MessagePart[],
  callId: string | undefined,
  name: string | undefined,
): string | null {
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const p = parts[i]
    if (
      p !== undefined &&
      p.kind === 'tool_call' &&
      p.status === 'running' &&
      (callId ? p.id === callId : name === undefined || p.name === name)
    ) {
      return p.id
    }
  }
  return null
}

export function resolveApprovalEverywhere(state: TranscriptState, id: string): TranscriptState {
  const resolve = (m: ChatMessage): ChatMessage =>
    m.parts?.some((p) => p.kind === 'approval' && p.id === id)
      ? {
          ...m,
          parts: applyPartDelta(m.parts ?? [], {
            type: 'approval_resolved',
            id,
          }),
        }
      : m
  return {
    ...state,
    messages: state.messages.map(resolve),
    streaming: state.streaming ? resolve(state.streaming) : null,
  }
}

/** The daemon queues a message sent mid-turn rather than cutting the turn
 *  short, so the page must not close the turn either: its open tool calls
 *  would read as interrupted while they are still running. */
export function appendOwnMessage(
  state: TranscriptState,
  text: string,
  id?: string,
  pastes?: MessagePaste[],
  previews?: SessionImage[],
): TranscriptState {
  const message = userMessage(text, false, id, pastes, previews)
  if (turnRunning(state)) {
    return { ...state, queued: [...state.queued, message] }
  }
  return {
    ...state,
    messages: [...state.messages, message],
    seededTerminal: null,
    turnEnded: false,
  }
}

/** An own message takes the pastes and images its echo says the model received. */
function withSentPastesAndImages(
  messages: ChatMessage[],
  ev: SessionStreamEvent,
  id: string | undefined,
  imageUrl: ImageUrl | undefined,
): ChatMessage[] {
  const pastes = ev.pastes?.length ? ev.pastes : null
  const attachments = imageAttachments(ev.images, imageUrl)
  const idx = messages.findLastIndex((m) =>
    id ? m.id === id : m.role === 'user' && m.content === ev.content,
  )
  const message = messages[idx]
  if (!message || (!pastes && !message.pastes?.length && !attachments.length)) {
    return messages
  }
  const sent: ChatMessage = {
    ...message,
    pastes,
    ...(attachments.length ? { attachments } : {}),
  }
  return messages.map((m, i) => (i === idx ? sent : m))
}

/** Held apart until the daemon reports the model was handed it. */
export function appendSteeredMessage(
  state: TranscriptState,
  text: string,
  id?: string,
  pastes?: MessagePaste[],
  previews?: SessionImage[],
): TranscriptState {
  return {
    ...state,
    steered: [...state.steered, userMessage(text, false, id, pastes, previews)],
  }
}

/** The daemon queued a message this page had shown as sent, because the turn
 *  ahead of it had not reached the page yet. */
export function markQueued(state: TranscriptState, id: string): TranscriptState {
  const message = state.messages.find((m) => m.id === id)
  if (!message) {
    return state
  }
  return {
    ...state,
    messages: state.messages.filter((m) => m.id !== id),
    queued: [...state.queued, message],
  }
}

/** Left in place, a message the machine refused reads as one the session received. */
export function dropMessage(state: TranscriptState, id: string): TranscriptState {
  return {
    ...state,
    messages: state.messages.filter((m) => m.id !== id),
    queued: state.queued.filter((m) => m.id !== id),
    steered: state.steered.filter((m) => m.id !== id),
  }
}

/** Everything sent that the transcript has not placed yet, in the order it
 *  will be read: handed to the model, then steered, then turns of their own. */
export function pendingMessages(state: TranscriptState): ChatMessage[] {
  return [...state.notes, ...state.steered, ...state.queued]
}

/** A turn runs before it streams anything, and after it is handed a note. */
export function turnRunning(state: TranscriptState | null): boolean {
  return (
    !!state &&
    (!!state.streaming ||
      (!state.turnEnded && (state.turnStartedAt !== null || state.notes.length > 0)))
  )
}

/** Whether the turn waits on a Bash call, which the machine can move to the background. */
export function bashRunning(state: TranscriptState | null): boolean {
  return (state?.streaming?.parts ?? []).some(
    (p) => p.kind === 'tool_call' && p.name === 'Bash' && p.status === 'running',
  )
}

/** Daemons before the interrupted flag close a stopped turn with the
 *  canceled context's error. */
function stoppedTurn(ev: SessionStreamEvent): boolean {
  return !!ev.interrupted || /context canceled$/.test(ev.content ?? '')
}

/** What the agent records for a call a stop cut off (serverapi.UserInterruptedTool), so a stopped call reads live as it replays. */
export function userInterruptedTool(name: string): string {
  return `The user interrupted ${name} before it finished.`
}

function interruptRunningCalls(parts: MessagePart[]): MessagePart[] {
  return parts.reduce<MessagePart[]>(
    (settled, p) =>
      p.kind === 'tool_call' && p.status === 'running'
        ? applyPartDelta(settled, {
            type: 'tool_end',
            id: p.id,
            result: userInterruptedTool(p.name),
            isError: false,
          })
        : settled,
    parts,
  )
}

const TODO_STATUSES: ReadonlySet<string> = new Set(['pending', 'in_progress', 'completed'])

/** TodoWrite's whole list, which its arguments carry; null when they hold none. */
export function todosFromArgs(argsJSON: string): TodoItem[] | null {
  let args: unknown
  try {
    args = JSON.parse(argsJSON)
  } catch {
    return null
  }
  const raw =
    args && typeof args === 'object' ? (args as Record<string, unknown>)['todos'] : undefined
  if (!Array.isArray(raw)) {
    return null
  }
  return raw.flatMap((t: unknown): TodoItem[] => {
    const todo = t && typeof t === 'object' ? (t as Record<string, unknown>) : {}
    const { content, status, activeForm } = todo
    if (typeof content !== 'string' || typeof status !== 'string' || !TODO_STATUSES.has(status)) {
      return []
    }
    return [
      {
        content,
        status: status as TodoItem['status'],
        ...(typeof activeForm === 'string' ? { activeForm } : {}),
      },
    ]
  })
}

function applyPartEvent(
  parts: MessagePart[],
  ev: SessionStreamEvent,
  imageUrl?: ImageUrl,
): MessagePart[] | null {
  switch (ev.type) {
    case 'chunk':
      return applyPartDelta(parts, { type: 'text', text: ev.content ?? '' })
    case 'reasoning':
      return applyPartDelta(parts, {
        type: 'reasoning',
        text: ev.content ?? '',
      })
    case 'retract':
      // Mirrors the terminal client: the in-flight text and thinking go.
      return applyPartDelta(parts, { type: 'retract' })
    case 'tool_start': {
      const todos = ev.name === 'TodoWrite' ? todosFromArgs(ev.args ?? '') : null
      if (todos?.length) {
        return applyPartDelta(parts, { type: 'todo_snapshot', todos })
      }
      if (hiddenTranscriptTool(ev.name ?? '')) {
        return parts
      }
      const id = ev.callId || String(ev.seq)
      const started = applyPartDelta(parts, {
        type: 'tool_start',
        id,
        name: ev.name ?? '',
        args: ev.args ?? '',
        ...(ev.startLine !== undefined ? { startLine: ev.startLine } : {}),
      })
      return planFileEdit(ev.name ?? '', ev.args ?? '')
        ? started.map((p) => (p.kind === 'tool_call' && p.id === id ? { ...p, foldDiff: true } : p))
        : started
    }
    case 'tool_update': {
      const id = runningToolId(parts, ev.callId, ev.name)
      // A hook rewrote the call: the daemon sends its whole new arguments, not a fragment to append.
      return id === null
        ? parts
        : parts.map((p) =>
            p.kind === 'tool_call' && p.id === id
              ? { ...p, args: ev.args ?? p.args, argsRewritten: true }
              : p,
          )
    }
    case 'tool_end': {
      const id = runningToolId(parts, ev.callId, ev.name)
      const call = parts.find((p) => p.kind === 'tool_call' && p.id === id)
      if (id === null || call?.kind !== 'tool_call') {
        return parts
      }
      const result = ev.result ?? ''
      // Bash, WebFetch and GrepSearch fail in-band, which replay already reads from the text.
      return applyPartDelta(parts, {
        type: 'tool_end',
        id,
        result,
        isError: !!ev.isError || resultFailed(call.name, result),
      })
    }
    // What a call returned besides its text, such as a screenshot it read.
    case 'images': {
      const images = imageAttachments(ev.images, imageUrl)
      return images.length ? [...parts, { kind: 'image', images }] : parts
    }
    case 'subagent_start':
      return applyPartDelta(parts, {
        type: 'subagent_start',
        id: ev.id ?? String(ev.seq),
        ...(ev.agentType !== undefined ? { agentType: ev.agentType } : {}),
        ...(ev.color !== undefined ? { color: ev.color } : {}),
        ...(ev.background !== undefined ? { background: ev.background } : {}),
        ...(ev.name !== undefined ? { description: ev.name } : {}),
      })
    case 'subagent_action':
      return applyPartDelta(parts, {
        type: 'subagent_action',
        id: ev.id ?? '',
        action: ev.content ?? '',
      })
    // A delivery is the child's report entering the main conversation, an
    // interim message included; it never says how the child ended.
    case 'subagent_end':
      return applyPartDelta(parts, {
        type: 'subagent_end',
        id: ev.id ?? '',
        ok: !ev.isError,
        ...(ev.result !== undefined ? { summary: ev.result } : {}),
        ...(ev.interrupted ? { interrupted: true } : {}),
      })
    case 'notice':
    case 'warning':
      return ev.recorded && !ev.turnId
        ? null
        : applyPartDelta(parts, {
            type: ev.type,
            text: (ev.content ?? '').trim(),
          })
    case 'error':
      return stoppedTurn(ev)
        ? [...interruptRunningCalls(parts), { kind: 'notice', text: INTERRUPTED_NOTICE }]
        : [...parts, { kind: 'error', text: ev.content ?? '' }]
    case 'decision': {
      if (ev.decision?.answers?.length) {
        return answeredAsk(parts, ev.decision)
      }
      const decision = ev.decision && toolDecision(ev.decision)
      return decision && ev.decision
        ? applyPartDelta(parts, {
            type: 'tool_decision',
            id: ev.decision.callId,
            decision,
          })
        : parts
    }
    case 'approval_request':
      return ev.approval
        ? applyPartDelta(parts, {
            type: 'approval_request',
            approval: approvalToPart(ev.approval),
          })
        : parts
    default:
      return null
  }
}

function controlEffects(ev: SessionStreamEvent): StreamEffect[] {
  switch (ev.type) {
    case 'state':
      return ev.state ? [{ type: 'state', state: ev.state }] : []
    case 'cleared':
      return ev.newId ? [{ type: 'cleared', newId: ev.newId }] : []
    case 'history_changed':
      return [{ type: 'refetch' }]
    default:
      return []
  }
}

function parseGoalProgress(text: string | undefined): SessionGoalProgress | null {
  try {
    return JSON.parse(text ?? '') as SessionGoalProgress
  } catch {
    return null
  }
}

/** How a /goal loop step reads, in the reader's language. */
export type GoalNotice = (progress: SessionGoalProgress) => string

/** How a compaction's line reads, in the reader's language; its summary opens under it. */
export interface CompactionNotice {
  command: string
  automatic: string
}

/** How the recap written while the reader was away reads, in their language. */
export type RecapNotice = (recap: string) => string

// The terminal names a finished turn with one of these, picked by when it ended.
export const TURN_VERBS = [
  'baked',
  'brewed',
  'churned',
  'cogitated',
  'cooked',
  'crunched',
  'sauteed',
  'worked',
] as const
export type TurnVerb = (typeof TURN_VERBS)[number]

/** The rest of a session's lines in the reader's language. */
export interface TranscriptWords {
  /** What a continuing /goal step opens to: its goal and why it isn't met; null when it has no reason. */
  goalDetail: (progress: SessionGoalProgress) => string | null
  /** The line a turn nobody stopped ends with; `waiting` while it waits on background agents. */
  turnEnd: (turnEnd: SessionTurnEnd, verb: TurnVerb, waiting: boolean) => string
  /** The plan file a /plan showed, under the command; `opened` when /plan open put it in an editor. */
  planAnswer: (path: string, opened: boolean) => string
  /** The line a background subagent's or command's report enters the conversation with. */
  deliveryLine: (notice: SubagentNotice) => string
}

function deliveryLine(n: SubagentNotice, words: TranscriptWords | undefined): string {
  return words ? words.deliveryLine(n) : subagentDeliveryLine(n)
}

// The harness's plan file, as permissions.IsPlanFile reads a path.
function isPlanFile(path: string): boolean {
  const slashed = path.replaceAll('\\', '/')
  const base = slashed.slice(slashed.lastIndexOf('/') + 1).toLowerCase()
  if (base === 'plan.md') {
    return true
  }
  return base.endsWith('.md') && (slashed.startsWith('plans/') || slashed.includes('/plans/'))
}

/** An edit to the plan file, whose diff the plan shows anyway, so it stays behind its row as in the terminal. */
function planFileEdit(name: string, argsJSON: string): boolean {
  if (name !== 'EditFile' && name !== 'WriteFile') {
    return false
  }
  try {
    const args: unknown = JSON.parse(argsJSON)
    const path =
      args && typeof args === 'object' ? (args as Record<string, unknown>)['path'] : undefined
    return typeof path === 'string' && isPlanFile(path)
  } catch {
    return false
  }
}

/** The verb the terminal picks for a turn, so the same turn reads the same in both. */
export function turnVerb(endedAt: string): TurnVerb {
  return TURN_VERBS[fnv32a(goUtcTime(endedAt)) % TURN_VERBS.length] ?? 'worked'
}

// The time as Go's RFC3339Nano writes it in UTC, which is what the terminal hashes;
// the wire has the same fraction, in the daemon's own zone.
function goUtcTime(wire: string): string {
  const m = /^(.*?:\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.exec(wire)
  if (!m) {
    return wire
  }
  const utc = DateTime.fromISO(`${m[1]}${m[3]}`, { setZone: true }).toUTC()
  const fraction = (m[2] ?? '').replace(/0+$/, '').replace(/\.$/, '')
  return `${utc.toFormat("yyyy-MM-dd'T'HH:mm:ss")}${fraction}Z`
}

function fnv32a(text: string): number {
  let hash = 0x811c9dc5
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

/** A loop stopped with nothing to report files nothing in the terminal, and
 *  nothing here. */
function goalText(
  p: SessionGoalProgress | null | undefined,
  goalNotice: GoalNotice | undefined,
): string | null {
  if (!p || !goalNotice || (!p.err && p.outcome === 'stopped')) {
    return null
  }
  return goalNotice(p)
}

function recapText(recap: string | undefined, recapNotice: RecapNotice | undefined): string | null {
  return recap && recapNotice ? recapNotice(recap) : null
}

/** Between turns a notice stands alone rather than opening a turn. */
function appendNotice(
  state: TranscriptState,
  text: string,
  detail?: string,
  kind: 'notice' | 'warning' = 'notice',
): TranscriptState {
  const notice: MessagePart = {
    kind,
    text,
    ...(detail ? { detail } : {}),
  }
  return state.streaming
    ? {
        ...state,
        streaming: {
          ...state.streaming,
          parts: [...(state.streaming.parts ?? []), notice],
        },
      }
    : { ...state, messages: [...state.messages, assistantMessage([notice])] }
}

/** The session files its notice above the reply still streaming, which reaches the history when it ends. */
function placeSessionNotice(
  state: TranscriptState,
  text: string,
  kind: 'notice' | 'warning',
): TranscriptState {
  if (!state.streaming) {
    return appendNotice(state, text, undefined, kind)
  }
  const parts = state.streaming.parts ?? []
  let at = parts.length
  while (at > 0 && ['text', 'reasoning'].includes(parts[at - 1]?.kind ?? '')) {
    at--
  }
  return {
    ...state,
    streaming: {
      ...state.streaming,
      parts: [...parts.slice(0, at), { kind, text }, ...parts.slice(at)],
    },
  }
}

/** A continuing step opens to its goal and why it isn't met, as the terminal's does; other steps say all there is. */
function goalDetail(
  p: SessionGoalProgress | null | undefined,
  words: TranscriptWords | undefined,
): string | null {
  if (!p || !words || p.outcome === 'achieved' || p.err || p.resumeAt || !p.reason?.trim()) {
    return null
  }
  return words.goalDetail(p)
}

const SUBAGENT_EVENTS = new Set(['subagent_start', 'subagent_action', 'subagent_end'])

const DECIDED_KEPT = 200

/** Keeps the auto-reviewer's reviews under way for whoever asked: a review
 *  start adds its call, and a verdict, or a review the turn cut short, takes
 *  it away. */
function trackReview(state: TranscriptState, ev: SessionStreamEvent): TranscriptState {
  const d = ev.decision
  if (!d?.callId || (ev.type !== 'decision' && ev.type !== 'subagent_decision')) {
    return state
  }
  const scope = ev.type === 'subagent_decision' ? (ev.id ?? '') : ''
  const reviews = state.reviews ?? {}
  const under = reviews[scope] ?? []
  const decided = state.decided ?? []
  if (d.status === 'reviewing') {
    // A subagent's verdict goes out at once, while its start can wait in the turn's buffer.
    if (decided.includes(d.callId) || under.includes(d.callId)) {
      return state
    }
    return { ...state, reviews: { ...reviews, [scope]: [...under, d.callId] } }
  }
  return {
    ...state,
    reviews: { ...reviews, [scope]: under.filter((id) => id !== d.callId) },
    decided: [...decided, d.callId].slice(-DECIDED_KEPT),
  }
}

/** How many of the main conversation's calls the auto-reviewer is deciding on. */
export function reviewingCount(state: TranscriptState | null): number {
  return state?.reviews?.['']?.length ?? 0
}

/** Shows a subagent's reviews on its card, wherever its turn left it. */
function showReviews(state: TranscriptState, id: string): TranscriptState {
  const count = state.reviews?.[id]?.length ?? 0
  const update = (m: ChatMessage): ChatMessage =>
    m.parts?.some((p) => p.kind === 'subagent' && p.id === id)
      ? {
          ...m,
          parts: applyPartDelta(m.parts ?? [], {
            type: 'subagent_reviewing',
            id,
            count,
          }),
        }
      : m
  return {
    ...state,
    messages: state.messages.map(update),
    streaming: state.streaming ? update(state.streaming) : null,
  }
}

/** A subagent can outlive the turn that started it, and its later frames
 *  update its card where that turn left it rather than open a new turn. */
function applyToSettledSubagent(
  state: TranscriptState,
  ev: SessionStreamEvent,
): TranscriptState | null {
  if (!SUBAGENT_EVENTS.has(ev.type) || !ev.id) {
    return null
  }
  const holds = (m: ChatMessage) => !!m.parts?.some((p) => p.kind === 'subagent' && p.id === ev.id)
  if (state.streaming && holds(state.streaming)) {
    // Moved to the background, it starts again under the same id; its card stays.
    return ev.type === 'subagent_start' ? state : null
  }
  const idx = state.messages.findLastIndex(holds)
  const message = state.messages[idx]
  if (!message) {
    return null
  }
  if (ev.type === 'subagent_start') {
    return state
  }
  const parts = applyPartEvent(message.parts ?? [], ev)
  return parts
    ? {
        ...state,
        messages: state.messages.map((m, i) => (i === idx ? { ...m, parts } : m)),
      }
    : null
}

// Frames that end a thought by putting something else in the transcript.
const ENDS_THOUGHT = new Set([
  'chunk',
  'tool_start',
  'subagent_start',
  'approval_request',
  'notice',
  'warning',
  'error',
  'done',
  'user_message',
  'turn_start',
])

/** Times a thought from when its model step began until something else arrives, as the terminal does. */
function timeThought(
  state: TranscriptState,
  ev: SessionStreamEvent,
  now: () => string,
): TranscriptState {
  const last = state.streaming?.parts?.at(-1)
  if (ev.type === 'reasoning') {
    return last?.kind === 'reasoning'
      ? state
      : { ...state, thoughtStartedAt: state.stepStartedAt ?? now() }
  }
  if (ev.type === 'tool_end') {
    return { ...state, stepStartedAt: now() }
  }
  if (!ENDS_THOUGHT.has(ev.type)) {
    return state
  }
  const at = now()
  const opensStep = ev.type === 'user_message' || ev.type === 'turn_start'
  if (
    !state.streaming ||
    last?.kind !== 'reasoning' ||
    last.durationMs !== undefined ||
    !state.thoughtStartedAt
  ) {
    return opensStep ? { ...state, stepStartedAt: at, thoughtStartedAt: null } : state
  }
  const durationMs = Math.max(
    0,
    DateTime.fromISO(at).diff(DateTime.fromISO(state.thoughtStartedAt)).as('milliseconds'),
  )
  return {
    ...state,
    streaming: {
      ...state.streaming,
      parts: [...(state.streaming.parts ?? []).slice(0, -1), { ...last, durationMs }],
    },
    thoughtStartedAt: null,
    stepStartedAt: at,
  }
}

function finishTurn(state: TranscriptState): TranscriptState {
  const done = state.streaming
    ? {
        ...state,
        streaming: {
          ...state.streaming,
          parts: finalizeParts(state.streaming.parts ?? []),
        },
      }
    : state
  const { '': _ended, ...children } = state.reviews ?? {}
  return {
    ...placeNotes(done),
    turnEnded: true,
    turnStartedAt: null,
    waitingForUsageLimit: false,
    usageLimitResumeAt: null,
    // The turn's reviews end with it; a background subagent's go on.
    reviews: children,
  }
}

/** Where the model speaks after being handed a note, the note joins the
 *  transcript ahead of what it says. */
function placeNotes(state: TranscriptState): TranscriptState {
  return {
    ...state,
    messages: [...state.messages, ...(state.streaming ? [state.streaming] : []), ...state.notes],
    notes: [],
    streaming: null,
  }
}

const OUTPUT_EVENTS = new Set(['chunk', 'reasoning', 'approval_request'])

/** A hidden tool draws nothing, so a note placed there leaves the turn idle. */
function speaks(ev: SessionStreamEvent): boolean {
  if (ev.type === 'tool_start') {
    return !hiddenTranscriptTool(ev.name ?? '')
  }
  return OUTPUT_EVENTS.has(ev.type)
}

// The daemon's word, when an interrupt drops the turns waiting behind it.
const DISCARDED_QUEUE = /^interrupted: discarded \d+ queued message/

/** By id when the send is known: the daemon echoes an MCP prompt expanded. */
function takeOwn(
  list: ChatMessage[],
  id: string | undefined,
  text: string,
): [ChatMessage | undefined, ChatMessage[]] {
  const idx = list.findIndex((m) => (id ? m.id === id : m.content === text))
  return idx === -1 ? [undefined, list] : [list[idx], list.filter((_, i) => i !== idx)]
}

/** An own message's echo stands in for the copy held until its turn began. */
function takeQueued(state: TranscriptState, id: string | undefined, text: string): TranscriptState {
  const [message, queued] = takeOwn(state.queued, id, text)
  return message ? { ...state, messages: [...state.messages, message], queued } : state
}

/** The echo also says how each of the message's pastes was sent. */
function takeEcho(
  state: TranscriptState,
  id: string | undefined,
  ev: SessionStreamEvent,
  imageUrl: ImageUrl | undefined,
): TranscriptState {
  const placed = takeQueued(state, id, ev.content ?? '')
  return {
    ...placed,
    messages: withSentPastesAndImages(placed.messages, ev, id, imageUrl),
  }
}

/** A handed-over note leaves the steered list, or arrives from another window. */
function noteHandedOver(
  state: TranscriptState,
  id: string | undefined,
  ev: SessionStreamEvent,
  imageUrl: ImageUrl | undefined,
): TranscriptState {
  const text = ev.content ?? ''
  const [note, steered] = takeOwn(state.steered, id, text)
  return {
    ...state,
    steered,
    notes: note
      ? withSentPastesAndImages([...state.notes, note], ev, note.id, imageUrl)
      : [...state.notes, userMessage(text, false, undefined, ev.pastes, ev.images, imageUrl)],
  }
}

function nowIso(): string {
  return DateTime.now().toISO()
}

/** Out-of-band frames are classified before seq dedupe, as the terminal client does. */
export function applyStreamEvent(
  state: TranscriptState,
  ev: SessionStreamEvent,
  options: {
    ownTurnIds?: ReadonlySet<string>
    ownTexts?: ReadonlySet<string>
    /** The clock a turn opened by a frame is dated with. */
    now?: () => string
    /** The session this transcript shows, to tell its own start in the feed. */
    sessionId?: string | undefined
    /** The own message this user_message or user_note echoes, when known. */
    echoOf?: string | undefined
    goalNotice?: GoalNotice | undefined
    recapNotice?: RecapNotice | undefined
    words?: TranscriptWords | undefined
    imageUrl?: ImageUrl | undefined
  } = {},
): { state: TranscriptState; effects: StreamEffect[] } {
  const now = options.now ?? nowIso
  // A cleared session's feed carries the conversation it replaced, up to the
  // frame that names this session; the transcript starts there.
  if (
    ev.type === 'cleared' &&
    options.sessionId &&
    ev.newId === options.sessionId &&
    ev.seq > state.cursor
  ) {
    return {
      state: {
        ...state,
        messages: [],
        streaming: null,
        seededTerminal: null,
        turnEnded: true,
        turnStartedAt: null,
        waitingForUsageLimit: false,
        usageLimitResumeAt: null,
        cursor: ev.seq,
      },
      effects: [],
    }
  }
  if (ev.type === 'replay_truncated') {
    return {
      state: { ...state, cursor: Math.max(state.cursor, ev.seq) },
      effects: [{ type: 'refetch' }],
    }
  }
  // An older clear replayed ahead of this session's start points at a
  // conversation already left behind; following it would bounce the page back.
  if (ev.type === 'cleared' && ev.seq <= (state.seededSeq ?? 0) && ev.newId !== options.sessionId) {
    return {
      state: { ...state, cursor: Math.max(state.cursor, ev.seq) },
      effects: [],
    }
  }
  if (ev.seq === 0) {
    const transient =
      ev.type === 'notice' || ev.type === 'warning'
        ? [
            {
              type: 'notice' as const,
              text: ev.content ?? '',
              warn: ev.type === 'warning',
            },
          ]
        : []
    return { state, effects: transient }
  }
  if (ev.seq <= state.cursor) {
    return { state, effects: [] }
  }
  // Another window is driving a subagent; the page shows only the main conversation.
  if (ev.id && !ev.type.startsWith('subagent_')) {
    return { state: { ...state, cursor: ev.seq }, effects: [] }
  }
  let next: TranscriptState = {
    ...state,
    cursor: ev.seq,
    ...(ev.turnEnd ? { turnEndSeq: ev.seq } : {}),
  }
  if (next.notes.length > 0 && speaks(ev)) {
    next = placeNotes(next)
  }
  if (ev.type === 'notice' && DISCARDED_QUEUE.test(ev.content ?? '')) {
    next = { ...next, queued: [] }
  }

  // The snapshot can include the recorded failure before the feed stamps its closing error.
  const lastMessage = next.streaming ?? next.messages.at(-1)
  const lastPart = lastMessage?.parts?.at(-1)
  if (
    ev.type === 'error' &&
    next.seededTerminal &&
    ev.turnId === next.seededTerminal.turnId &&
    lastPart === next.seededTerminal.part &&
    next.notes.length === 0 &&
    lastMessage?.role === 'assistant' &&
    (stoppedTurn(ev)
      ? lastPart?.kind === 'notice' && lastPart.text === INTERRUPTED_NOTICE
      : lastPart?.kind === 'error' && lastPart.text === (ev.content ?? ''))
  ) {
    return {
      state: {
        ...finishTurn(next),
        seededTerminal: null,
        turnEnded: true,
        turnStartedAt: null,
      },
      effects: [],
    }
  }
  if (
    ev.type === 'error' ||
    ev.type === 'done' ||
    ev.type === 'user_message' ||
    ev.type === 'user_note' ||
    ev.type === 'tool_start' ||
    ev.type === 'subagent_start' ||
    speaks(ev)
  ) {
    next = { ...next, seededTerminal: null }
  }

  next = trackReview(next, ev)
  if (ev.type === 'subagent_end' && ev.id && next.reviews?.[ev.id]) {
    const { [ev.id]: _ended, ...rest } = next.reviews
    next = { ...next, reviews: rest }
  }
  if (ev.type === 'subagent_decision') {
    return {
      state: showReviews(next, ev.id ?? ''),
      effects: [],
    }
  }
  const settled = applyToSettledSubagent(next, ev)
  if (settled) {
    return { state: settled, effects: [] }
  }
  next = timeThought(next, ev, now)

  const parts = applyPartEvent(next.streaming?.parts ?? [], ev, options.imageUrl)
  // A frame with nothing to pair to (a tool_end whose call is already closed, a
  // retract with nothing in flight) leaves the parts untouched; opening a turn
  // for it would draw an empty bubble and report an idle session as running.
  if (parts !== null && (next.streaming !== null || parts.length > 0)) {
    const streaming = next.streaming ?? assistantMessage()
    // A frame that opens a turn after the last one ended dates it; a frame
    // joining a turn the fetch already reported is not when it began.
    const opened = next.streaming === null && next.turnEnded
    next = {
      ...next,
      streaming: { ...streaming, parts },
      turnStartedAt: next.turnStartedAt ?? (opened ? now() : null),
    }
    if (ev.type === 'error') {
      next = finishTurn(next)
    }
    return { state: next, effects: [] }
  }

  switch (ev.type) {
    case 'user_message': {
      // The daemon echoes messages to every watcher, and the echo can beat the
      // response that names the turn, so our own text stands in for the id.
      const ownEcho =
        !!options.echoOf ||
        (!!ev.turnId && !!options.ownTurnIds?.has(ev.turnId)) ||
        (!!ev.content && !!options.ownTexts?.has(ev.content))
      next = finishTurn(next)
      next = ownEcho
        ? takeEcho(next, options.echoOf, ev, options.imageUrl)
        : {
            ...next,
            messages: [
              ...next.messages,
              userMessage(
                ev.content ?? '',
                false,
                undefined,
                ev.pastes,
                ev.images,
                options.imageUrl,
              ),
            ],
          }
      next = { ...next, turnEnded: false, turnStartedAt: now() }
      break
    }
    case 'turn_start':
      next = { ...finishTurn(next), turnEnded: false, turnStartedAt: now() }
      break
    case 'user_note':
      next = noteHandedOver(next, options.echoOf, ev, options.imageUrl)
      break
    case 'approval_resolved':
      if (ev.approvalId) {
        next = resolveApprovalEverywhere(next, ev.approvalId)
      }
      break
    case 'usage_limit_wait':
      next = {
        ...next,
        waitingForUsageLimit: !!ev.content,
        usageLimitResumeAt: (ev.content && ev.resumeAt) || null,
      }
      break
    case 'subagent_delivered': {
      const delivery = parseSubagentNotice(ev.notice ?? '')
      if (delivery && !delivery.silent) {
        next = appendNotice(next, deliveryLine(delivery, options.words), delivery.body || undefined)
      }
      break
    }
    case 'done': {
      const turnEnd =
        ev.turnEnd && options.words
          ? options.words.turnEnd(
              ev.turnEnd,
              turnVerb(ev.turnEnd.endedAt),
              (ev.turnEnd.pendingAgents ?? 0) > 0,
            )
          : null
      // The line ends the turn it closes, as the terminal draws it.
      if (turnEnd) {
        next = appendNotice(next, turnEnd)
      }
      next = finishTurn(next)
      // Daemons before user_note took the text without saying where it
      // landed; by the turn's clean end it has been read.
      if (next.steered.length > 0) {
        next = {
          ...next,
          messages: [...next.messages, ...next.steered],
          steered: [],
        }
      }
      break
    }
    case 'goal': {
      const text = goalText(ev.goalProgress, options.goalNotice)
      if (text) {
        next = appendNotice(next, text, goalDetail(ev.goalProgress, options.words) ?? undefined)
      }
      break
    }
    case 'recap': {
      const text = recapText(ev.content, options.recapNotice)
      if (text) {
        next = appendNotice(next, text)
      }
      break
    }
    case 'notice':
    case 'warning':
      if (ev.recorded) {
        next = placeSessionNotice(next, ev.content ?? '', ev.type)
      }
      break
    default:
      break
  }
  return { state: next, effects: controlEffects(ev) }
}
