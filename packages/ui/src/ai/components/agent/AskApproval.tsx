import { type FormEvent, useEffect, useRef, useState } from 'react'
import { Checkbox } from '../../../components/Checkbox'
import { fieldBox, focusOutline } from '../../../components/fieldBox'
import { useStrings } from '../../../components/Provider'
import { TabPanel, Tabs } from '../../../components/Tabs'
import { cx } from '../../../cx'
import { ArrowRightIcon, ChatIcon, CheckIcon } from '../../../icons'
import { type PartRendererProps, useChatConfig } from '../../core/config'
import type { ApprovalPart, ApprovalQuestion, ApprovalQuestionAnswer } from '../../types'
import Markdown from '../../ui/Markdown'

/** What the reader has given one question so far. */
interface Given {
  picked: string[]
  text: string
  /** The typed text, not a pick, answers a single-select question. */
  own: boolean
  notes: string
}

const unanswered: Given = { picked: [], text: '', own: false, notes: '' }

type QuestionKind = 'single' | 'multi' | 'text'

function kindOf(question: ApprovalQuestion): QuestionKind {
  if ((question.options ?? []).length === 0) {
    return 'text'
  }
  return question.multiSelect ? 'multi' : 'single'
}

const optionRow =
  'flex w-full items-start gap-2 rounded-md border px-3 py-1.5 text-left text-xs hover:theme-hover'
const primaryButton =
  'px-3 py-1 text-xs font-medium rounded-full bg-(--theme-accent) text-(--theme-accent-text) disabled:opacity-50'
const outlineButton =
  'px-3 py-1 text-xs font-medium rounded-full border theme-border hover:theme-hover'
const quietButton = 'px-3 py-1 text-xs rounded-full theme-muted-text hover:theme-hover'

function hasPreview(preview: string | undefined): preview is string {
  return !!preview?.trim()
}

function showsPreviews(question: ApprovalQuestion): boolean {
  return (
    kindOf(question) === 'single' && (question.options ?? []).some((o) => hasPreview(o.preview))
  )
}

function answerOf(question: ApprovalQuestion, given: Given | undefined): ApprovalQuestionAnswer {
  // In option order, however they were ticked.
  const picked = (question.options ?? [])
    .map((o) => o.label)
    .filter((label) => given?.picked.includes(label))
  // A single-select question takes a pick or typed text, not both.
  const text = given && (kindOf(question) !== 'single' || given.own) ? given.text.trim() : ''
  const notes = given && showsPreviews(question) ? given.notes.trim() : ''
  return {
    ...(picked.length > 0 ? { picked } : {}),
    ...(text ? { text } : {}),
    ...(notes ? { notes } : {}),
  }
}

// Read as markdown only when it fences its own code.
function PreviewText({ preview }: { preview: string }) {
  if (/^ {0,3}`{3,}[^`]*$/m.test(preview)) {
    return <Markdown>{preview}</Markdown>
  }
  return (
    <pre className="py-1 font-mono leading-5 whitespace-pre">{preview.replace(/\n+$/, '')}</pre>
  )
}

// A pointer passing over the options doesn't flash each preview.
const previewHoverDelay = 150

function hasAnswer(answer: ApprovalQuestionAnswer | undefined): boolean {
  return (answer?.picked?.length ?? 0) > 0 || !!answer?.text || !!answer?.notes
}

function joinAnswer(answer: ApprovalQuestionAnswer | undefined): string {
  return [...(answer?.picked ?? []), ...(answer?.text ? [answer.text] : [])].join(', ')
}

export function AskApproval({
  part,
  onAnswer,
}: {
  part: ApprovalPart
  onAnswer?: PartRendererProps['onApprovalAnswer']
}) {
  const questions = part.questions ?? []
  // An ask with no questions this card can read is answered where it was asked.
  if (!onAnswer || questions.length === 0) {
    return <AskPending part={part} questions={questions} />
  }
  return <AskForm id={part.id} questions={questions} onAnswer={onAnswer} />
}

function AskPending({ part, questions }: { part: ApprovalPart; questions: ApprovalQuestion[] }) {
  const { strings } = useChatConfig()
  const t = strings.agentTranscript
  return (
    <>
      {questions.map((q) => (
        <div key={q.question} className="space-y-0.5">
          <div className="text-sm">{q.question}</div>
          {(q.options ?? []).length > 0 && (
            <div className="text-xs theme-muted-text">
              <span className="font-medium">{t.approvalOptions}: </span>
              {(q.options ?? []).map((o) => o.label).join(' · ')}
            </div>
          )}
        </div>
      ))}
      <div className="text-xs theme-muted-text">
        {part.waitingOn ? t.approvalWaitingOn(part.waitingOn) : t.approvalPending}
      </div>
    </>
  )
}

function AskForm({
  id,
  questions,
  onAnswer,
}: {
  id: string
  questions: ApprovalQuestion[]
  onAnswer: NonNullable<PartRendererProps['onApprovalAnswer']>
}) {
  const { strings } = useChatConfig()
  const { common } = useStrings()
  const t = strings.agentTranscript
  const [given, setGiven] = useState<Given[]>(() => questions.map(() => unanswered))
  const [active, setActive] = useState(0)
  const body = useRef<HTMLDivElement>(null)
  const submit = useRef<HTMLButtonElement>(null)
  // The next question's panel isn't rendered yet, so focus moves in an effect.
  const focusNext = useRef<number | null>(null)
  const several = questions.length > 1
  const answers = questions.map((q, i) => answerOf(q, given[i]))

  const send = (all: ApprovalQuestionAnswer[], chat: boolean) =>
    onAnswer(id, { kind: 'ask', answers: all, ...(chat ? { chat: true } : {}) })

  const done = (i: number, next: Given) => {
    const all = given.map((g, j) => (j === i ? next : g))
    setGiven(all)
    if (!several) {
      send(
        questions.map((q, j) => answerOf(q, all[j])),
        false,
      )
    } else if (i < questions.length - 1) {
      focusNext.current = i + 1
      setActive(i + 1)
    } else {
      submit.current?.focus()
    }
  }

  useEffect(() => {
    if (focusNext.current === active) {
      focusNext.current = null
      body.current?.querySelector<HTMLElement>('button, input')?.focus()
    }
  }, [active])

  const fields = (q: ApprovalQuestion, i: number) => (
    <div ref={i === active ? body : undefined} className="space-y-2">
      <div className="text-sm">{q.question}</div>
      <AskQuestionFields
        question={q}
        given={given[i] ?? unanswered}
        onChange={(next) => setGiven(given.map((g, j) => (j === i ? next : g)))}
        onDone={(next) => done(i, next)}
      />
    </div>
  )

  const lone = questions[0]
  const loneKind = lone ? kindOf(lone) : 'text'
  // A pick sends a lone single-select question, so Send is only for typed text.
  const sendShown = several || loneKind !== 'single' || hasAnswer(answers[0])
  return (
    <>
      {several ? (
        <Tabs
          label={t.questionsLabel}
          items={questions.map((q, i) => ({
            value: String(i),
            label: q.header || t.questionTab(i + 1),
            ...(hasAnswer(answers[i])
              ? { icon: <CheckIcon aria-hidden="true" className="size-3.5" /> }
              : {}),
          }))}
          value={String(active)}
          onValueChange={(value) => setActive(Number(value))}
        >
          {questions.map((q, i) => (
            <TabPanel key={q.question} value={String(i)} className="pt-2">
              {fields(q, i)}
            </TabPanel>
          ))}
        </Tabs>
      ) : (
        lone && fields(lone, 0)
      )}
      {several && (
        <div className="text-xs theme-muted-text">
          {t.answeredCount(answers.filter(hasAnswer).length, questions.length)}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {sendShown && (
          <button
            ref={submit}
            type="button"
            onClick={() => send(answers, false)}
            disabled={!several && loneKind === 'text' && !hasAnswer(answers[0])}
            className={primaryButton}
          >
            {several ? t.submitAnswers : common.send}
          </button>
        )}
        <button
          type="button"
          onClick={() => send(answers, true)}
          className={several ? outlineButton : quietButton}
        >
          {t.chatAboutThis}
        </button>
      </div>
    </>
  )
}

function AskQuestionFields({
  question,
  given,
  onChange,
  onDone,
}: {
  question: ApprovalQuestion
  given: Given
  onChange: (next: Given) => void
  onDone: (next: Given) => void
}) {
  const { strings } = useChatConfig()
  const t = strings.agentTranscript
  const kind = kindOf(question)
  const options = question.options ?? []
  // options.length stands for the own-answer row.
  const [shown, setShown] = useState(() =>
    Math.max(
      options.findIndex((o) => given.picked.includes(o.label)),
      0,
    ),
  )
  const hover = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => () => clearTimeout(hover.current), [])
  const show = (i: number) => {
    clearTimeout(hover.current)
    setShown(i)
  }
  const typed = given.text.trim() !== ''
  const submitOwn = (e: FormEvent) => {
    e.preventDefault()
    // A blank answer is one still being written.
    if (typed) {
      onDone(given)
    }
  }
  const type = (text: string) =>
    onChange(kind === 'single' ? { ...given, text, own: true, picked: [] } : { ...given, text })

  if (kind === 'text') {
    return (
      <form onSubmit={submitOwn}>
        <input
          value={given.text}
          onChange={(e) => type(e.target.value)}
          aria-label={t.ownAnswerLabel}
          placeholder={t.typeYourAnswer}
          className={fieldBox({ size: 'sm' })}
        />
      </form>
    )
  }
  const previews = showsPreviews(question)
  const ownChosen = typed && (kind === 'multi' || given.own)
  const ownRow = (
    <form onSubmit={submitOwn}>
      <label
        className={cx(
          optionRow,
          'cursor-text focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-(--theme-focus)',
          ownChosen ? 'border-(--theme-focus)' : 'theme-border',
        )}
      >
        <ChoiceMark on={ownChosen} box={kind === 'multi'} />
        <input
          value={given.text}
          onChange={(e) => type(e.target.value)}
          onFocus={previews ? () => show(options.length) : undefined}
          aria-label={t.ownAnswerLabel}
          placeholder={t.writeOwnAnswer}
          className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-(--theme-placeholder)"
        />
      </label>
    </form>
  )
  if (kind === 'multi') {
    return (
      <div className="flex flex-col gap-1.5">
        {options.map((o) => (
          <label key={o.label} className={cx(optionRow, 'cursor-pointer theme-border')}>
            <Checkbox
              checked={given.picked.includes(o.label)}
              onCheckedChange={(on) =>
                onChange({
                  ...given,
                  picked: on
                    ? [...given.picked, o.label]
                    : given.picked.filter((label) => label !== o.label),
                })
              }
              className="mt-px"
            />
            <OptionText label={o.label} description={o.description} />
          </label>
        ))}
        {ownRow}
      </div>
    )
  }
  // Rows rather than a radio group, so moving through them with the keyboard never picks one.
  const rows = (
    <div className="flex flex-col gap-1.5">
      {options.map((o, i) => {
        const picked = given.picked.includes(o.label)
        return (
          <button
            key={o.label}
            type="button"
            aria-pressed={picked}
            onClick={() => onDone({ ...given, picked: [o.label], own: false })}
            {...(previews
              ? {
                  onFocus: () => show(i),
                  onMouseEnter: () => {
                    clearTimeout(hover.current)
                    hover.current = setTimeout(setShown, previewHoverDelay, i)
                  },
                  onMouseLeave: () => clearTimeout(hover.current),
                }
              : {})}
            className={cx(
              optionRow,
              focusOutline,
              picked ? 'border-(--theme-focus)' : 'theme-border',
            )}
          >
            <ChoiceMark on={picked} box={false} />
            <OptionText label={o.label} description={o.description} />
          </button>
        )
      })}
      {ownRow}
    </div>
  )
  if (!previews) {
    return rows
  }
  const submitNotes = (e: FormEvent) => {
    e.preventDefault()
    if (hasAnswer(answerOf(question, given))) {
      onDone(given)
    }
  }
  return (
    <div className="@container/ask">
      <div className="flex flex-col gap-2 @md/ask:flex-row">
        <div className="shrink-0 @md/ask:w-56">{rows}</div>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {/* Panes share one cell, so the tallest sets the height and nothing below shifts. */}
          <div className="grid grid-cols-1">
            {options.map((o, i) => (
              <PreviewPane key={o.label} label={o.label} preview={o.preview} shown={i === shown} />
            ))}
            <PreviewPane
              label={t.ownAnswerLabel}
              preview={undefined}
              shown={shown === options.length}
            />
          </div>
          <form onSubmit={submitNotes}>
            <input
              value={given.notes}
              onChange={(e) => onChange({ ...given, notes: e.target.value })}
              aria-label={t.notesLabel}
              placeholder={t.notesPlaceholder}
              className={fieldBox({ size: 'sm' })}
            />
          </form>
        </div>
      </div>
    </div>
  )
}

function PreviewPane({
  label,
  preview,
  shown,
}: {
  label: string
  preview: string | undefined
  shown: boolean
}) {
  const { strings } = useChatConfig()
  const t = strings.agentTranscript
  return (
    <section
      aria-label={t.previewOf(label)}
      aria-hidden={shown ? undefined : true}
      inert={!shown}
      className={cx(
        'col-start-1 row-start-1 max-h-[40vh] overflow-auto rounded-md border theme-border px-3 py-1.5 text-xs',
        !shown && 'invisible',
      )}
    >
      <div aria-hidden="true" className="font-medium">
        {label}
      </div>
      {hasPreview(preview) ? (
        <PreviewText preview={preview} />
      ) : (
        <div className="theme-muted-text">{t.noPreview}</div>
      )}
    </section>
  )
}

/** Drawn like a radio or checkbox; the row itself is the control. */
function ChoiceMark({ on, box }: { on: boolean; box: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'mt-px flex size-4 shrink-0 items-center justify-center border',
        box ? 'rounded' : 'rounded-full',
        on
          ? 'border-(--theme-focus) bg-(--theme-accent) text-(--theme-accent-text)'
          : 'border-(--theme-border-strong) bg-(--theme-input-bg)',
      )}
    >
      {on &&
        (box ? (
          <CheckIcon className="size-3" />
        ) : (
          <span className="size-1.5 rounded-full bg-(--theme-accent-text)" />
        ))}
    </span>
  )
}

function OptionText({ label, description }: { label: string; description?: string | undefined }) {
  return (
    <span className="min-w-0">
      <span className="block font-medium">{label}</span>
      {description && <span className="block theme-muted-text">{description}</span>}
    </span>
  )
}

/** An older record has one `answer` in place of `answers`. */
export function AskAnswered({ part }: { part: ApprovalPart }) {
  const { strings } = useChatConfig()
  const t = strings.agentTranscript
  const answers = part.answers
  return (
    <>
      {(part.questions ?? []).map((q, i) => {
        const notes = answers?.[i]?.notes
        return (
          <div key={q.question}>
            <div className="theme-text">{q.question}</div>
            {answers && (
              <div className="flex items-center gap-1.5">
                <ArrowRightIcon aria-hidden="true" className="size-3 shrink-0" />
                {hasAnswer(answers[i]) ? (
                  <span className="theme-text">{joinAnswer(answers[i]) || t.notesOnly}</span>
                ) : (
                  <span className="italic">{t.noAnswer}</span>
                )}
              </div>
            )}
            {notes && (
              <div className="flex gap-1.5 pl-4.5">
                <span className="shrink-0">{t.notesLabel}</span>
                <span className="whitespace-pre-wrap theme-text">{notes}</span>
              </div>
            )}
          </div>
        )
      })}
      <div className="flex items-center gap-2">
        {part.chat ? <ChatIcon className="w-3.5 h-3.5" /> : <CheckIcon className="w-3.5 h-3.5" />}
        <span>
          {part.chat ? t.chatAboutThis : t.answered}
          {!answers && part.answer ? `: ${part.answer}` : ''}
        </span>
      </div>
    </>
  )
}
