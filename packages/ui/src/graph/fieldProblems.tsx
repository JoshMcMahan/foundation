import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { keyedByContent } from '../components/keys'
import { useWorkflowEditing } from '../components/Provider'
import type { LintFix } from '../editing'
import { AlertIcon } from '../icons'
import { useGraphEditorStrings } from './editorStrings'

/** A linter problem inside what a dialog edits; `at` is its path from there, such as ['run']. */
export interface ScopedProblem {
  at: (string | number)[]
  message: string
  fix?: LintFix | undefined
}

interface FieldProblemsValue {
  problems: ScopedProblem[]
  /** The id of the field that sets each key, for the list to take the reader there. */
  fields: ReadonlyMap<string, string>
  register: (key: string, id: string) => () => void
}

const FieldProblemsContext = createContext<FieldProblemsValue | null>(null)

const keyOf = (at: (string | number)[]) => at.join('.')
const within = (problem: ScopedProblem, key: string) =>
  keyOf(problem.at) === key || keyOf(problem.at).startsWith(`${key}.`)

/** Hands a form's fields the problems at the keys they set. */
export function FieldProblems({
  problems,
  children,
}: {
  problems: ScopedProblem[]
  children: ReactNode
}) {
  const [fields, setFields] = useState<ReadonlyMap<string, string>>(new Map())
  const register = useCallback((key: string, id: string) => {
    setFields((current) => (current.get(key) === id ? current : new Map(current).set(key, id)))
    return () =>
      setFields((current) => {
        if (current.get(key) !== id) {
          return current
        }
        const next = new Map(current)
        next.delete(key)
        return next
      })
  }, [])
  const value = useMemo(() => ({ problems, fields, register }), [problems, fields, register])
  return <FieldProblemsContext.Provider value={value}>{children}</FieldProblemsContext.Provider>
}

const LintScopeContext = createContext('')

/** Where the fields inside sit, such as `ssh` for a remote host's fields. */
export function LintScope({ at, children }: { at: string; children: ReactNode }) {
  const outer = useContext(LintScopeContext)
  return (
    <LintScopeContext.Provider value={outer ? `${outer}.${at}` : at}>
      {children}
    </LintScopeContext.Provider>
  )
}

/** The problems at the field with id `id`, which sets `key`; the dialog's list then leads to it. */
export function useFieldProblems(key: string | undefined, id: string): ScopedProblem[] {
  const context = useContext(FieldProblemsContext)
  const scope = useContext(LintScopeContext)
  const full = key === undefined ? undefined : scope ? `${scope}.${key}` : key
  const register = context?.register
  useEffect(() => (full && register ? register(full, id) : undefined), [full, id, register])
  return full && context ? context.problems.filter((problem) => within(problem, full)) : []
}

/** A field's problems as one message, and the buttons that make their likely fixes. */
export function useFieldLint(
  key: string | undefined,
  id: string,
  value: string,
  onChange: (value: string) => void,
): { message: string | undefined; fixes: ReactNode } {
  const { replaceReference } = useWorkflowEditing()
  const problems = useFieldProblems(key, id)
  const fixes = problems.flatMap(({ fix }) =>
    fix && !fix.key && replaceReference(value, fix.find, fix.replace) !== value ? [fix] : [],
  )
  return {
    message: problems.length > 0 ? problems.map((problem) => problem.message).join(' ') : undefined,
    fixes: (
      <FixButtons
        fixes={fixes}
        onFix={(fix) => onChange(replaceReference(value, fix.find, fix.replace))}
      />
    ),
  }
}

export function FixButtons({ fixes, onFix }: { fixes: LintFix[]; onFix: (fix: LintFix) => void }) {
  const t = useGraphEditorStrings()
  if (fixes.length === 0) {
    return null
  }
  return (
    <div className="flex flex-wrap gap-2">
      {fixes.map((fix) => (
        <button
          key={`${fix.find}>${fix.replace}`}
          type="button"
          className="cursor-pointer text-left text-xs font-medium text-(--theme-link) hover:underline"
          onClick={() => onFix(fix)}
        >
          {t.applyFix(fix.replace)}
        </button>
      ))}
    </div>
  )
}

// Opens every folded section around the field so focus, which scrolls to it, never lands hidden.
function reveal(id: string) {
  const element = document.getElementById(id)
  for (
    let section = element?.closest('details');
    section;
    section = section.parentElement?.closest('details')
  ) {
    section.open = true
  }
  element?.focus()
}

export function ProblemList({ problems }: { problems: ScopedProblem[] }) {
  const fields = useContext(FieldProblemsContext)?.fields
  if (problems.length === 0) {
    return null
  }
  const fieldOf = (problem: ScopedProblem) =>
    [...(fields ?? [])]
      .filter(([key]) => within(problem, key))
      .sort(([a], [b]) => b.length - a.length)[0]?.[1]
  return (
    <ul className="flex flex-col gap-1 text-sm text-(--theme-error)">
      {keyedByContent(problems, (problem) => `${problem.at.join('.')}:${problem.message}`).map(
        ({ key, item: problem }) => {
          const field = fieldOf(problem)
          return (
            <li key={key} className="flex gap-1.5">
              <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
              {field ? (
                <button
                  type="button"
                  className="cursor-pointer text-left hover:underline"
                  onClick={() => reveal(field)}
                >
                  {problem.message}
                </button>
              ) : (
                problem.message
              )}
            </li>
          )
        },
      )}
    </ul>
  )
}
