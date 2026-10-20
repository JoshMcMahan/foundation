import { useState } from 'react'
import { keyedByContent } from '../components/keys'
import { Popover } from '../components/Popover'
import { useProblemText } from '../components/Provider'
import { Tooltip } from '../components/Tooltip'
import { WarningIcon } from '../icons'
import type { EditorProblem } from './editorApi'
import { useGraphEditorStrings } from './editorStrings'
import { ProblemPageLink } from './ProblemPageLink'
import { toolbarPanel } from './toolbarPanel'

/** A problem as a pane lists it; `pick` shows where it is, when an open pane can. */
export interface ListedProblem extends EditorProblem {
  pick?: (() => void) | undefined
}

/** A toolbar's count of the problems it lists, which opens the list. */
export function ProblemsButton({ problems }: { problems: ListedProblem[] }) {
  const t = useGraphEditorStrings()
  const problemText = useProblemText()
  const [open, setOpen] = useState(false)
  if (problems.length === 0) {
    return null
  }
  const label = t.problemCount(problems.length)
  return (
    <Popover
      title={label}
      open={open}
      onOpenChange={setOpen}
      {...toolbarPanel}
      trigger={
        // The open list already names the count.
        <Tooltip content={label} disabled={open}>
          <button
            type="button"
            aria-label={label}
            className="flex h-7 cursor-pointer items-center gap-1 rounded px-2 text-xs font-medium text-(--theme-error-text) theme-hover"
          >
            <WarningIcon className="h-3.5 w-3.5" />
            {problems.length}
          </button>
        </Tooltip>
      }
    >
      <ul className="flex flex-col gap-0.5">
        {keyedByContent(problems, (problem) => `${problem.line}:${problem.message}`).map(
          ({ key, item: problem }) => {
            const { pick } = problem
            const text = (
              <>
                <span className="mr-1.5 theme-muted-text">{t.problemLine(problem.line)}</span>
                <span className="text-(--theme-error-text)">{problemText(problem)}</span>
              </>
            )
            return (
              <li key={key} className="flex items-baseline gap-2">
                {pick ? (
                  <button
                    type="button"
                    className="min-w-0 flex-1 cursor-pointer rounded px-1.5 py-1 text-left theme-hover"
                    onClick={() => {
                      setOpen(false)
                      pick()
                    }}
                  >
                    {text}
                  </button>
                ) : (
                  <div className="min-w-0 flex-1 px-1.5 py-1">{text}</div>
                )}
                {/* Beside the row, not in it: a link can't sit inside the button that picks it. */}
                <ProblemPageLink type={problem.type} label={t.problemAbout} className="shrink-0" />
              </li>
            )
          },
        )}
      </ul>
    </Popover>
  )
}
