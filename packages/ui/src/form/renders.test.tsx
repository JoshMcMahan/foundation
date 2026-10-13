// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { testEngine } from '../test/engine'
import { DynamicForm } from './Form'
import type { FieldComponentProps } from './types/fieldComponentTypes'
import type { BaseField } from './types/fieldTypes'
import { useFieldValue } from './useFieldValue'
import { useFieldAt } from './utils/dependentOptions'

vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)

// Each stand-in counts its renders by name, as the core fields bind: to their own value, and to the
// value of the field they depend on.
const renders = new Map<string, number>()
const count = (name: string) => renders.set(name, (renders.get(name) ?? 0) + 1)

function CountedInput({ field, label, error }: FieldComponentProps<BaseField>) {
  const name = field.name ?? ''
  count(name)
  const [value, change] = useFieldValue<string | undefined>(name)
  return (
    <input
      aria-label={label}
      aria-invalid={error !== undefined}
      value={value ?? ''}
      onChange={(e) => change(e.target.value)}
    />
  )
}

function CountedEcho({ field }: FieldComponentProps<BaseField>) {
  count(field.name ?? '')
  return <output aria-label="echo">{String(useFieldAt(field.depends_on) ?? '')}</output>
}

const FIELDS = 200
const TITLED = '${{ inputs.f1 }}'
const schema = {
  ...Object.fromEntries(
    Array.from({ length: FIELDS }, (_, i) => [`f${i}`, { type: 'string', label: `F${i}` }]),
  ),
  echo: { type: 'echo', label: 'Echo', depends_on: 'f0' },
  titled: { type: 'string', label: TITLED },
}

describe('a form of many fields', () => {
  beforeEach(() => {
    // `titled` reads f1 in its label; nothing else in the schema reads an input.
    vi.mocked(testEngine.inputDependencies).mockImplementation((obj?: unknown) => {
      const reads = JSON.stringify(obj ?? null).includes(TITLED)
      return { inputDeps: new Set(reads ? ['f1'] : []), hasExpressions: reads }
    })
    vi.mocked(testEngine.evaluate).mockImplementation((({
      inputs,
      obj,
    }: {
      inputs: Record<string, unknown>
      obj: Record<string, unknown>
    }) =>
      'titled' in obj
        ? { ...obj, titled: { type: 'string', label: `Titled ${String(inputs['f1'] ?? '')}` } }
        : obj) as unknown as typeof testEngine.evaluate)
  })

  afterEach(() => {
    vi.mocked(testEngine.inputDependencies).mockImplementation(() => ({
      inputDeps: new Set<string>(),
      hasExpressions: false,
    }))
    vi.mocked(testEngine.evaluate).mockImplementation(
      (({ obj }: { obj: unknown }) => obj) as unknown as typeof testEngine.evaluate,
    )
  })

  const fields = { string: CountedInput, echo: CountedEcho }
  const renderForm = () => {
    const view = render(<DynamicForm formJSONs={schema} initialValues={{}} fields={fields} />)
    renders.clear()
    return view
  }
  const rendered = () => [...renders.keys()].sort()

  it('renders only the field typed in, and the field that reads it', () => {
    renderForm()
    fireEvent.change(screen.getByRole('textbox', { name: 'F0' }), { target: { value: 'a' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'F0' }), { target: { value: 'ab' } })

    expect(screen.getByRole('status', { name: 'echo' })).toHaveTextContent('ab')
    expect(rendered()).toEqual(['echo', 'f0'])
    expect(renders.get('f0')).toBe(2)
  })

  it('renders a field whose schema reads the input, and leaves the rest alone', () => {
    renderForm()
    fireEvent.change(screen.getByRole('textbox', { name: 'F1' }), { target: { value: 'x' } })

    expect(screen.getByRole('textbox', { name: 'Titled x' })).toBeInTheDocument()
    expect(rendered()).toEqual(['f1', 'titled'])
  })

  it('marks the fields the server rejected, and renders only those', () => {
    const { rerender } = renderForm()
    rerender(
      <DynamicForm
        formJSONs={schema}
        initialValues={{}}
        fields={fields}
        serverErrors={[{ path: 'f2' }, { path: '#/f3', message: 'Taken.' }]}
      />,
    )

    expect(screen.getByRole('textbox', { name: 'F2' })).toBeInvalid()
    expect(screen.getByRole('textbox', { name: 'F3' })).toBeInvalid()
    expect(screen.getByRole('textbox', { name: 'F4' })).toBeValid()
    expect(rendered()).toEqual(['f2', 'f3'])
  })
})
