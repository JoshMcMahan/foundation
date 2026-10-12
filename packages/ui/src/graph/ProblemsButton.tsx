import { useRef, useState } from 'react'
import { keyedByContent } from '../components/keys'
import { TOOLTIP_ID } from '../components/Tooltip'
import { AlertIcon } from '../icons'
import type { EditorProblem } from './editorApi'
import { useGraphEditorStrings } from './editorStrings'
import { ToolbarPopover } from './ToolbarPopover'

/** A problem as a pane lists it; `pick` shows where it is, when an open pane can. */
export interface ListedProblem extends EditorProblem {
  pick?: (() => void) | undefined
}

/** A toolbar's count of the problems it lists, which opens the list. */
export function ProblemsButton({ problems }: { problems: ListedProblem[] }) {
  const t = useGraphEditorStrings()
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  if (problems.length === 0) {
    return null
  }
  const label = t.problemCount(problems.length)
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        aria-expanded={open}
        {...(open ? {} : { 'data-tooltip-id': TOOLTIP_ID })}
        data-tooltip-content={label}
        className="flex h-7 cursor-pointer items-center gap-1 rounded px-2 text-xs font-medium text-(--theme-error) theme-hover"
        onClick={() => setOpen((current) => !current)}
      >
        <AlertIcon className="h-3.5 w-3.5" />
        {problems.length}
      </button>
      {open && (
        <ToolbarPopover anchor={button} label={label} onClose={() => setOpen(false)}>
          <div className="mb-2 text-[0.8125rem] font-semibold">{label}</div>
          <ul className="flex flex-col gap-0.5">
            {keyedByContent(problems, (problem) => `${problem.line}:${problem.message}`).map(
              ({ key, item: problem }) => {
                const { pick } = problem
                const text = (
                  <>
                    <span className="mr-1.5 theme-muted-text">{t.problemLine(problem.line)}</span>
                    <span className="text-(--theme-error)">{problem.message}</span>
                  </>
                )
                return (
                  <li key={key}>
                    {pick ? (
                      <button
                        type="button"
                        className="w-full cursor-pointer rounded px-1.5 py-1 text-left theme-hover"
                        onClick={() => {
                          setOpen(false)
                          pick()
                        }}
                      >
                        {text}
                      </button>
                    ) : (
                      <div className="px-1.5 py-1">{text}</div>
                    )}
                  </li>
                )
              },
            )}
          </ul>
        </ToolbarPopover>
      )}
    </>
  )
}
