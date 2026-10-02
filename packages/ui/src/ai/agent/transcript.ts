// The transcript-shaping rules of a terminal coding agent, so a replayed
// history renders the same blocks the terminal draws.
import { clip, sanitizeLabel } from './toolfmt'

// TodoWrite's plan pins above the composer instead; a block too would repeat
// it on every update. ExitPlanMode's whole argument is the plan, rendered as
// its own block. AskUserQuestion's answer arrives in the following tool result.
const HIDDEN_TRANSCRIPT_TOOLS = new Set(['AskUserQuestion', 'TodoWrite', 'ExitPlanMode'])

export function hiddenTranscriptTool(name: string): boolean {
  return HIDDEN_TRANSCRIPT_TOOLS.has(name)
}

function parseArgs(argsJSON: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(argsJSON)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

export function askQuestionFromArgs(argsJSON: string): string {
  return str(parseArgs(argsJSON)['question'])
}

export function planFromArgs(argsJSON: string): string {
  return str(parseArgs(argsJSON)['plan'])
}

/** A Task call's display label the way the tool itself picks it: the
 *  description, else the clipped prompt, plus its custom agent type. */
export function taskCallFromArgs(argsJSON: string): {
  description: string
  agentType: string
} {
  const a = parseArgs(argsJSON)
  const description = str(a['description']) || clip(str(a['prompt']), 40)
  return {
    description: sanitizeLabel(description),
    agentType: agentTypeLabel(str(a['subagent_type'])),
  }
}

/** The built-in "default" type is the same general-purpose agent an untyped
 *  Task spawns, so naming it would only add noise. */
export function agentTypeLabel(t: string): string {
  return t === 'default' ? '' : sanitizeLabel(t)
}

/** The first line when the model wrote it as a heading ("# Title" or
 *  "**Title**"), the way reasoning summaries open, so a folded thought says
 *  what it was about. Prose gets no label of its own. */
export function thinkingHeading(raw: string): string {
  const first = raw.trim().split('\n')[0]?.trim() ?? ''
  let line: string
  if (first.startsWith('#')) {
    line = first.replace(/^#+/, '').trim()
  } else if (first.length > 4 && first.startsWith('**') && first.endsWith('**')) {
    line = first.slice(2, -2).trim()
  } else {
    return ''
  }
  return clip(sanitizeLabel(line), 60)
}

const INTERRUPTED_MARKER = '[Request interrupted by the user.]'

/** How a turn cut short reads, whether replayed or watched live. */
export const INTERRUPTED_NOTICE = INTERRUPTED_MARKER.slice(1, -1)

/** The line the daemon files as the assistant's when a turn is cut short;
 *  it is a status, not something the model said. */
export function interruptionNotice(text: string): string | null {
  return text.trim() === INTERRUPTED_MARKER ? INTERRUPTED_NOTICE : null
}

export function firstNonEmptyLine(text: string, max: number): string {
  for (const line of text.split('\n')) {
    const s = line.trim()
    if (s !== '') {
      return clip(s, max)
    }
  }
  return ''
}

export interface SubagentNotice {
  id: string
  description: string
  preview: string
  /** The report itself, without the closing line addressed to the model. */
  body: string
  interim: boolean
  /** The interrupted form is written for the model alone; the child's own
   *  block already reads interrupted, so no line is drawn for it. */
  silent: boolean
}

const SUBAGENT_NOTICE_HEADS = new Set(['Background subagent', 'Message from subagent'])

/** Reads a "[Background subagent <id> (<desc>) completed]" header; null for
 *  any other notice, which keeps its full text. */
export function parseSubagentNotice(text: string): SubagentNotice | null {
  const trimmed = text.trim()
  const nl = trimmed.indexOf('\n')
  let head = nl === -1 ? trimmed : trimmed.slice(0, nl)
  let body = nl === -1 ? '' : trimmed.slice(nl + 1)
  if (!head.startsWith('[') || !head.endsWith(']')) {
    return null
  }
  head = head.slice(1, -1)
  let shell = false
  let kind: string
  let rest: string
  const sub = head.indexOf(' subagent ')
  if (sub !== -1 && SUBAGENT_NOTICE_HEADS.has(`${head.slice(0, sub)} subagent`)) {
    kind = head.slice(0, sub)
    rest = head.slice(sub + ' subagent '.length)
  } else {
    const cmd = head.indexOf(' command ')
    if (cmd === -1 || head.slice(0, cmd) !== 'Background') {
      return null
    }
    kind = 'Background'
    rest = head.slice(cmd + ' command '.length)
    shell = true
  }
  const open = rest.indexOf(' (')
  if (open === -1) {
    return null
  }
  const id = rest.slice(0, open)
  rest = rest.slice(open + 2)
  // A spawner-chosen description may hold its own parentheses, so the
  // header's closer is the last one, not the first.
  const end = rest.lastIndexOf(')')
  if (end === -1) {
    return null
  }
  const tail = rest.slice(end + 1)
  const notice: SubagentNotice = {
    id,
    description: rest.slice(0, end),
    interim: kind === 'Message from',
    silent: tail.includes('was interrupted'),
    preview: '',
    body: '',
  }
  if (shell) {
    notice.preview = tail.trim()
    return notice
  }
  // The closing "(pass <id> as task_id …)" line is addressed to the model.
  const lines = body.split('\n')
  const last = lines[lines.length - 1] ?? ''
  if (lines.length > 0 && last.trim().startsWith('(pass ')) {
    body = lines.slice(0, -1).join('\n')
  }
  notice.body = body.trim()
  notice.preview = firstNonEmptyLine(body, 70)
  return notice
}

/** The line that marks a child's report entering the main conversation. */
export function subagentDeliveryLine(n: SubagentNotice): string {
  const name = n.description ? `${n.id} (${n.description})` : n.id
  let label = n.interim ? `↳ message from ${name}` : `↳ ${name} reported back`
  if (n.preview) {
    label += `: ${sanitizeLabel(n.preview)}`
  }
  return label
}
