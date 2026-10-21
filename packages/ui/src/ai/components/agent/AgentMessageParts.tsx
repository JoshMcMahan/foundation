import { DateTime } from 'luxon'
import { memo, type ReactNode, useEffect, useId, useMemo, useState } from 'react'
import { Disclosure } from '../../../components/Disclosure'
import { fieldBox } from '../../../components/fieldBox'
import { focusOnMount } from '../../../components/focus'
import { Loader } from '../../../components/Loader'
import { useStrings } from '../../../components/Provider'
import { RelativeTime } from '../../../components/relativeTime'
import { toneSurface } from '../../../components/tone'
import { cx } from '../../../cx'
import { formatDuration } from '../../../format'
import { CheckIcon } from '../../../icons'
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
  rollupClauses,
  summarizeToolArgs,
  toolHeaderFor,
  toolSummary,
} from '../../agent/toolfmt'
import { thinkingHeading } from '../../agent/transcript'
import { type PartRendererProps, useChatConfig } from '../../core/config'
import type { ChatStrings } from '../../strings'
import type {
  ApprovalPart,
  MessagePart,
  NoticePart,
  ReasoningPart,
  SubagentPart,
  TextPart,
  TodoSnapshotPart,
  ToolCallPart,
  ToolDecision,
} from '../../types'
import Markdown from '../../ui/Markdown'
import { chatProseClasses } from '../../ui/prose'
import { Reasoning, ReasoningBody } from '../Reasoning'

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
          className={emphasized ? 'bg-(--theme-success)/30 rounded-[2px]' : undefined}
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
    tokenizeDiffLines(lineKey.split('\n'), lang).then((t) => {
      if (live) {
        setTokens(t)
      }
    })
    return () => {
      live = false
    }
  }, [lang, lineKey])
  const numbered = rows.some((r) => r.oldNo !== undefined || r.newNo !== undefined)
  return (
    <div className="overflow-x-auto rounded-md border theme-border font-mono text-xs leading-5">
      {rows.map((row, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: rows are positional
          key={i}
          className={cx(
            'flex whitespace-pre',
            row.kind === 'add' && 'bg-(--theme-success)/15',
            row.kind === 'del' && 'bg-(--theme-error)/15',
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
  // A streaming transcript re-renders this block on every token; the diff is
  // the costly part, so it runs once per edit.
  const diff = useMemo(() => {
    const a = parseEditArgs(part.args)
    if (!a) {
      return null
    }
    if (part.name === 'EditFile') {
      const model = computeEditDiff(a.old_string ?? '', a.new_string ?? '', part.startLine)
      // The model's counts are the whole edit's, so the outcome needs no second diff.
      return { a, model, outcome: strings.tools.edited(model.added, model.removed) }
    }
    return {
      a,
      model: computeWriteRows(a.content ?? ''),
      outcome: editSummary(part.name, part.args, strings.tools),
    }
  }, [part.name, part.args, part.startLine, strings.tools])
  if (!diff) {
    return null
  }
  const { a, model, outcome } = diff
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
  const { common } = useStrings()
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
          {t.moreLines(hidden)}
        </button>
      )}
      {showAll && lines.length > COLLAPSED_RESULT_LINES && (
        <button
          type="button"
          onClick={() => setShowAll(false)}
          className="text-xs text-(--theme-link) hover:underline"
        >
          {common.showLess}
        </button>
      )}
    </div>
  )
}

/** A status mark, which color alone tells apart, with its status in words for
 *  a screen reader. */
function StatusMark({ status, children }: { status: string; children: ReactNode }) {
  return (
    <>
      <span aria-hidden="true" className="contents">
        {children}
      </span>
      <span className="sr-only">{status}</span>
    </>
  )
}

function ToolStatusDot({ part }: { part: ToolCallPart }) {
  const t = useChatConfig().strings.agentTranscript
  if (part.status === 'running') {
    return (
      <StatusMark status={t.running}>
        <Loader inline decorative size={14} color="var(--theme-muted-text-color)" />
      </StatusMark>
    )
  }
  if (part.status === 'waiting') {
    return (
      <StatusMark status={t.approvalLabel}>
        <span className="leading-none text-(--theme-accent)">●</span>
      </StatusMark>
    )
  }
  if (part.status === 'error') {
    return (
      <StatusMark status={t.failed}>
        <span className="leading-none text-(--theme-error)">●</span>
      </StatusMark>
    )
  }
  return (
    <StatusMark status={t.done}>
      <span className="leading-none text-(--theme-success)">●</span>
    </StatusMark>
  )
}

/** A part's toggle row: its status mark and name, across the transcript's width. */
const rowSummaryClasses = 'min-h-6 w-full'

function RowSummary({ text }: { text: string | undefined }) {
  return text ? (
    <div className="ml-5 mt-0.5 truncate text-[13px] theme-muted-text">{text}</div>
  ) : null
}

/** A call's row: its status and signature, or the host's words for it, opening
 *  to its full arguments and result. `children` is a host's drawing of the
 *  call, shown under the row in place of the one-line summary, or inside it
 *  when the host names the call. */
function ToolCallBlock({ part, children }: { part: ToolCallPart; children?: ReactNode }) {
  const { strings, slots } = useChatConfig()
  const t = strings.agentTranscript
  const [expanded, setExpanded] = useState(false)
  const presentation = slots.toolPresentation?.(part)
  // A named call keeps its drawing behind the row unless the host keeps it
  // open; a call waiting on an answer always shows what it asks.
  const drawingInPanel =
    !!children && !!presentation && !presentation.open && part.status !== 'waiting'
  const header = toolHeaderFor(part.name)
  const argSummary = summarizeToolArgs(header.arg, part.args)
  const isDiff = isEditDiffTool(part.name)
  // An edit's summary diffs its strings, so it is worked out once per change to
  // the part rather than on every render of a streaming transcript.
  const summary = useMemo(
    () =>
      part.status === 'running'
        ? t.running
        : toolSummary(part.name, part.args, part.result ?? '', part.status === 'error', {
            editSummary,
            strings: strings.tools,
          }),
    [part.status, part.name, part.args, part.result, t.running, strings.tools],
  )
  return (
    <div className="py-1.5 text-sm" data-testid="tool-call-part">
      <Disclosure
        open={expanded}
        onOpenChange={setExpanded}
        disabled={isDiff}
        summaryClassName={rowSummaryClasses}
        summary={
          <>
            <ToolStatusDot part={part} />
            {presentation ? (
              <span className="text-[13px] leading-5 min-w-0 truncate theme-text">
                {presentation.label}
              </span>
            ) : (
              <span className="font-mono text-[13px] leading-5 min-w-0 truncate">
                <span className="font-semibold">{header.label}</span>
                {argSummary && <span className="theme-muted-text">({argSummary})</span>}
              </span>
            )}
          </>
        }
        panelClassName="ml-5 mt-1 space-y-1.5"
      >
        {fullToolArgs(header.arg, part.args) && (
          <pre className="overflow-x-auto rounded-md bg-(--theme-muted-panel-bg) p-2 font-mono text-xs whitespace-pre-wrap">
            {presentation && <span className="font-semibold">{header.label} </span>}
            {fullToolArgs(header.arg, part.args)}
          </pre>
        )}
        {drawingInPanel ? <div className="min-w-0">{children}</div> : <ResultBody part={part} />}
      </Disclosure>
      {part.status === 'error' && !expanded && (
        <div className="ml-5 mt-0.5 truncate text-[13px] text-(--theme-error-text)">
          {t.failedWith(summary)}
        </div>
      )}
      {children && !drawingInPanel && <div className="mt-1.5 min-w-0 sm:ml-5">{children}</div>}
      {!isDiff &&
        !expanded &&
        part.status !== 'waiting' &&
        part.status !== 'error' &&
        (!children || drawingInPanel) && (
          // A drawn call's raw result is not a line to read; its host's summary is.
          <RowSummary
            text={
              part.status === 'running'
                ? summary
                : (presentation?.summary ?? (drawingInPanel ? undefined : summary))
            }
          />
        )}
      {isDiff && (
        <div className="ml-5">
          <EditDiffBlock part={part} />
        </div>
      )}
      {part.decision && <DecisionLine decision={part.decision} />}
    </div>
  )
}

function decisionLabel(d: ToolDecision, t: ChatStrings['agentTranscript']): string {
  switch (d.status) {
    case 'approved':
      if (d.by === 'auto-reviewer') {
        return t.allowedByReviewer
      }
      if (d.edited) {
        return d.name ? t.allowedWithChangesBy(d.name) : t.allowedWithChanges
      }
      return d.name ? t.allowedBy(d.name) : t.allowed
    case 'denied':
      if (d.by === 'auto-reviewer') {
        return t.deniedByReviewer
      }
      return d.name ? t.deniedBy(d.name) : t.denied
    case 'expired':
      return t.approvalExpired
    case 'timed_out':
      return d.by === 'auto-reviewer' ? t.reviewTimedOut : t.approvalTimedOut
    case 'failed':
      return d.by === 'auto-reviewer' ? t.reviewFailed : t.denied
  }
}

function DecisionLine({ decision }: { decision: ToolDecision }) {
  const { strings } = useChatConfig()
  return (
    <div className="ml-5 mt-0.5 text-xs theme-muted-text" data-testid="tool-decision">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-1">
        <span>{decisionLabel(decision, strings.agentTranscript)}</span>
        {decision.at && (
          <>
            <span aria-hidden="true">·</span>
            <RelativeTime value={decision.at} className="shrink-0" />
          </>
        )}
        {decision.note && (
          <>
            <span aria-hidden="true">·</span>
            <span className="min-w-0 max-w-full truncate">{decision.note}</span>
          </>
        )}
      </div>
      {decision.reason && <p className="mt-0.5 line-clamp-2">{decision.reason}</p>}
    </div>
  )
}

/** Drawn the way the TUI draws a delegated Task: a tool-shaped header
 *  `Task(description)`, and under it the latest action while running or
 *  `Done (summary)` once finished. Expanding shows the whole activity feed. */
function SubagentCard({ part }: { part: SubagentPart }) {
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
      <Disclosure
        open={expanded}
        onOpenChange={setExpanded}
        disabled={!canExpand}
        summaryClassName={rowSummaryClasses}
        summary={
          <>
            <StatusMark
              status={
                part.status === 'running' ? t.running : part.status === 'failed' ? t.failed : t.done
              }
            >
              {part.status === 'running' ? (
                <span className="mt-[3px]">
                  <Loader inline decorative size={14} color="var(--theme-muted-text-color)" />
                </span>
              ) : (
                <span
                  className={cx(
                    'leading-none',
                    part.status === 'failed' ? 'text-(--theme-error)' : 'text-(--theme-success)',
                  )}
                  style={color && part.status !== 'failed' ? { color } : undefined}
                >
                  ●
                </span>
              )}
            </StatusMark>
            <span className="font-mono text-[13px] leading-5 min-w-0 truncate">
              <span className="font-semibold">{label}</span>
              {part.description && <span className="theme-muted-text">({part.description})</span>}
            </span>
          </>
        }
        panelClassName={cx(
          'ml-5 mt-0.5 space-y-1 text-[13px]',
          part.status === 'failed' ? 'text-(--theme-error-text)' : 'theme-muted-text',
        )}
      >
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
      </Disclosure>
      {!expanded && (
        <div
          className={cx(
            'ml-5 mt-0.5 text-[13px]',
            part.status === 'failed' ? 'text-(--theme-error-text)' : 'theme-muted-text',
          )}
        >
          {outcome}
        </div>
      )}
    </div>
  )
}

/** Whether the ISO time has passed, turning true when it does. */
function useExpired(expiresAt: string | undefined): boolean {
  const [expired, setExpired] = useState(
    () => !!expiresAt && DateTime.fromISO(expiresAt) <= DateTime.now(),
  )
  useEffect(() => {
    if (!expiresAt || expired) {
      return
    }
    let timer: ReturnType<typeof setTimeout> | undefined
    const arm = () => {
      const left = DateTime.fromISO(expiresAt).diffNow().toMillis()
      if (left <= 0) {
        setExpired(true)
        return
      }
      // A timer past about 24 days fires at once, so check back daily.
      timer = setTimeout(arm, Math.min(left, 86_400_000))
    }
    arm()
    return () => clearTimeout(timer)
  }, [expiresAt, expired])
  return expired
}

function ConfirmApproval({
  part,
  onAnswer,
}: {
  part: ApprovalPart
  onAnswer?: PartRendererProps['onApprovalAnswer']
}) {
  const { strings } = useChatConfig()
  const { common } = useStrings()
  const t = strings.agentTranscript
  const [feedback, setFeedback] = useState<string | null>(null)
  const expired = useExpired(part.expiresAt)
  const answer = (a: Parameters<NonNullable<typeof onAnswer>>[1]) => onAnswer?.(part.id, a)
  const [allowLabel, denyLabel] = {
    command: [t.allowOnce, t.deny],
    code: [t.allowCode, t.denyCode],
    path: [t.allowPath, t.denyPath],
    call: [t.allowCall, t.denyCall],
  }[part.subject ?? 'command']
  return (
    <>
      {part.command && (
        <pre className="overflow-x-auto rounded-md bg-(--theme-muted-panel-bg) p-2 font-mono text-xs whitespace-pre-wrap">
          {part.command}
        </pre>
      )}
      {part.reason && <div className="text-xs theme-muted-text">{part.reason}</div>}
      {expired ? (
        <div className="text-xs theme-muted-text">{t.approvalRequestExpired}</div>
      ) : !onAnswer ? (
        <div className="text-xs theme-muted-text">
          {part.waitingOn ? t.approvalWaitingOn(part.waitingOn) : t.approvalPending}
        </div>
      ) : feedback === null ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => answer({ kind: 'confirm', allowed: true })}
            className="px-3 py-1 text-xs font-medium rounded-full bg-(--theme-accent) text-(--theme-accent-text)"
          >
            {allowLabel}
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
            className="px-3 py-1 text-xs font-medium rounded-full border theme-border hover:theme-hover text-(--theme-error-text)"
          >
            {denyLabel}
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
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (feedback.trim()) {
              answer({ kind: 'confirm', allowed: false, denyMessage: feedback.trim() })
            }
          }}
        >
          <input
            ref={focusOnMount}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            aria-label={t.feedbackLabel}
            placeholder={t.feedbackPlaceholder}
            className={cx(fieldBox({ size: 'sm' }), 'flex-1')}
          />
          <button
            type="submit"
            disabled={!feedback.trim()}
            className="px-3 py-1 text-xs font-medium rounded-full bg-(--theme-accent) text-(--theme-accent-text) disabled:opacity-50"
          >
            {common.send}
          </button>
        </form>
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
  const { common } = useStrings()
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
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (own.trim()) {
              answer(own.trim())
            }
          }}
        >
          <input
            ref={focusOnMount}
            value={own}
            onChange={(e) => setOwn(e.target.value)}
            aria-label={t.ownAnswerLabel}
            placeholder={t.ownAnswerLabel}
            className={cx(fieldBox({ size: 'sm' }), 'flex-1')}
          />
          <button
            type="submit"
            disabled={!own.trim()}
            className="px-3 py-1 text-xs font-medium rounded-full bg-(--theme-accent) text-(--theme-accent-text) disabled:opacity-50"
          >
            {common.send}
          </button>
        </form>
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
  const headingId = useId()
  const heading = part.header ?? part.toolName
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
    // A question the turn waits on: one named group, so a screen reader hears
    // what is being asked before the answers.
    <fieldset
      aria-labelledby={heading ? headingId : undefined}
      aria-label={heading ? undefined : t.approvalLabel}
      className="my-1.5 min-w-0 rounded-lg border border-(--theme-accent) p-3 space-y-2"
      data-testid="approval-part"
    >
      {heading && (
        <div id={headingId} className="text-xs font-semibold">
          {heading}
        </div>
      )}
      {part.approvalKind === 'confirm' ? (
        <ConfirmApproval part={part} onAnswer={onApprovalAnswer} />
      ) : part.approvalKind === 'plan' ? (
        <PlanApproval part={part} />
      ) : (
        <AskApproval part={part} onAnswer={onApprovalAnswer} />
      )}
    </fieldset>
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
        <div className="prose prose-sm max-w-none rounded-md bg-(--theme-muted-panel-bg) p-2 text-(--theme-app)">
          <Markdown isStreaming={false}>{part.plan}</Markdown>
        </div>
      )}
    </>
  )
}

function TodoSnapshotBlock({ part }: { part: TodoSnapshotPart }) {
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
            <span aria-hidden="true" className="select-none font-mono">
              {todo.status === 'completed' ? '✔' : todo.status === 'in_progress' ? '■' : '□'}
            </span>
            <span className="sr-only">
              {todo.status === 'completed'
                ? t.todoCompleted
                : todo.status === 'in_progress'
                  ? t.todoInProgress
                  : t.todoPending}
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

function NoticeBlock({ part }: { part: NoticePart }) {
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
        <Disclosure
          summary={<span className="min-w-0 flex-1 whitespace-pre-wrap">{part.text}</span>}
          summaryClassName="w-full text-[13px] theme-muted-text hover:theme-text"
          panelClassName="ml-4 mt-1 border-l-2 theme-border pl-3 text-sm theme-muted-text"
        >
          <Markdown>{part.detail}</Markdown>
        </Disclosure>
      </div>
    )
  }
  return (
    <div
      className={cx(
        'my-1 text-xs rounded-md border px-2.5 py-1.5',
        toneSurface[part.kind === 'error' ? 'error' : 'warning'],
      )}
      data-testid={`${part.kind}-part`}
    >
      {part.text}
    </div>
  )
}

/** The TUI's thought, drawn like a chat reply's: while it streams its label
 *  shimmers over the latest lines, then it folds to the label and opens in
 *  place on request. */
const ReasoningBlock = memo(function ReasoningBlock({
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
    (part.durationMs ? t.thoughtFor(formatDuration(part.durationMs)) : t.label)
  const hasBody = part.text.trim() !== ''
  const markdown = <Markdown isStreaming={isStreaming ?? false}>{part.text}</Markdown>
  if (isStreaming) {
    return (
      <div className="py-1.5" data-testid="reasoning-part">
        <div className="animate-shimmer text-shimmer text-sm">{label}</div>
        {hasBody && (
          <ReasoningBody className="chat-reasoning-tail">
            <div
              className="flex max-h-20 flex-col justify-end overflow-hidden"
              data-testid="reasoning-body"
            >
              {markdown}
            </div>
          </ReasoningBody>
        )}
      </div>
    )
  }
  if (!hasBody) {
    return (
      <div className="py-1.5 text-sm theme-muted-text" data-testid="reasoning-part">
        {label}
      </div>
    )
  }
  return (
    <div className="py-1.5" data-testid="reasoning-part">
      <Reasoning label={label} open={expanded} onOpenChange={setExpanded}>
        <div data-testid="reasoning-body">{markdown}</div>
      </Reasoning>
    </div>
  )
})

function TextBlock({ part, isStreaming }: { part: TextPart; isStreaming?: boolean }) {
  return (
    <div className={cx(chatProseClasses, '[&:not(:first-child)]:mt-4')}>
      <Markdown isStreaming={isStreaming ?? false}>{part.text}</Markdown>
    </div>
  )
}

function PartDispatch(props: PartRendererProps) {
  const { slots } = useChatConfig()
  const part = props.part
  const Tool = part.kind === 'tool_call' ? slots.toolRenderers?.[part.name] : undefined
  if (Tool && part.kind === 'tool_call') {
    const approval = props.message.parts?.find(
      (p): p is ApprovalPart => p.kind === 'approval' && p.id === part.id,
    )
    return (
      <ToolCallBlock part={part}>
        <Tool
          part={part}
          message={props.message}
          {...(approval ? { approval } : {})}
          {...(props.isStreaming !== undefined ? { isStreaming: props.isStreaming } : {})}
          {...(props.onApprovalAnswer ? { onApprovalAnswer: props.onApprovalAnswer } : {})}
        />
      </ToolCallBlock>
    )
  }
  const Override = slots.partRenderers?.[props.part.kind]
  if (Override) {
    return <Override {...props} />
  }
  return (
    <BuiltinPart
      part={props.part}
      isStreaming={props.isStreaming ?? false}
      onApprovalAnswer={props.onApprovalAnswer}
    />
  )
}

/** The package's own drawing of a part. Memoized on the part itself, which
 *  keeps its identity until a delta changes it, so a streamed token re-renders
 *  only the part it lands in, not every finished call and answer before it. */
const BuiltinPart = memo(function BuiltinPart({
  part,
  isStreaming,
  onApprovalAnswer,
}: {
  part: MessagePart
  isStreaming: boolean
  onApprovalAnswer: PartRendererProps['onApprovalAnswer']
}) {
  switch (part.kind) {
    case 'text':
      return <TextBlock part={part} isStreaming={isStreaming} />
    case 'reasoning':
      return <ReasoningBlock part={part} isStreaming={isStreaming} />
    case 'tool_call':
      return <ToolCallBlock part={part} />
    case 'subagent':
      return <SubagentCard part={part} />
    case 'approval':
      return <ApprovalBlock part={part} onApprovalAnswer={onApprovalAnswer} />
    case 'notice':
    case 'warning':
    case 'error':
      return <NoticeBlock part={part} />
    case 'todo_snapshot':
      return <TodoSnapshotBlock part={part} />
    default:
      return null
  }
})

type RunMember = { part: ToolCallPart | ReasoningPart; index: number }

type RenderItem =
  | { kind: 'single'; part: MessagePart; index: number }
  // Adjacent thoughts drawn as one line, labeled by the first.
  | { kind: 'reasoning'; parts: ReasoningPart[]; index: number }
  | { kind: 'rollup'; members: RunMember[] }
  // Consecutive calls to one tool that the rollup leaves out, such as failed
  // ones or ones a host draws.
  | { kind: 'calls'; members: { part: ToolCallPart; index: number }[] }

function isReasoning(m: RunMember): m is { part: ReasoningPart; index: number } {
  return m.part.kind === 'reasoning'
}

/** Two thoughts with nothing visible between them read as one, not as a
 *  stack of identical lines. */
function mergeReasoning(parts: ReasoningPart[]): ReasoningPart {
  // A lone thought keeps its identity, so its memoized block holds.
  if (parts.length === 1 && parts[0]) {
    return parts[0]
  }
  const durationMs = parts.reduce((sum, p) => sum + (p.durationMs ?? 0), 0)
  return {
    kind: 'reasoning',
    text: parts.map((p) => p.text).join('\n\n'),
    ...(durationMs > 0 ? { durationMs } : {}),
  }
}

// Folds runs of two or more consecutive, finished, groupable tool calls into
// one rollup row; failed, still-running and answered members never fold, and standalone
// kinds (edits, todos, subagents) break the run. A thought between two calls
// folds into the run with the work it preceded; the thoughts before and after
// a run keep their own line — mirrors the TUI.
export function buildRenderItems(
  parts: MessagePart[],
  hostDrawn: (toolName: string) => boolean = () => false,
  // A drawn call the host names a rollup clause for can fold with other tools.
  joinsRollup: (part: ToolCallPart) => boolean = () => false,
): RenderItem[] {
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
    // Leading and trailing reasoning sits outside the rollup; a run that is
    // all reasoning has an empty core.
    const firstCore = run.findIndex((m) => !isReasoning(m))
    const start = firstCore === -1 ? run.length : firstCore
    const end = firstCore === -1 ? run.length : run.findLastIndex((m) => !isReasoning(m)) + 1
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
  const decided = new Set(
    parts.flatMap((p) => (p.kind === 'tool_call' && p.decision ? [p.id] : [])),
  )
  const drawnByHost = new Set(
    parts.flatMap((p) =>
      p.kind === 'tool_call' && hostDrawn(p.name) && !joinsRollup(p) ? [p.id] : [],
    ),
  )
  parts.forEach((part, index) => {
    // An answered approval for a call that records its decision says nothing the call's own line doesn't.
    if (part.kind === 'approval' && part.resolved && decided.has(part.id)) {
      return
    }
    if (part.kind === 'approval' && drawnByHost.has(part.id)) {
      return
    }
    if (
      part.kind === 'reasoning' ||
      (part.kind === 'tool_call' &&
        part.status === 'ok' &&
        !part.decision &&
        !drawnByHost.has(part.id) &&
        isGroupableTool(part.name))
    ) {
      run.push({ part, index })
      return
    }
    flush()
    items.push({ kind: 'single', part, index })
  })
  flush()
  return groupRepeatedCalls(items)
}

/** A call that can share a row with the same tool's calls beside it: never one
 *  still running, so its progress stays in view, one waiting on an answer, or
 *  one whose decision line names who answered it. */
function foldableCall(item: RenderItem): ToolCallPart | null {
  return item.kind === 'single' &&
    item.part.kind === 'tool_call' &&
    (item.part.status === 'ok' || item.part.status === 'error') &&
    !item.part.decision
    ? item.part
    : null
}

function groupRepeatedCalls(items: RenderItem[]): RenderItem[] {
  const out: RenderItem[] = []
  let i = 0
  while (i < items.length) {
    const item = items[i] as RenderItem
    const first = foldableCall(item)
    let j = i + 1
    while (first && j < items.length && foldableCall(items[j] as RenderItem)?.name === first.name) {
      j++
    }
    if (j - i >= 2) {
      out.push({
        kind: 'calls',
        members: items.slice(i, j).map((m) => {
          const single = m as { part: ToolCallPart; index: number }
          return { part: single.part, index: single.index }
        }),
      })
    } else {
      out.push(item)
    }
    i = j
  }
  return out
}

function RollupGroup({
  members,
  message,
}: {
  members: RunMember[]
  message: PartRendererProps['message']
}) {
  const { strings, slots } = useChatConfig()
  const { sentence, allNamed } = useMemo(() => {
    const builtin: string[] = []
    const named = new Map<string, { count: number; rollup: (count: number) => string }>()
    for (const m of members) {
      if (m.part.kind !== 'tool_call') {
        continue
      }
      const rollup = slots.toolPresentation?.(m.part)?.rollup
      if (!rollup) {
        builtin.push(m.part.name)
        continue
      }
      const entry = named.get(m.part.name) ?? { count: 0, rollup }
      named.set(m.part.name, { ...entry, count: entry.count + 1 })
    }
    const clauses = [
      ...[...named.values()].map((n) => n.rollup(n.count)),
      ...rollupClauses(builtin, strings.tools),
    ]
    return {
      sentence: clauses.length ? strings.tools.rollup.sentence(clauses) : '',
      allNamed: named.size > 0 && builtin.length === 0,
    }
  }, [members, slots.toolPresentation, strings.tools])
  return (
    <div className="py-1.5 text-sm" data-testid="tool-rollup">
      <Disclosure
        // Members stay mounted so their own expand state survives refolding.
        keepMounted
        summaryClassName={rowSummaryClasses}
        summary={
          <>
            <span className="text-(--theme-success) leading-none" aria-hidden="true">
              ●
            </span>
            <span
              className={cx(
                'text-[13px] min-w-0 truncate',
                allNamed ? 'theme-text' : 'font-mono theme-muted-text',
              )}
            >
              {sentence}
            </span>
          </>
        }
        panelClassName="ml-1.5 mt-0.5 rounded-md bg-(--theme-muted-panel-bg)/40 px-2"
      >
        {members.map((m) => (
          <PartDispatch key={m.index} part={m.part} message={message} />
        ))}
      </Disclosure>
    </div>
  )
}

/** Calls to one tool in a row, folded into one line that counts them and their
 *  failures. Folded, it still shows what a host drew for each call, such as a
 *  table, so results stay in view; calls with nothing drawn show nothing. */
function CallGroup({
  members,
  message,
}: {
  members: { part: ToolCallPart; index: number }[]
  message: PartRendererProps['message']
}) {
  const { strings, slots } = useChatConfig()
  const t = strings.agentTranscript
  const [open, setOpen] = useState(false)
  const name = members[0]?.part.name ?? ''
  const Tool = slots.toolRenderers?.[name]
  const header = toolHeaderFor(name)
  const first = members[0]?.part
  const presentation = first ? slots.toolPresentation?.(first) : undefined
  // Named calls fold to their labels and summaries; their drawings open with the row.
  const drawFolded = Tool && !(presentation && !presentation.open)
  const failed = members.filter((m) => m.part.status === 'error').length
  const status = failed === members.length ? 'error' : 'ok'
  return (
    <div className="py-1.5 text-sm" data-testid="tool-call-group">
      <Disclosure
        open={open}
        onOpenChange={setOpen}
        keepMounted
        summaryClassName={rowSummaryClasses}
        summary={
          <>
            <ToolStatusDot part={{ ...(members[0]?.part as ToolCallPart), status }} />
            <span
              className={cx(
                'text-[13px] leading-5 min-w-0 truncate',
                presentation?.group ? 'theme-text' : 'font-mono',
              )}
            >
              {presentation?.group?.(members.length) ?? t.callGroup(header.label, members.length)}
              {failed > 0 && (
                <span className="text-(--theme-error-text)">
                  {' · '}
                  {t.failedCount(failed)}
                </span>
              )}
            </span>
          </>
        }
        panelClassName="ml-1.5 mt-0.5 rounded-md bg-(--theme-muted-panel-bg)/40 px-2"
      >
        {members.map((m) => (
          <PartDispatch key={m.index} part={m.part} message={message} />
        ))}
      </Disclosure>
      {!open &&
        drawFolded &&
        members.map(({ part, index }) => {
          const args = summarizeToolArgs(header.arg, part.args)
          return (
            // Hidden whole when the host drew nothing for this call.
            <div key={index} className="mt-1.5 min-w-0 sm:ml-5 has-[>[data-drawing]:empty]:hidden">
              {args && <div className="truncate font-mono text-xs theme-muted-text">{args}</div>}
              <div data-drawing className="mt-1">
                <Tool part={part} message={message} />
              </div>
            </div>
          )
        })}
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
  const { slots } = useChatConfig()
  const toolRenderers = slots.toolRenderers
  const toolPresentation = slots.toolPresentation
  const items = useMemo(
    () =>
      buildRenderItems(
        parts,
        (name) => !!toolRenderers?.[name],
        (part) => {
          const p = toolPresentation?.(part)
          return !!p?.rollup && !p.open
        },
      ),
    [parts, toolRenderers, toolPresentation],
  )
  const lastIndex = parts.length - 1
  return (
    <div className="w-full" data-testid="agent-parts">
      {items.map((item) =>
        item.kind === 'rollup' ? (
          <RollupGroup key={item.members[0]?.index ?? 0} members={item.members} message={message} />
        ) : item.kind === 'calls' ? (
          <CallGroup key={item.members[0]?.index ?? 0} members={item.members} message={message} />
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
