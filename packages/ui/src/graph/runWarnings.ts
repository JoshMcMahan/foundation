import { createContext, use } from 'react'
import type { ProblemParams } from '../components/Provider'
import type { WorkflowJob } from './types'

/** Something probably wrong with a run's workflow, found when the run was created, about one of its jobs or steps. */
export interface RunWarning {
  /** The steps that lead to the subworkflow the job is in, as `[job, 'step_<n>', …]`, outermost
   *  first; absent for the run's own workflow. */
  path?: readonly string[] | null | undefined
  /** The job, by the name the workflow gives it, which every run of its matrix shares. */
  job: string
  /** The step's index among the job's steps as the run lists them; absent for the job's own. */
  step?: number | null | undefined
  /** What is wrong and what to write instead. Text in backticks shows as code. It shows when the
   *  warning has no `code`, or the host has no message for it. */
  message: string
  /** The warning's stable code, such as `undefined_input`, which the host's `useProblemMessage`
   *  shows in the reader's language with `params`. */
  code?: string | null | undefined
  /** The values the code's message shows, by name. */
  params?: ProblemParams | null | undefined
  /** The URI of the page that explains it, such as `/problems/workflow/undefined_input`, which the
   *  warning links to, and which the host's `useProblemMessage` gets with its `code`. `about:blank`
   *  has none. */
  type?: string | null | undefined
}

/** A subworkflow step on the way to a warning: its level's prefix, its job and its index. */
interface Via {
  prefix: string
  job: string
  step: number
}

/** One place in the graph a warning is about, by the keys the graph opens and finds rows by. */
export interface WarningTarget {
  /** The subworkflow steps it sits under, outermost first, each of which opens to show it. */
  via: Via[]
  /** `subworkflows/<job>/step_<n>/` for each of them, as the graph prefixes the level it is on. */
  prefix: string
  /** The job as the run lists it, such as one run of a matrix. */
  job: string
  step?: number | undefined
  /** `prefix + job`, and `:step` for a step's. */
  key: string
}

/** A warning and where it is: one place, or one for each run of its job's matrix; none while the
 *  run lists no such job, such as before a subworkflow's jobs are known. */
export interface LocatedWarning {
  warning: RunWarning
  targets: WarningTarget[]
}

/** The key a job's row, or with `step` one of its step's rows, is found and marked by. */
export const rowKey = (prefix: string, job: string, step?: number) =>
  step === undefined ? `${prefix}${job}` : `${prefix}${job}:${step}`

// The jobs a workflow's job name became: itself, or each run of its matrix.
function jobsNamed(jobs: Record<string, WorkflowJob>, name: string): string[] {
  if (Object.hasOwn(jobs, name)) {
    return [name]
  }
  return Object.keys(jobs).filter((key) => jobs[key]?._matrix?.originaljob === name)
}

const STEP_SEGMENT = /^step_(\d+)$/

/** Finds each warning's job or step among the jobs the run lists, through the subworkflows its path names. */
export function locateWarnings(
  warnings: readonly RunWarning[],
  rootJobs: Record<string, WorkflowJob>,
): LocatedWarning[] {
  return warnings.map((warning) => {
    let levels: { prefix: string; jobs: Record<string, WorkflowJob>; via: Via[] }[] = [
      { prefix: '', jobs: rootJobs, via: [] },
    ]
    const path = warning.path ?? []
    for (let i = 0; i + 1 < path.length; i += 2) {
      const index = Number(STEP_SEGMENT.exec(path[i + 1] ?? '')?.[1] ?? Number.NaN)
      levels = levels.flatMap((level) =>
        Number.isNaN(index)
          ? []
          : jobsNamed(level.jobs, path[i] ?? '').flatMap((job) => {
              const jobs = level.jobs[job]?.steps?.[index]?.subworkflow?.jobs
              return jobs
                ? [
                    {
                      prefix: `${level.prefix}subworkflows/${job}/step_${index}/`,
                      jobs,
                      via: [...level.via, { prefix: level.prefix, job, step: index }],
                    },
                  ]
                : []
            }),
      )
    }
    const step = warning.step ?? undefined
    return {
      warning,
      targets: levels.flatMap(({ prefix, jobs, via }) =>
        jobsNamed(jobs, warning.job).map((job) => ({
          via,
          prefix,
          job,
          step,
          key: rowKey(prefix, job, step),
        })),
      ),
    }
  })
}

/** Which warnings each job and step row shows a mark for: its own, and those of anything inside it. */
export class WarningMarks {
  static readonly EMPTY = new WarningMarks([])

  private readonly byKey = new Map<string, RunWarning[]>()
  /** Equal for two sets of marks that mark the same rows with the same warnings. */
  readonly signature: string

  constructor(located: readonly LocatedWarning[]) {
    for (const { warning, targets } of located) {
      for (const target of targets) {
        const keys = target.via.flatMap((v) => [
          rowKey(v.prefix, v.job),
          rowKey(v.prefix, v.job, v.step),
        ])
        keys.push(rowKey(target.prefix, target.job))
        if (target.step !== undefined) {
          keys.push(target.key)
        }
        for (const key of keys) {
          const marked = this.byKey.get(key)
          if (!marked) {
            this.byKey.set(key, [warning])
          } else if (!marked.includes(warning)) {
            marked.push(warning)
          }
        }
      }
    }
    this.signature = JSON.stringify(
      [...this.byKey].map(([key, marked]) => [key, marked.map((w) => [w.message, w.job, w.step])]),
    )
  }

  /** The warnings about the job or step at `key`, or about anything in it, such as its steps or a
   *  subworkflow it runs. */
  under(key: string): RunWarning[] {
    return this.byKey.get(key) ?? []
  }

  /** The warnings under any of `keys`, each once, such as a matrix's runs. */
  underAny(keys: readonly string[]): RunWarning[] {
    return [...new Set(keys.flatMap((key) => this.under(key)))]
  }
}

export const WarningMarksContext = createContext<WarningMarks>(WarningMarks.EMPTY)

/** The run's warning marks, which every job list and tree row in a run's graph reads. */
export const useWarningMarks = () => use(WarningMarksContext)
