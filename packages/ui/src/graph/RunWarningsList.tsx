import { Callout } from '../components/Callout'
import { keyedByContent, withPositionKeys } from '../components/keys'
import { useStrings, useWorkflowEngine } from '../components/Provider'
import { Tooltip } from '../components/Tooltip'
import { toneIcon } from '../components/tone'
import { cx } from '../cx'
import { WarningIcon } from '../icons'
import type { LocatedWarning, RunWarning, WarningTarget } from './runWarnings'
import type { WorkflowJob, WorkflowStep } from './types'
import { jobLabel } from './util'

/** A warning's message, with the text it puts in backticks, such as a keyword, set as code. */
export function WarningText({ message }: { message: string }) {
  const parts = message.split('`')
  // An odd number of backticks pairs none of them up for certain, so the message stays as written.
  if (parts.length < 3 || parts.length % 2 === 0) {
    return message
  }
  return withPositionKeys(parts).map(({ key, item }, i) =>
    i % 2 === 1 ? (
      <code key={key} className="rounded bg-current/10 px-1 font-mono text-[0.9em]">
        {item}
      </code>
    ) : (
      item
    ),
  )
}

/** Flags a job or step that warnings are about, or that holds something they're about; hovering
 *  it lists them. */
export function WarningMark({
  warnings,
  className,
}: {
  warnings: readonly RunWarning[]
  className?: string | undefined
}) {
  const { dag } = useStrings()
  if (warnings.length === 0) {
    return null
  }
  return (
    <Tooltip
      content={
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {keyedByContent(warnings, (w) => w.message).map(({ key, item }) => (
            <li key={key}>
              <WarningText message={item.message} />
            </li>
          ))}
        </ul>
      }
    >
      <span
        role="img"
        aria-label={dag.warningCount(warnings.length)}
        data-warning-mark=""
        className={cx('inline-flex shrink-0', toneIcon.warning, className)}
      >
        <WarningIcon className="h-[1.1em] w-[1.1em]" />
      </span>
    </Tooltip>
  )
}

/** Where a warning is, as people read it, outermost first: each subworkflow step it's under, its job and
 *  its step. Jobs go by the workflow's names, which a matrix's runs share. */
function placeOf(
  { warning, targets: [target] }: LocatedWarning,
  rootJobs: Record<string, WorkflowJob>,
  stepLabel: (step: WorkflowStep, index: number) => string,
  stepNumber: (index: number) => string,
): string[] {
  const parts: string[] = []
  let jobs: Record<string, WorkflowJob> | undefined = rootJobs
  const path = warning.path ?? []
  for (let i = 0; i + 1 < path.length; i += 2) {
    const via = target?.via[i / 2]
    const step: WorkflowStep | undefined = via ? jobs?.[via.job]?.steps?.[via.step] : undefined
    const segment = path[i + 1] ?? ''
    const index = /^step_(\d+)$/.exec(segment)?.[1]
    parts.push(
      jobLabel(path[i] ?? ''),
      step && via
        ? stepLabel(step, via.step)
        : index === undefined
          ? segment
          : stepNumber(Number(index)),
    )
    jobs = step?.subworkflow?.jobs
  }
  parts.push(jobLabel(warning.job))
  if (warning.step !== undefined && warning.step !== null) {
    const step = target ? jobs?.[target.job]?.steps?.[warning.step] : undefined
    parts.push(step ? stepLabel(step, warning.step) : stepNumber(warning.step))
  }
  return parts
}

/** The run's warnings, each with a link to the job or step it's about. */
export function RunWarningsList({
  warnings,
  rootJobs,
  onShow,
}: {
  warnings: readonly LocatedWarning[]
  rootJobs: Record<string, WorkflowJob>
  /** Brings a warning's job or step into view; without it, where each one is reads as text. */
  onShow?: ((target: WarningTarget) => void) | undefined
}) {
  const { dag } = useStrings()
  const engine = useWorkflowEngine()
  if (warnings.length === 0) {
    return null
  }
  return (
    <Callout tone="warning" title={dag.warningCount(warnings.length)} testId="run-warnings">
      <ul className="m-0 flex max-h-72 list-none flex-col gap-2.5 overflow-y-auto p-0">
        {keyedByContent(
          warnings,
          ({ warning }) =>
            `${(warning.path ?? []).join('/')}/${warning.job}:${warning.step ?? ''}:${warning.message}`,
        ).map(({ key, item }) => {
          const where = placeOf(
            item,
            rootJobs,
            (step, index) => engine.stepLabel(step, index),
            (index) => dag.stepNumber(index),
          ).join(' › ')
          const [target] = item.targets
          return (
            <li key={key} className="flex flex-col items-start gap-0.5">
              <span className="min-w-0 break-words">
                <WarningText message={item.warning.message} />
              </span>
              {target && onShow ? (
                <button
                  type="button"
                  onClick={() => onShow(target)}
                  className="cursor-pointer rounded-sm text-xs font-medium underline underline-offset-2 hover:decoration-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--theme-focus)"
                >
                  {where}
                </button>
              ) : (
                <span className="text-xs">{where}</span>
              )}
            </li>
          )
        })}
      </ul>
    </Callout>
  )
}
