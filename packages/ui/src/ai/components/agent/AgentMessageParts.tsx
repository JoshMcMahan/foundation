import cx from 'classnames'
import { useEffect, useMemo, useState } from 'react'
import { useCssIsDark } from '../../../components/useCssIsDark'
import { CheckIcon, ChevronRightIcon, LoaderIcon } from '../../../icons'
import { LogViewer } from '../../../logviewer/index'
import {
  computeEditDiff,
  computeWriteRows,
  type DiffRow,
  editSummary,
  isEditDiffTool,
  parseEditArgs,
} from '../../agent/diff'
import { type DiffToken, languageForPath, tokenizeDiffLines } from '../../agent/diffHighlight'
import {
  agentColorHex,
  bashExitCode,
  fullToolArgs,
  isGroupableTool,
  rollupSentence,
  summarizeToolArgs,
  toolHeaderFor,
  toolSummary,
} from '../../agent/toolfmt'
import { thinkingHeading } from '../../agent/transcript'
import { type PartRendererProps, useChatConfig } from '../../core/config'
import type {
  ApprovalPart,
  MessagePart,
  NoticePart,
  ReasoningPart,
  SubagentPart,
  TextPart,
  TodoSnapshotPart,
  ToolCallPart,
} from '../../types'
import Markdown from '../../ui/Markdown'
import { chatProseClasses } from '../../ui/prose'

const COLLAPSED_RESULT_LINES = 12

// Splits one line's syntax tokens (or the plain text) at the emphasis
// boundaries so changed words get the brighter band without breaking colors.
function LineSpans({
  text,
  tokens,
  emphasis,
}: {
  text: string
  tokens?: DiffToken[] | undefined
  emphasis?: Array<[number, number]> | undefined
}) {
  const pieces = tokens ?? [{ content: text }]
  if (!emphasis || emphasis.length === 0) {
    return (
      <>
        {pieces.map((t, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: tokens are positional
          <span key={i} style={t.color ? { color: t.color } : undefined}>
            {t.content}
          </span>
        ))}
      </>
    )
  }
  const inEmphasis = (pos: number) => emphasis.some(([a, b]) => pos >= a && pos < b)
  const out: React.ReactNode[] = []
  let offset = 0
  let key = 0
  for (const t of pieces) {
    let start = 0
    while (start < t.content.length) {
      const abs = offset + start
      const emphasized = inEmphasis(abs)
      let end = start + 1
      while (end < t.content.length && inEmphasis(offset + end) === emphasized) {
        end++
      }
      out.push(
        <span
          key={key++}
          className={emphasized ? 'bg-green-500/30 rounded-[2px]' : undefined}
          style={t.color ? { color: t.color } : undefined}
        >
          {t.content.slice(start, end)}
        </span>,
      )
      start = end
    }
    offset += t.content.length
  }
  return <>{out}</>
}

function DiffRows({ rows, lang }: { rows: DiffRow[]; lang: string | null }) {
  const isDark = useCssIsDark()
  const [tokens, setTokens] = useState<DiffToken[][] | null>(null)
  const lineKey = useMemo(
    () => rows.map((r) => (r.kind === 'gap' ? '' : r.text)).join('\n'),
    [rows],
  )
  useEffect(() => {
    if (!lang) {
      setTokens(null)
      return
    }
    let live = true
    tokenizeDiffLines(lineKey.split('\n'), lang, isDark).then((t) => {
      if (live) {
        setTokens(t)
      }
    })
    return () => {
      live = false
    }
  }, [lang, lineKey, isDark])
  const numbered = rows.some((r) => r.oldNo !== undefined || r.newNo !== undefined)
  return (
    <div className="overflow-x-auto rounded-md border theme-border font-mono text-xs leading-5">
      {rows.map((row, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
          key={i}
          className={cx(
            'flex whitespace-pre',
            row.kind === 'add' && 'bg-green-500/15',
            row.kind === 'del' && 'bg-red-500/15',
            row.kind === 'gap' && 'theme-muted-text',
          )}
        >
          {numbered && (
            <span className="w-10 shrink-0 select-none text-right pr-2 theme-muted-text">
              {row.kind === 'gap' ? '⋯' : (row.newNo ?? row.oldNo ?? '')}
            </span>
          )}
          <span className="w-4 shrink-0 select-none text-center">
            {row.kind === 'add' ? '+' : row.kind === 'del' ? '-' : ' '}
          </span>
          <span className="pr-3">
            {row.kind === 'gap' ? (
              ''
            ) : (
              <LineSpans
                text={row.text}
                tokens={tokens?.[i]}
                emphasis={row.kind === 'add' ? row.emphasis : undefined}
              />
            )}
          </span>
        </div>
      ))}
    </div>
  )
}

function EditDiffBlock({ part }: { part: ToolCallPart }) {
  const { strings } = useChatConfig()
  const t = strings.agentTranscript
  const a = parseEditArgs(part.args)
  if (!a) {
    return null
  }
  const outcome = editSummary(part.name, part.args)
  const model =
    part.name === 'EditFile'
      ? computeEditDiff(a.old_string ?? '', a.new_string ?? '', part.startLine)
      : computeWriteRows(a.content ?? '')
  return (
    <div className="mt-1.5 space-y-1">
      {outcome && <div className="text-xs theme-muted-text">{outcome}</div>}
      <DiffRows rows={model.rows} lang={languageForPath(a.path)} />
      {model.truncated && <div className="text-xs theme-muted-text">{t.diffTruncated}</div>}
    </div>
  )
}

function ResultBody({ part }: { part: ToolCallPart }) {
  const { strings } = useChatConfig()
  const t = strings.agentTranscript
  const [showAll, setShowAll] = useState(false)
  const result = part.result ?? ''
  if (result.trim() === '') {
    return <div className="text-xs theme-muted-text">{t.noOutput}</div>
  }
  if (part.name === 'Bash') {
    const [out] = bashExitCode(result.replace(/\n+$/, ''))
    return (
      <div className="rounded-md overflow-hidden border theme-border">
        <LogViewer
          log={out || result}
          width="100%"
          height="unset"
          inline
          lineNumbers={false}
          hideExpand
        />
      </div>
    )
  }
  const lines = result.replace(/\n+$/, '').split('\n')
  const shown = showAll ? lines : lines.slice(0, COLLAPSED_RESULT_LINES)
  const hidden = lines.length - shown.length
  return (
    <div className="space-y-1">
      <pre className="overflow-x-auto rounded-md border theme-border p-2 font-mono text-xs leading-5 whitespace-pre">
        {shown.join('\n')}
      </pre>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="text-xs text-(--theme-link) hover:underline"
        >
          {t.moreLines.replace('{count}', String(hidden))}
        </button>
      )}
      {showAll && lines.length > COLLAPSED_RESULT_LINES && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="text-xs text-(--theme-link) hover:underline"
        >
          {t.showLess}
        </button>
      )}
    </div>
  )
}

function ToolStatusDot({ part }: { part: ToolCallPart }) {
  if (part.status === 'running') {
    return <LoaderIcon className="w-3.5 h-3.5 animate-spin theme-muted-text" />
  }
  if (part.status === 'error') {
    return <span className="text-red-500 leading-none">●</span>
  }
  return <span className="text-green-600 leading-none">●</span>
}

export function ToolCallBlock({ part }: { part: ToolCallPart }) {
  const { strings } = useChatConfig()
  const t = strings.agentTranscript
  const [expanded, setExpanded] = useState(false)
  const header = toolHeaderFor(part.name)
  const argSummary = summarizeToolArgs(header.arg, part.args)
  const isDiff = isEditDiffTool(part.name)
  const summary =
    part.status === 'running'
      ? t.running
      : toolSummary(part.name, part.args, part.result ?? '', part.status === 'error', editSummary)
  return (
    <div className="py-1.5 text-sm" data-testid="tool-call-part">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex min-h-6 items-start gap-2 w-full text-left group/tool"
      >
        <ToolStatusDot part={part} />
        <span className="font-mono text-[13px] leading-5 min-w-0 truncate">
          <span className="font-semibold">{header.label}</span>
          {argSummary && <span className="theme-muted-text">({argSummary})</span>}
        </span>
        <ChevronRightIcon
          className={cx(
            'w-3.5 h-3.5 mt-1 shrink-0 theme-muted-text transition-transform',
            expanded && 'rotate-90',
          )}
        />
      </button>
      {!isDiff && (
        <div
          className={cx(
            'ml-5 mt-0.5 text-[13px]',
            part.status === 'error' ? 'text-red-600' : 'theme-muted-text',
          )}
        >
          {expanded ? null : summary}
        </div>
      )}
      {expanded && !isDiff && (
        <div className="ml-5 mt-1 space-y-1.5">
          {fullToolArgs(header.arg, part.args) && (
            <pre className="overflow-x-auto rounded-md bg-(--theme-muted-panel-bg) p-2 font-mono text-xs whitespace-pre-wrap">
              {fullToolArgs(header.arg, part.args)}
            </pre>
          )}
          <ResultBody part={part} />
        </div>
      )}
      {isDiff && (
        <div className="ml-5">
          <EditDiffBlock part={part} />
        </div>
      )}
    </div>
  )
}

/** Drawn the way the TUI draws a delegated Task: a tool-shaped header
 *  `Task(description)`, and under it the latest action while running or
 *  `Done (summary)` once finished. Expanding shows the whole activity feed. */
export function SubagentCard({ part }: { part: SubagentPart }) {
  const { strings } = useChatConfig()
  const t = strings.agentTranscript
  const [expanded, setExpanded] = useState(false)
  const color = agentColorHex(part.color)
  const label = part.agentType && part.agentType !== 'default' ? part.agentType : t.subagent
  const actions = part.actions ?? []
  const latest = actions[actions.length - 1]
  const canExpand = actions.length > 0 || !!part.report
  const outcome =
    part.status === 'running'
      ? latest || t.running
      : `${part.status === 'done' ? t.done : t.failed}${part.summary ? ` (${part.summary})` : ''}`
  return (
    <div className="py-1.5 text-sm" data-testid="subagent-part">
      <button
        type="button"
        onClick={() => canExpand && setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex min-h-6 items-start gap-2 w-full text-left"
      >
        {part.status === 'running' ? (
          <LoaderIcon className="w-3.5 h-3.5 mt-[3px] animate-spin theme-muted-text" />
        ) : (
          <span
            className={cx(
              'leading-none',
              part.status === 'failed' ? 'text-red-500' : 'text-green-600',
            )}
            style={color && part.status !== 'failed' ? { color } : undefined}
          >
            ●
          </span>
        )}
        <span className="font-mono text-[13px] leading-5 min-w-0 truncate">
          <span className="font-semibold">{label}</span>
          {part.description && <span className="theme-muted-text">({part.description})</span>}
        </span>
        {canExpand && (
          <ChevronRightIcon
            className={cx(
              'w-3.5 h-3.5 mt-1 shrink-0 theme-muted-text transition-transform',
              expanded && 'rotate-90',
            )}
          />
        )}
      </button>
      <div
        className={cx(
          'ml-5 mt-0.5 text-[13px]',
          part.status === 'failed' ? 'text-red-600' : 'theme-muted-text',
        )}
      >
        {expanded ? (
          <div className="space-y-1">
            {actions.length > 0 && (
              <ul className="space-y-0.5">
                {actions.map((a, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: feed is append-only
                  <li key={i}>{a}</li>
                ))}
                {part.status !== 'running' && <li>{outcome}</li>}
              </ul>
            )}
            {part.report && (
              <div className="border-l-2 theme-border pl-3 text-sm theme-muted-text">
                <Markdown>{part.report}</Markdown>
              </div>
            )}
          </div>
        ) : (
          outcome
        )}
      </div>
    </div>
  )
}

function ConfirmApproval({
  part,
  onAnswer,
}: {
  part: ApprovalPart
  onAnswer?: PartRendererProps['onApprovalAnswer']
}) {
  const { strings } = useChatConfig()
  const t = strings.agentTranscript
  const [feedback, setFeedback] = useState<string | null>(null)
  const answer = (a: Parameters<NonNullable<typeof onAnswer>>[1]) => onAnswer?.(part.id, a)
  return (
    <>
      {part.command && (
        <pre className="overflow-x-auto rounded-md bg-(--theme-muted-panel-bg) p-2 font-mono text-xs whitespace-pre-wrap">
          {part.command}
        </pre>
      )}
      {part.reason && <div className="text-xs theme-muted-text">{part.reason}</div>}
      {!onAnswer ? (
        <div className="text-xs theme-muted-text">{t.approvalPending}</div>
      ) : feedback === null ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => answer({ kind: 'confirm', allowed: true })}
            className="px-3 py-1 text-xs font-medium rounded-full bg-(--theme-element) text-(--theme-element-text)"
          >
            {t.allowOnce}
          </button>
          {part.canAllowDirectory !== false && (
            <button
              type="button"
              onClick={() => answer({ kind: 'confirm', allowed: true, allowDir: true })}
              className="px-3 py-1 text-xs font-medium rounded-full border theme-border hover:theme-hover"
            >
              {t.allowDirectory}
            </button>
          )}
          <button
            type="button"
            onClick={() => answer({ kind: 'confirm', allowed: false })}
            className="px-3 py-1 text-xs font-medium rounded-full border theme-border hover:theme-hover text-red-600"
          >
            {t.deny}
          </button>
          <button
            type="button"
            onClick={() => setFeedback('')}
            className="px-3 py-1 text-xs font-medium rounded-full border theme-border hover:theme-hover"
          >
            {t.denyWithFeedback}
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder={t.feedbackPlaceholder}
            className="flex-1 text-xs rounded-md border theme-border bg-(--theme-input-bg) px-2 py-1"
          />
          <button
            type="button"
            disabled={!feedback.trim()}
            onClick={() =>
              answer({
                kind: 'confirm',
                allowed: false,
                denyMessage: feedback.trim(),
              })
            }
            className="px-3 py-1 text-xs font-medium rounded-full bg-(--theme-element) text-(--theme-element-text) disabled:opacity-50"
          >
            {t.send}
          </button>
        </div>
      )}
    </>
  )
}

function AskApproval({
  part,
  onAnswer,
}: {
  part: ApprovalPart
  onAnswer?: PartRendererProps['onApprovalAnswer']
}) {
  const { strings } = useChatConfig()
  const t = strings.agentTranscript
  const [own, setOwn] = useState<string | null>(null)
  const answer = (text: string) => onAnswer?.(part.id, { kind: 'ask', text })
  if (!onAnswer) {
    return (
      <>
        {part.question && <div className="text-sm">{part.question}</div>}
        {(part.options ?? []).length > 0 && (
          <div className="text-xs theme-muted-text">
            <span className="font-medium">{t.approvalOptions}: </span>
            {(part.options ?? []).map((o) => o.label).join(' · ')}
          </div>
        )}
        <div className="text-xs theme-muted-text">{t.approvalPending}</div>
      </>
    )
  }
  return (
    <>
      {part.question && <div className="text-sm">{part.question}</div>}
      {own === null ? (
        <div className="flex flex-col items-start gap-1.5">
          {(part.options ?? []).map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => answer(o.label)}
              className="px-3 py-1 text-xs font-medium rounded-full border theme-border hover:theme-hover text-left"
              title={o.description}
            >
              {o.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setOwn('')}
            className="px-3 py-1 text-xs rounded-full theme-muted-text hover:theme-hover"
          >
            {t.writeOwnAnswer}
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            value={own}
            onChange={(e) => setOwn(e.target.value)}
            className="flex-1 text-xs rounded-md border theme-border bg-(--theme-input-bg) px-2 py-1"
          />
          <button
            type="button"
            disabled={!own.trim()}
            onClick={() => answer(own.trim())}
            className="px-3 py-1 text-xs font-medium rounded-full bg-(--theme-element) text-(--theme-element-text) disabled:opacity-50"
          >
            {t.send}
          </button>
        </div>
      )}
    </>
  )
}

export function ApprovalBlock({
  part,
  onApprovalAnswer,
}: {
  part: ApprovalPart
  onApprovalAnswer?: PartRendererProps['onApprovalAnswer']
}) {
  const { strings } = useChatConfig()
  const t = strings.agentTranscript
  if (part.resolved) {
    return (
      <div
        className="my-1.5 rounded-lg border theme-border p-2.5 text-xs theme-muted-text space-y-1"
        data-testid="approval-part"
      >
        {part.question && <div className="theme-text">{part.question}</div>}
        <div className="flex items-center gap-2">
          <CheckIcon className="w-3.5 h-3.5" />
          <span>
            {t.answered}
            {part.answer ? `: ${part.answer}` : ''}
          </span>
        </div>
      </div>
    )
  }
  return (
    <div
      className="my-1.5 rounded-lg border border-(--theme-element) p-3 space-y-2"
      data-testid="approval-part"
    >
      {(part.header || part.toolName) && (
        <div className="text-xs font-semibold">{part.header ?? part.toolName}</div>
      )}
      {part.approvalKind === 'confirm' ? (
        <ConfirmApproval part={part} onAnswer={onApprovalAnswer} />
      ) : part.approvalKind === 'plan' ? (
        <PlanApproval part={part} />
      ) : (
        <AskApproval part={part} onAnswer={onApprovalAnswer} />
      )}
    </div>
  )
}

// A plan awaiting approval is read-only here; answering stays with the session's terminal.
function PlanApproval({ part }: { part: ApprovalPart }) {
  const { strings } = useChatConfig()
  const t = strings.agentTranscript
  return (
    <>
      <div className="text-xs theme-muted-text">{t.planPending}</div>
      {part.plan && (
        <div className="prose prose-sm max-w-none rounded-md bg-(--theme-muted-panel-bg) p-2 text-(--theme-panel)">
          <Markdown isStreaming={false}>{part.plan}</Markdown>
        </div>
      )}
    </>
  )
}

export function TodoSnapshotBlock({ part }: { part: TodoSnapshotPart }) {
  const { strings } = useChatConfig()
  const t = strings.agentTranscript
  return (
    <div className="my-1.5 rounded-lg border theme-border p-2.5" data-testid="todo-part">
      <div className="text-xs font-semibold theme-muted-text mb-1">{t.tasks}</div>
      <ul className="space-y-0.5 text-sm">
        {part.todos.map((todo) => (
          <li
            key={todo.content}
            className={cx(
              'flex items-start gap-2',
              todo.status === 'completed' && 'line-through theme-muted-text',
              todo.status === 'in_progress' && 'font-semibold',
            )}
          >
            <span className="select-none font-mono">
              {todo.status === 'completed' ? '✔' : todo.status === 'in_progress' ? '■' : '□'}
            </span>
            <span>
              {todo.status === 'in_progress' && todo.activeForm ? todo.activeForm : todo.content}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

export function NoticeBlock({ part }: { part: NoticePart }) {
  const [expanded, setExpanded] = useState(false)
  if (part.kind === 'notice') {
    if (!part.detail) {
      return (
        <div
          className="my-1.5 whitespace-pre-wrap text-[13px] theme-muted-text"
          data-testid="notice-part"
        >
          {part.text}
        </div>
      )
    }
    return (
      <div className="my-1.5" data-testid="notice-part">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex items-start gap-1.5 text-left text-[13px] theme-muted-text hover:theme-text"
        >
          <span className="min-w-0 flex-1 whitespace-pre-wrap">{part.text}</span>
          <ChevronRightIcon
            className={cx(
              'mt-0.5 h-3.5 w-3.5 shrink-0 transition-transform',
              expanded && 'rotate-90',
            )}
          />
        </button>
        {expanded && (
          <div className="ml-4 mt-1 border-l-2 theme-border pl-3 text-sm theme-muted-text">
            <Markdown>{part.detail}</Markdown>
          </div>
        )}
      </div>
    )
  }
  return (
    <div
      className={cx(
        'my-1 text-xs rounded-md px-2.5 py-1.5',
        part.kind === 'error' ? 'bg-red-500/10 text-red-700' : 'bg-yellow-500/10 text-yellow-700',
      )}
      data-testid={`${part.kind}-part`}
    >
      {part.text}
    </div>
  )
}

function formatThinkingDuration(ms: number): string {
  const s = Math.round(ms / 1000)
  if (s < 1) {
    return '<1s'
  }
  if (s < 60) {
    return `${s}s`
  }
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

/** The TUI's thought: the body shows while it streams, then folds to its
 *  label and opens on request. The composer's activity line carries the
 *  live signal, so nothing here animates. */
export function ReasoningBlock({
  part,
  isStreaming,
}: {
  part: ReasoningPart
  isStreaming?: boolean
}) {
  const { strings } = useChatConfig()
  const t = strings.thinking
  const [expanded, setExpanded] = useState(false)
  const label =
    thinkingHeading(part.text) ||
    (part.durationMs ? t.thoughtFor(formatThinkingDuration(part.durationMs)) : t.label)
  const hasBody = part.text.trim() !== ''
  const body = hasBody && (
    <div
      className="ml-1 border-l theme-border pl-3 text-sm theme-muted-text"
      data-testid="reasoning-body"
    >
      <Markdown isStreaming={isStreaming ?? false}>{part.text}</Markdown>
    </div>
  )
  if (isStreaming) {
    return (
      <div className="py-1.5" data-testid="reasoning-part">
        {body}
      </div>
    )
  }
  return (
    <div className="py-1.5" data-testid="reasoning-part">
      <button
        type="button"
        onClick={() => hasBody && setExpanded((v) => !v)}
        aria-expanded={expanded}
        className={cx(
          'flex min-h-6 items-center gap-x-1 text-sm theme-muted-text transition-colors',
          hasBody && 'hover:theme-text',
        )}
      >
        <span>{label}</span>
        {hasBody && (
          <ChevronRightIcon
            className={cx('w-3.5 h-3.5 transition-transform', expanded && 'rotate-90')}
          />
        )}
      </button>
      {expanded && <div className="mt-1.5">{body}</div>}
    </div>
  )
}

function TextBlock({ part, isStreaming }: { part: TextPart; isStreaming?: boolean }) {
  return (
    <div className={cx(chatProseClasses, '[&:not(:first-child)]:mt-4')}>
      <Markdown isStreaming={isStreaming ?? false}>{part.text}</Markdown>
    </div>
  )
}

function PartDispatch(props: PartRendererProps) {
  const { slots } = useChatConfig()
  const Override = slots.partRenderers?.[props.part.kind]
  if (Override) {
    return <Override {...props} />
  }
  const { part } = props
  switch (part.kind) {
    case 'text':
      return <TextBlock part={part} isStreaming={props.isStreaming ?? false} />
    case 'reasoning':
      return <ReasoningBlock part={part} isStreaming={props.isStreaming ?? false} />
    case 'tool_call':
      return <ToolCallBlock part={part} />
    case 'subagent':
      return <SubagentCard part={part} />
    case 'approval':
      return <ApprovalBlock part={part} onApprovalAnswer={props.onApprovalAnswer} />
    case 'notice':
    case 'warning':
    case 'error':
      return <NoticeBlock part={part} />
    case 'todo_snapshot':
      return <TodoSnapshotBlock part={part} />
    default:
      return null
  }
}

type RunMember = { part: ToolCallPart | ReasoningPart; index: number }

type RenderItem =
  | { kind: 'single'; part: MessagePart; index: number }
  // Adjacent thoughts drawn as one line, labelled by the first.
  | { kind: 'reasoning'; parts: ReasoningPart[]; index: number }
  | { kind: 'rollup'; members: RunMember[] }

function isReasoning(m: RunMember): m is { part: ReasoningPart; index: number } {
  return m.part.kind === 'reasoning'
}

/** Two thoughts with nothing visible between them read as one, not as a
 *  stack of identical lines. */
export function mergeReasoning(parts: ReasoningPart[]): ReasoningPart {
  const durationMs = parts.reduce((sum, p) => sum + (p.durationMs ?? 0), 0)
  return {
    kind: 'reasoning',
    text: parts.map((p) => p.text).join('\n\n'),
    ...(durationMs > 0 ? { durationMs } : {}),
  }
}

// Folds runs of two or more consecutive, finished, groupable tool calls into
// one rollup row; failed or still-running members never fold, and standalone
// kinds (edits, todos, subagents) break the run. A thought between two calls
// folds into the run with the work it preceded; the thoughts before and after
// a run keep their own line — mirrors the TUI.
export function buildRenderItems(parts: MessagePart[]): RenderItem[] {
  const items: RenderItem[] = []
  let run: RunMember[] = []
  const emitThoughts = (members: RunMember[]) => {
    if (members.length > 0) {
      items.push({
        kind: 'reasoning',
        parts: members.map((m) => m.part as ReasoningPart),
        index: members[0]?.index ?? 0,
      })
    }
  }
  const emitLoose = (members: RunMember[]) => {
    let thoughts: RunMember[] = []
    for (const m of members) {
      if (isReasoning(m)) {
        thoughts.push(m)
        continue
      }
      emitThoughts(thoughts)
      thoughts = []
      items.push({ kind: 'single', part: m.part, index: m.index })
    }
    emitThoughts(thoughts)
  }
  const flush = () => {
    let start = 0
    while (start < run.length && isReasoning(run[start]!)) {
      start++
    }
    let end = run.length
    while (end > start && isReasoning(run[end - 1]!)) {
      end--
    }
    emitThoughts(run.slice(0, start))
    const core = run.slice(start, end)
    if (core.filter((m) => !isReasoning(m)).length >= 2) {
      items.push({ kind: 'rollup', members: core })
    } else {
      emitLoose(core)
    }
    emitThoughts(run.slice(end))
    run = []
  }
  parts.forEach((part, index) => {
    if (
      part.kind === 'reasoning' ||
      (part.kind === 'tool_call' && part.status === 'ok' && isGroupableTool(part.name))
    ) {
      run.push({ part, index })
      return
    }
    flush()
    items.push({ kind: 'single', part, index })
  })
  flush()
  return items
}

function RollupGroup({
  members,
  message,
}: {
  members: RunMember[]
  message: PartRendererProps['message']
}) {
  const [expanded, setExpanded] = useState(false)
  const sentence = rollupSentence(
    members.flatMap((m) => (m.part.kind === 'tool_call' ? [m.part.name] : [])),
  )
  return (
    <div className="py-1.5 text-sm" data-testid="tool-rollup">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex min-h-6 items-center gap-2 w-full text-left"
      >
        <span className="text-green-600 leading-none" aria-hidden="true">
          ●
        </span>
        <span className="font-mono text-[13px] theme-muted-text min-w-0 truncate">{sentence}</span>
        <ChevronRightIcon
          className={cx(
            'w-3.5 h-3.5 shrink-0 theme-muted-text transition-transform',
            expanded && 'rotate-90',
          )}
        />
      </button>
      {/* Members stay mounted so their own expand state survives refolding. */}
      <div
        className={cx(
          'ml-1.5 mt-0.5 rounded-md',
          expanded ? 'bg-(--theme-muted-panel-bg)/40 px-2' : 'hidden',
        )}
      >
        {members.map((m) => (
          <PartDispatch key={m.index} part={m.part} message={message} />
        ))}
      </div>
    </div>
  )
}

export default function AgentMessageParts({
  message,
  isStreaming,
  onApprovalAnswer,
}: {
  message: PartRendererProps['message']
  isStreaming?: boolean
  onApprovalAnswer?: PartRendererProps['onApprovalAnswer']
}) {
  const parts = message.parts ?? []
  const items = useMemo(() => buildRenderItems(parts), [parts])
  const lastIndex = parts.length - 1
  return (
    <div className="w-full" data-testid="agent-parts">
      {items.map((item) =>
        item.kind === 'rollup' ? (
          <RollupGroup key={item.members[0]?.index ?? 0} members={item.members} message={message} />
        ) : item.kind === 'reasoning' ? (
          <ReasoningBlock
            key={item.index}
            part={mergeReasoning(item.parts)}
            isStreaming={(isStreaming ?? false) && item.index + item.parts.length - 1 === lastIndex}
          />
        ) : (
          <PartDispatch
            key={item.index}
            part={item.part}
            message={message}
            isStreaming={(isStreaming ?? false) && item.index === lastIndex}
            {...(onApprovalAnswer ? { onApprovalAnswer } : {})}
          />
        ),
      )}
    </div>
  )
}
