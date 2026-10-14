// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import {
  FormProvider,
  type UseFormReturn,
  useForm,
  useFormContext,
  useWatch,
} from 'react-hook-form'

// Polyfill structuredClone for Jest environment
if (typeof structuredClone === 'undefined') {
  ;(global as Record<string, unknown>)['structuredClone'] = (obj: unknown): unknown =>
    JSON.parse(JSON.stringify(obj))
}

// Mock all problematic external modules before importing the component under test
vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)

vi.mock('hooks', () => ({
  usePrevious: vi.fn((value: unknown) => value),
  useParsedOpts: vi.fn((options: unknown) => options),
}))

vi.mock('@parallelworks/ui', async () => ({
  ...(await vi.importActual<typeof import('@parallelworks/ui')>('@parallelworks/ui')),
  Loader: () => <div data-testid="loader">Loading...</div>,
  Table: Object.assign(({ children }: { children?: ReactNode }) => <table>{children}</table>, {
    Item: ({ children }: { children?: ReactNode }) => <td>{children}</td>,
    Header: ({ children }: { children?: ReactNode }) => <th>{children}</th>,
  }),
  TOOLTIP_ID: 'global-tooltip',
  TooltipInfo: () => null,
}))

vi.mock('./infraFieldRegistry', () => ({ INFRA_FIELD_COMPONENTS: {} }))

vi.mock('./fieldRegistry', async (importOriginal) => {
  const original = await importOriginal<typeof import('./fieldRegistry')>()
  return {
    ...original,
    Registry: (props: Parameters<typeof original.Registry>[0]) => {
      const { field, label, labelPosition } = props
      // A group that keeps its own values renders for real, so the fields inside it can be found.
      if (field.type === 'object') return <original.Registry {...props} />
      return (
        // data-optional surfaces the resolved flag; FieldWrapper renders the required
        // asterisk from it, but the real field components are mocked out here.
        <div
          data-testid={`field-${field.name}`}
          data-optional={String(field.optional)}
          data-label-position={labelPosition}
        >
          <label htmlFor={field.name}>{label}</label>
          <input id={field.name} name={field.name} type="text" />
        </div>
      )
    },
  }
})

import { testEngine } from '../test/engine'
import { renderDynamicForm } from '../test/form'

// Now import the component under test
import {
  collectFieldsWithDefaults,
  DynamicDefaultsSync,
  DynamicForm,
  defaultReferencesField,
  FieldsFromOptions,
  findSelfReferencingFieldNames,
  listLengthsSignature,
  resolveMetaOverrides,
} from './Form'

/** A form holding `values` for what renders inside it; each render of its values lands in `seen`. */
function InForm({
  values,
  seen = [],
  children,
}: {
  values: Record<string, unknown>
  seen?: Record<string, unknown>[]
  children?: ReactNode
}) {
  const form = useForm({ defaultValues: values })
  return (
    <FormProvider {...form}>
      <Seen into={seen} />
      {children}
    </FormProvider>
  )
}

function Seen({ into }: { into: Record<string, unknown>[] }) {
  into.push(structuredClone(useWatch()))
  return null
}

/** Sets a value in the form around it, as a field does. */
function SetButton({
  testId,
  name,
  value,
}: {
  testId: string
  name: string
  value: (values: Record<string, unknown>) => unknown
}) {
  const { setValue, getValues } = useFormContext()
  return (
    <button type="button" data-testid={testId} onClick={() => setValue(name, value(getValues()))} />
  )
}

/** The wizard's list of every page, opened. */
async function openSteps() {
  fireEvent.click(screen.getByRole('button', { name: 'All steps' }))
  return within(await screen.findByRole('dialog', { name: 'Steps' }))
}

describe('DynamicForm workflowForm prop', () => {
  const createSchema = (fieldOverrides = {}) => ({
    visibleField: {
      type: 'string',
      label: 'Visible Field',
    },
    hiddenIgnoredField: {
      type: 'string',
      label: 'Hidden Ignored Field',
      hidden: true,
      ignore: true,
      default: 'default-value',
      ...fieldOverrides,
    },
  })

  describe('when workflowForm is false (default)', () => {
    it('should delete field value when field is hidden and ignored', async () => {
      const { form } = renderDynamicForm(
        <DynamicForm
          formJSONs={createSchema()}
          initialValues={{
            visibleField: 'visible',
            hiddenIgnoredField: 'should-be-deleted',
          }}
          workflowForm={false}
        />,
      )

      await waitFor(() => {
        expect(screen.getByTestId('field-visibleField')).toBeInTheDocument()
      })

      const lastValues = form.getValues()
      expect(lastValues).not.toHaveProperty('hiddenIgnoredField')
    })

    it('should preserve field value when field is hidden but NOT ignored', async () => {
      const schemaWithHiddenOnly = {
        visibleField: {
          type: 'string',
          label: 'Visible Field',
        },
        hiddenOnlyField: {
          type: 'string',
          label: 'Hidden Only Field',
          hidden: true,
          default: 'default-value',
        },
      }

      const { form } = renderDynamicForm(
        <DynamicForm
          formJSONs={schemaWithHiddenOnly}
          initialValues={{
            visibleField: 'visible',
            hiddenOnlyField: 'should-be-preserved',
          }}
          workflowForm={false}
        />,
      )

      await waitFor(() => {
        expect(screen.getByTestId('field-visibleField')).toBeInTheDocument()
      })

      const lastValues = form.getValues()
      expect(lastValues).toHaveProperty('hiddenOnlyField', 'should-be-preserved')
    })
  })

  describe('when workflowForm is true', () => {
    it('should preserve field value when field is hidden and ignored', async () => {
      const { form } = renderDynamicForm(
        <DynamicForm
          formJSONs={createSchema()}
          initialValues={{
            visibleField: 'visible',
            hiddenIgnoredField: 'should-be-preserved',
          }}
          workflowForm={true}
        />,
      )

      await waitFor(() => {
        expect(screen.getByTestId('field-visibleField')).toBeInTheDocument()
      })

      const lastValues = form.getValues()
      expect(lastValues).toHaveProperty('hiddenIgnoredField', 'should-be-preserved')
    })

    it('should preserve default value when field is hidden and ignored', async () => {
      const { form } = renderDynamicForm(
        <DynamicForm
          formJSONs={createSchema()}
          initialValues={{
            visibleField: 'visible',
            hiddenIgnoredField: 'default-value',
          }}
          workflowForm={true}
        />,
      )

      await waitFor(() => {
        expect(screen.getByTestId('field-visibleField')).toBeInTheDocument()
      })

      const lastValues = form.getValues()
      expect(lastValues).toHaveProperty('hiddenIgnoredField', 'default-value')
    })
  })
})

describe('input widths', () => {
  const cellOf = (name: string) => screen.getByTestId(`field-${name}`).closest('[data-input-cell]')
  const labelOf = (name: string) =>
    screen.getByTestId(`field-${name}`).getAttribute('data-label-position')

  it('stacks a form without widths as it always has', async () => {
    const { container } = render(
      <DynamicForm
        initialValues={{}}
        formJSONs={{ a: { type: 'string' }, b: { type: 'string', width: '50px' } }}
      />,
    )
    await screen.findByTestId('field-a')
    expect(container.querySelector('[data-input-cell]')).toBeNull()
  })

  it('gives each input a cell as wide as its width, full width without one, and only pixels in a narrow list', async () => {
    render(
      <DynamicForm
        initialValues={{}}
        formJSONs={{
          half: { type: 'string', width: '50%' },
          fixed: { type: 'string', width: 320 },
          whole: { type: 'string' },
        }}
      />,
    )
    await screen.findByTestId('field-half')
    expect(cellOf('half')).toHaveStyle({ '--input-width': '50%', '--input-narrow': '100%' })
    expect(cellOf('fixed')).toHaveStyle({ '--input-width': '320px', '--input-narrow': '320px' })
    expect(cellOf('whole')).toHaveStyle({ '--input-width': '100%', '--input-narrow': '100%' })
  })

  it('puts an input marked anchor-below in the column of the shown one before it, at its own width', async () => {
    render(
      <DynamicForm
        initialValues={{}}
        formJSONs={{
          a: { type: 'string', width: '50%' },
          b: { type: 'string', width: '50%' },
          h: { type: 'string', hidden: true },
          c: { type: 'string', 'anchor-below': true, width: '25%' },
          d: { type: 'string', 'anchor-below': true },
        }}
      />,
    )
    await screen.findByTestId('field-c')
    expect(cellOf('c')).toBe(cellOf('b'))
    expect(cellOf('d')).toBe(cellOf('b'))
    expect(cellOf('a')).not.toBe(cellOf('b'))
    expect(cellOf('b')).toHaveStyle({ '--input-width': '50%' })
    expect(screen.getByTestId('field-c').closest('[data-input-member]')).toHaveStyle({
      '--input-width': 'calc(25cqw - 1rem)',
      '--input-narrow': '100%',
    })
    expect(screen.getByTestId('field-d').closest('[data-input-member]')).toBeNull()
    expect(labelOf('c')).toBe('top')
  })

  it('gives the first input of a list a column of its own even when marked anchor-below', async () => {
    render(
      <DynamicForm
        initialValues={{}}
        formJSONs={{
          a: { type: 'string', 'anchor-below': true, width: '50%' },
          b: { type: 'string', width: '50%' },
        }}
      />,
    )
    await screen.findByTestId('field-a')
    expect(cellOf('a')).not.toBe(cellOf('b'))
    expect(cellOf('a')).toHaveStyle({ '--input-width': '50%' })
  })

  it('puts the label of an input sharing its row on top when the workflow chose no position', async () => {
    render(
      <DynamicForm
        initialValues={{}}
        formJSONs={{
          half: { type: 'string', width: '50%' },
          full: { type: 'string', width: '100%' },
          whole: { type: 'string' },
        }}
      />,
    )
    await screen.findByTestId('field-half')
    expect(labelOf('half')).toBe('top')
    expect(labelOf('full')).toBe('left')
    expect(labelOf('whole')).toBe('left')
  })

  it('follows the label position the workflow chose, in its groups too', async () => {
    render(
      <DynamicForm
        initialValues={{}}
        formJSONs={{
          $meta: { labelPosition: 'left' },
          half: { type: 'string', width: '50%' },
          settings: {
            type: 'group',
            label: 'Settings',
            options: { inner: { type: 'string', width: '50%' } },
          },
          chosen: {
            type: 'group',
            label: 'Chosen',
            options: {
              $meta: { labelPosition: 'top' },
              own: { type: 'string' },
            },
          },
        }}
      />,
    )
    await screen.findByTestId('field-half')
    expect(labelOf('half')).toBe('left')
    expect(labelOf('inner')).toBe('left')
    expect(labelOf('own')).toBe('top')
  })
})

describe('a wizard inside a group', () => {
  it('pages its fields inside the form, with no submit of its own', async () => {
    render(
      <DynamicForm
        initialValues={{}}
        formJSONs={{
          before: { type: 'string' },
          steps: {
            type: 'group',
            label: 'Steps',
            options: {
              $meta: { wizard: { mode: 'wizard' } },
              one: { type: 'step', title: 'One', options: { a: { type: 'string' } } },
              two: { type: 'step', title: 'Two', options: { b: { type: 'string' } } },
            },
          },
        }}
      />,
    )
    await screen.findByTestId('field-a')
    expect(screen.getByTestId('field-before')).toBeInTheDocument()
    expect(screen.queryByTestId('field-b')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByTestId('field-b')
    expect(screen.queryByTestId('field-a')).toBeNull()
    expect(screen.getByRole('button', { name: 'Previous' })).toBeEnabled()
    expect(screen.getAllByRole('button').some((b) => b.textContent === 'Execute')).toBe(false)
  })

  it('keeps its values under a group that keeps its own, a repeated page’s copies included', async () => {
    const seen = vi.fn()
    render(
      <DynamicForm
        initialValues={{}}
        onValuesChange={seen}
        formJSONs={{
          // A group that isn't flattened converts to an object, so its fields' values sit under its name.
          setup: {
            type: 'object',
            label: 'Setup',
            options: {
              $meta: { wizard: { mode: 'wizard' } },
              hosts: {
                type: 'step',
                title: 'Host',
                multi: true,
                options: { cpus: { type: 'number', default: 2 } },
              },
              name: { type: 'step', title: 'Name', options: { label: { type: 'string' } } },
            },
          },
        }}
      />,
    )
    fireEvent.click(await screen.findByRole('button', { name: '+ Add Host' }))
    await screen.findByTestId('field-setup.hosts.0.cpus')
    await waitFor(() =>
      expect(seen).toHaveBeenLastCalledWith(
        expect.objectContaining({ setup: expect.objectContaining({ hosts: [{ cpus: 2 }] }) }),
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByTestId('field-setup.label')
  })
})

describe('a repeated wizard page', () => {
  it('starts with no copy, adds the first from its empty page, and removes back to none', async () => {
    const seen = vi.fn()
    render(
      <DynamicForm
        initialValues={{}}
        onValuesChange={seen}
        formJSONs={{
          $meta: { wizard: { mode: 'wizard' } },
          hosts: {
            type: 'step',
            title: 'Host',
            multi: true,
            options: { cpus: { type: 'number', default: 2 } },
          },
          done: { type: 'step', title: 'Done', options: { note: { type: 'string' } } },
        }}
      />,
    )
    await screen.findByRole('heading', { name: 'Host' })
    expect(screen.queryByRole('button', { name: 'Remove Host' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '+ Add Host' }))
    await screen.findByRole('heading', { name: 'Host 1' })
    await waitFor(() =>
      expect(seen).toHaveBeenLastCalledWith(expect.objectContaining({ hosts: [{ cpus: 2 }] })),
    )
    fireEvent.click(screen.getByRole('button', { name: '+ Add Host' }))
    await screen.findByRole('heading', { name: 'Host 2' })
    await waitFor(() =>
      expect(seen).toHaveBeenLastCalledWith(
        expect.objectContaining({ hosts: [{ cpus: 2 }, { cpus: 2 }] }),
      ),
    )
    fireEvent.click(screen.getByRole('button', { name: 'Remove Host' }))
    await screen.findByRole('heading', { name: 'Host 1' })
    fireEvent.click(screen.getByRole('button', { name: 'Remove Host' }))
    await screen.findByRole('heading', { name: 'Host' })
    await waitFor(() =>
      expect(seen).toHaveBeenLastCalledWith(expect.objectContaining({ hosts: [] })),
    )
  })
})

describe('a repeated wizard page’s copies', () => {
  afterEach(() => {
    vi.mocked(testEngine.evaluate).mockImplementation(
      (({ obj }: { obj: unknown }) => obj) as unknown as typeof testEngine.evaluate,
    )
    vi.mocked(testEngine.inputDependencies).mockImplementation(() => ({
      inputDeps: new Set<string>(),
      hasExpressions: false,
    }))
  })

  it('reads a copy’s title again when an input it reads changes, and not for another input', async () => {
    const title = '${{ inputs.clusters[index].name }}'
    vi.mocked(testEngine.inputDependencies).mockImplementation((obj?: unknown) => ({
      inputDeps: new Set<string>(obj === title ? ['clusters'] : []),
      hasExpressions: obj === title,
    }))
    vi.mocked(testEngine.evaluate).mockImplementation((({
      inputs,
      obj,
      index,
    }: {
      inputs: { clusters?: { name: string }[] }
      obj: { text?: unknown }
      index?: number
    }) =>
      obj?.text === title
        ? { text: `Cluster ${inputs.clusters?.[index ?? 0]?.name}` }
        : obj) as unknown as typeof testEngine.evaluate)
    const titleReads = () =>
      vi
        .mocked(testEngine.evaluate)
        .mock.calls.filter(([options]) => (options.obj as { text?: unknown })?.text === title)
        .length
    const seen = vi.fn()
    const { form } = renderDynamicForm(
      <DynamicForm
        initialValues={{ clusters: [{ name: 'a' }, { name: 'b' }], other: '' }}
        onValuesChange={seen}
        formJSONs={{
          $meta: { wizard: { mode: 'wizard' } },
          hosts: {
            type: 'step',
            title,
            multi: true,
            min: 2,
            max: 2,
            options: { cpus: { type: 'number' } },
          },
        }}
      />,
    )
    await screen.findByRole('heading', { name: 'Cluster a' })
    const before = titleReads()
    act(() => {
      form.setValue('other', 'typed')
    })
    await waitFor(() =>
      expect(seen).toHaveBeenLastCalledWith(expect.objectContaining({ other: 'typed' })),
    )
    expect(titleReads()).toBe(before)
    act(() => {
      form.setValue('clusters', [{ name: 'c' }, { name: 'b' }])
    })
    await screen.findByRole('heading', { name: 'Cluster c' })
  })

  it('takes each copy’s title by reading [index] and its description from a list, fixed when min is max', async () => {
    const clusters = ['a', 'b', 'c']
    vi.mocked(testEngine.evaluate).mockImplementation((({
      obj,
      index,
    }: {
      obj: { text?: unknown }
      index?: number
    }) =>
      typeof obj?.text === 'string' && obj.text.includes('[index]')
        ? { text: `Cluster ${clusters[index ?? 0]}` }
        : obj) as unknown as typeof testEngine.evaluate)
    render(
      <DynamicForm
        initialValues={{}}
        formJSONs={{
          $meta: { wizard: { mode: 'wizard' } },
          hosts: {
            type: 'step',
            title: '${{ inputs.clusters.[index].name }}',
            description: ['first', 'second', 'third'],
            multi: true,
            min: 3,
            max: 3,
            options: { cpus: { type: 'number' } },
          },
        }}
      />,
    )
    await screen.findByRole('heading', { name: 'Cluster a' })
    const steps = await openSteps()
    expect(steps.getByText('Cluster c')).toBeInTheDocument()
    expect(steps.getByText('first')).toBeInTheDocument()
    expect(steps.getByText('third')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Add/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Remove/ })).toBeNull()
  })

  it('starts at its min, removes no copy at it, and adds none past its max', async () => {
    render(
      <DynamicForm
        initialValues={{}}
        formJSONs={{
          $meta: { wizard: { mode: 'wizard', navigation: { allowJump: true } } },
          hosts: {
            type: 'step',
            title: 'Host',
            multi: true,
            min: 2,
            max: 3,
            options: { cpus: { type: 'number' } },
          },
        }}
      />,
    )
    await screen.findByRole('heading', { name: 'Host 1' })
    expect((await openSteps()).getByText('Host 2')).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Steps' }), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Steps' })).toBeNull())
    expect(screen.queryByRole('button', { name: 'Remove Host' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(await screen.findByRole('button', { name: '+ Add Host' }))
    await screen.findByRole('heading', { name: 'Host 3' })
    expect(screen.queryByRole('button', { name: '+ Add Host' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Remove Host' })).toBeInTheDocument()
  })
})

describe('a repeated wizard page’s buttons', () => {
  it('name the copy they remove or add when each copy has its own title', async () => {
    render(
      <DynamicForm
        initialValues={{ workers: [{}, {}] }}
        formJSONs={{
          $meta: { wizard: { mode: 'wizard', navigation: { allowJump: true } } },
          workers: {
            type: 'step',
            title: ['GPU workers', 'CPU workers'],
            multi: true,
            max: 3,
            options: { nodes: { type: 'number' } },
          },
        }}
      />,
    )
    await screen.findByRole('heading', { name: 'GPU workers' })
    expect(screen.getByRole('button', { name: 'Remove GPU workers' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'CPU workers' })
    expect(screen.getByRole('button', { name: 'Remove CPU workers' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '+ Add GPU workers 3' })).toBeInTheDocument()
  })
})

describe('a repeated wizard page’s bounds', () => {
  it('leaves out a page whose max allows no copy, as when the input its bounds read is empty', async () => {
    render(
      <DynamicForm
        initialValues={{}}
        formJSONs={{
          $meta: { wizard: { mode: 'wizard' } },
          settings: {
            type: 'step',
            title: 'Settings',
            multi: true,
            min: 0,
            max: 0,
            options: { version: { type: 'string' } },
          },
          done: { type: 'step', title: 'Done', options: { note: { type: 'string' } } },
        }}
      />,
    )
    await screen.findByRole('heading', { name: 'Done' })
    expect(screen.queryByText('Settings')).toBeNull()
  })

  it('drops the copies past its max, as when the input its bounds read gets smaller', async () => {
    const seen = vi.fn()
    render(
      <DynamicForm
        initialValues={{ hosts: [{ cpus: 1 }, { cpus: 2 }, { cpus: 3 }] }}
        onValuesChange={seen}
        formJSONs={{
          $meta: { wizard: { mode: 'wizard', navigation: { allowJump: true } } },
          hosts: {
            type: 'step',
            title: 'Host',
            multi: true,
            max: 2,
            options: { cpus: { type: 'number' } },
          },
        }}
      />,
    )
    await screen.findByRole('heading', { name: 'Host 1' })
    const steps = await openSteps()
    expect(steps.getByText('Host 2')).toBeInTheDocument()
    expect(steps.queryByText('Host 3')).toBeNull()
    await waitFor(() =>
      expect(seen).toHaveBeenLastCalledWith(
        expect.objectContaining({ hosts: [{ cpus: 1 }, { cpus: 2 }] }),
      ),
    )
  })
})

describe('a repeated wizard page’s copies as its bounds change', () => {
  const hosts = (bound: number) => ({
    $meta: { wizard: { mode: 'wizard', navigation: { allowJump: true } } },
    hosts: {
      type: 'step',
      title: 'Host',
      multi: true,
      min: bound,
      max: bound,
      options: { cpus: { type: 'number' } },
    },
  })

  it('brings back what a copy held when a lower max set it aside and the bounds allow it again', async () => {
    const seen = vi.fn()
    const initialValues = { hosts: [{ cpus: 1 }, { cpus: 2 }, { cpus: 3 }] }
    const { rerender } = render(
      <DynamicForm initialValues={initialValues} onValuesChange={seen} formJSONs={hosts(3)} />,
    )
    await screen.findByRole('heading', { name: 'Host 1' })
    rerender(
      <DynamicForm initialValues={initialValues} onValuesChange={seen} formJSONs={hosts(2)} />,
    )
    await waitFor(() =>
      expect(seen).toHaveBeenLastCalledWith(
        expect.objectContaining({ hosts: [{ cpus: 1 }, { cpus: 2 }] }),
      ),
    )
    rerender(
      <DynamicForm initialValues={initialValues} onValuesChange={seen} formJSONs={hosts(3)} />,
    )
    await waitFor(() =>
      expect(seen).toHaveBeenLastCalledWith(
        expect.objectContaining({ hosts: [{ cpus: 1 }, { cpus: 2 }, { cpus: 3 }] }),
      ),
    )
  })

  const upTo = (max: number) => ({
    $meta: { wizard: { mode: 'wizard', navigation: { allowJump: true } } },
    hosts: {
      type: 'step',
      title: 'Host',
      multi: true,
      max,
      options: { cpus: { type: 'number', default: 2 } },
    },
  })

  it('brings back every copy a lower max set aside, one for each Add', async () => {
    const seen = vi.fn()
    const initialValues = { hosts: [{ cpus: 1 }, { cpus: 2 }, { cpus: 3 }, { cpus: 4 }] }
    const form = (max: number) => (
      <DynamicForm initialValues={initialValues} onValuesChange={seen} formJSONs={upTo(max)} />
    )
    const { rerender } = render(form(4))
    await screen.findByRole('heading', { name: 'Host 1' })
    rerender(form(2))
    await waitFor(() =>
      expect(seen).toHaveBeenLastCalledWith({ hosts: [{ cpus: 1 }, { cpus: 2 }] }),
    )
    rerender(form(4))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(await screen.findByRole('button', { name: '+ Add Host' }))
    await screen.findByRole('heading', { name: 'Host 3' })
    fireEvent.click(screen.getByRole('button', { name: '+ Add Host' }))
    await waitFor(() => expect(seen).toHaveBeenLastCalledWith(initialValues))
  })

  it('brings back every copy a lower bound set aside as the bound rises a step at a time', async () => {
    const seen = vi.fn()
    const initialValues = { hosts: [{ cpus: 1 }, { cpus: 2 }, { cpus: 3 }, { cpus: 4 }] }
    const form = (bound: number) => (
      <DynamicForm initialValues={initialValues} onValuesChange={seen} formJSONs={hosts(bound)} />
    )
    const { rerender } = render(form(4))
    await screen.findByRole('heading', { name: 'Host 1' })
    for (const bound of [2, 3, 4]) {
      rerender(form(bound))
      await waitFor(() =>
        expect(seen).toHaveBeenLastCalledWith({ hosts: initialValues.hosts.slice(0, bound) }),
      )
    }
  })

  it('drops what a lower max set aside once saved inputs replace the values', async () => {
    const seen = vi.fn()
    const initialValues = { hosts: [{ cpus: 1 }, { cpus: 2 }, { cpus: 3 }] }
    const wizard = (max: number) => (
      <DynamicForm initialValues={initialValues} onValuesChange={seen} formJSONs={upTo(max)} />
    )
    const { form, rerender } = renderDynamicForm(wizard(3))
    await screen.findByRole('heading', { name: 'Host 1' })
    rerender(wizard(2))
    await waitFor(() =>
      expect(seen).toHaveBeenLastCalledWith({ hosts: [{ cpus: 1 }, { cpus: 2 }] }),
    )
    act(() => {
      form.reset({ hosts: [{ cpus: 7 }, { cpus: 8 }] })
    })
    rerender(wizard(3))
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(await screen.findByRole('button', { name: '+ Add Host' }))
    await waitFor(() =>
      expect(seen).toHaveBeenLastCalledWith({ hosts: [{ cpus: 7 }, { cpus: 8 }, { cpus: 2 }] }),
    )
  })

  it('keeps the person’s place when the step shown goes whole', async () => {
    const form = (max: number) => (
      <DynamicForm
        initialValues={{ hosts: [{ cpus: 1 }, { cpus: 2 }] }}
        formJSONs={{
          $meta: { wizard: { mode: 'wizard', navigation: { allowJump: true } } },
          start: { type: 'step', title: 'Start', options: { name: { type: 'string' } } },
          hosts: {
            type: 'step',
            title: 'Host',
            multi: true,
            max,
            options: { cpus: { type: 'number' } },
          },
          mid: { type: 'step', title: 'Mid', options: { size: { type: 'string' } } },
          done: { type: 'step', title: 'Done', options: { note: { type: 'string' } } },
        }}
      />
    )
    const { rerender } = render(form(2))
    await screen.findByRole('heading', { name: 'Start' })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'Host 2' })
    rerender(form(0))
    // The page after the step's, not the one now where Host 2 was.
    await screen.findByRole('heading', { name: 'Mid' })
  })

  it('goes on to the next step’s first copy when one change takes the step shown and gives the next copies', async () => {
    const wizard = (max: number) => (
      <DynamicForm
        initialValues={{ hosts: [{ cpus: 1 }, { cpus: 2 }] }}
        formJSONs={{
          $meta: { wizard: { mode: 'wizard', navigation: { allowJump: true } } },
          start: { type: 'step', title: 'Start', options: { name: { type: 'string' } } },
          hosts: {
            type: 'step',
            title: 'Host',
            multi: true,
            max,
            options: { cpus: { type: 'number' } },
          },
          sites: {
            type: 'step',
            title: 'Site',
            multi: true,
            options: { zone: { type: 'string' } },
          },
          done: { type: 'step', title: 'Done', options: { note: { type: 'string' } } },
        }}
      />
    )
    const { form, rerender } = renderDynamicForm(wizard(2))
    await screen.findByRole('heading', { name: 'Start' })
    fireEvent.click(screen.getByRole('button', { name: 'Next' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Next' }))
    await screen.findByRole('heading', { name: 'Host 2' })
    act(() => {
      rerender(wizard(0))
      form.reset({ hosts: [], sites: [{ zone: 'a' }] })
    })
    await screen.findByRole('heading', { name: 'Site 1' })
  })

  it('shows the nearest page left when the one shown goes, as when saved inputs replace the copies', async () => {
    const { form } = renderDynamicForm(
      <DynamicForm
        initialValues={{}}
        formJSONs={{
          $meta: { wizard: { mode: 'wizard' } },
          hosts: {
            type: 'step',
            title: 'Host',
            multi: true,
            options: { cpus: { type: 'number' } },
          },
          done: { type: 'step', title: 'Done', options: { note: { type: 'string' } } },
        }}
      />,
    )
    await screen.findByRole('heading', { name: 'Host' })
    act(() => {
      form.reset({ hosts: [{ cpus: 4 }, { cpus: 8 }] })
    })
    await screen.findByRole('heading', { name: 'Host 1' })
  })
})

describe('DynamicForm workflowForm prop, field by field', () => {
  const renderFieldsFromOptions = (
    options: Record<string, unknown>,
    initialValues: Record<string, unknown>,
    workflowForm = false,
  ) => {
    const { form, ...result } = renderDynamicForm(
      <DynamicForm formJSONs={options} initialValues={initialValues} workflowForm={workflowForm} />,
    )
    return {
      ...result,
      capturedValues: {
        get current() {
          return form.getValues()
        },
      },
    }
  }

  describe('hidden + ignored field behavior', () => {
    const schema = {
      normalField: {
        type: 'string',
        label: 'Normal Field',
      },
      hiddenIgnoredField: {
        type: 'string',
        label: 'Hidden Ignored',
        hidden: true,
        ignore: true,
      },
    }

    it('should delete value when workflowForm is false', async () => {
      const initialValues = {
        normalField: 'normal',
        hiddenIgnoredField: 'to-be-deleted',
      }

      const { capturedValues } = renderFieldsFromOptions(schema, initialValues, false)

      await waitFor(() => {
        expect(screen.getByTestId('field-normalField')).toBeInTheDocument()
      })

      expect(capturedValues.current).not.toHaveProperty('hiddenIgnoredField')
    })

    it('should preserve value when workflowForm is true', async () => {
      const initialValues = {
        normalField: 'normal',
        hiddenIgnoredField: 'to-be-preserved',
      }

      const { capturedValues } = renderFieldsFromOptions(schema, initialValues, true)

      await waitFor(() => {
        expect(screen.getByTestId('field-normalField')).toBeInTheDocument()
      })

      expect(capturedValues.current).toHaveProperty('hiddenIgnoredField', 'to-be-preserved')
    })
  })

  describe('workflowForm propagation to groups', () => {
    const schemaWithGroup = {
      outerField: {
        type: 'string',
        label: 'Outer Field',
      },
      myGroup: {
        type: 'group',
        label: 'My Group',
        noCollapse: true,
        options: {
          innerField: {
            type: 'string',
            label: 'Inner Field',
          },
          hiddenInnerField: {
            type: 'string',
            label: 'Hidden Inner',
            hidden: true,
            ignore: true,
          },
        },
      },
    }

    it('should propagate workflowForm=false to nested groups (deleting hidden+ignored values)', async () => {
      const initialValues = {
        outerField: 'outer',
        innerField: 'inner',
        hiddenInnerField: 'hidden-value',
      }

      const { capturedValues } = renderFieldsFromOptions(schemaWithGroup, initialValues, false)

      await waitFor(() => {
        expect(screen.getByTestId('field-outerField')).toBeInTheDocument()
        expect(screen.getByTestId('field-innerField')).toBeInTheDocument()
      })

      expect(capturedValues.current).not.toHaveProperty('hiddenInnerField')
    })

    it('should propagate workflowForm=true to nested groups (preserving hidden+ignored values)', async () => {
      const initialValues = {
        outerField: 'outer',
        innerField: 'inner',
        hiddenInnerField: 'hidden-value',
      }

      const { capturedValues } = renderFieldsFromOptions(schemaWithGroup, initialValues, true)

      await waitFor(() => {
        expect(screen.getByTestId('field-outerField')).toBeInTheDocument()
        expect(screen.getByTestId('field-innerField')).toBeInTheDocument()
      })

      expect(capturedValues.current).toHaveProperty('hiddenInnerField', 'hidden-value')
    })
  })

  describe('hidden without ignore', () => {
    const schemaHiddenOnly = {
      visibleField: {
        type: 'string',
        label: 'Visible Field',
      },
      hiddenOnlyField: {
        type: 'string',
        label: 'Hidden Only',
        hidden: true,
      },
    }

    it('should preserve hidden field value regardless of workflowForm when ignore is not set', async () => {
      const initialValues = {
        visibleField: 'visible',
        hiddenOnlyField: 'hidden-but-kept',
      }

      const { capturedValues } = renderFieldsFromOptions(schemaHiddenOnly, initialValues, false)

      await waitFor(() => {
        expect(screen.getByTestId('field-visibleField')).toBeInTheDocument()
      })

      expect(capturedValues.current).toHaveProperty('hiddenOnlyField', 'hidden-but-kept')
    })
  })
})

describe('collectFieldsWithDefaults', () => {
  it('should return empty array for empty options', () => {
    expect(collectFieldsWithDefaults({})).toEqual([])
  })

  it('should collect every field with a default regardless of hidden / prefillDefault', () => {
    // The sync iteration's saved-vs-default heuristic decides per-field whether to
    // preserve or sync; collectFieldsWithDefaults is the unfiltered set.
    const options = {
      visibleString: { type: 'string', label: 'Visible', default: 'test' },
      visibleBoolean: { type: 'boolean', label: 'Visible Bool', default: true },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'visibleString', defaultValue: 'test' },
      { name: 'visibleBoolean', defaultValue: true },
    ])
  })

  it('should collect simple hidden boolean field with default', () => {
    const options = {
      is_disabled: {
        type: 'boolean',
        hidden: true,
        default: true,
        label: 'Is Disabled',
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'is_disabled', defaultValue: true },
    ])
  })

  it('should NOT collect hidden boolean field without default', () => {
    const options = {
      is_disabled: {
        type: 'boolean',
        hidden: true,
        label: 'Is Disabled',
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([])
  })

  it('should collect hidden non-boolean fields (now supports all types)', () => {
    // Originally this test expected non-boolean hidden fields to be ignored,
    // but we now support syncing all hidden field types, not just booleans
    const options = {
      hidden_string: {
        type: 'string',
        hidden: true,
        default: 'value',
        label: 'Hidden String',
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'hidden_string', defaultValue: 'value' },
    ])
  })

  it('should collect field with hidden=false (has hidden property defined)', () => {
    // Fields with 'hidden' defined (even if false) are computed/dynamic fields
    // that need syncing because their visibility or default may be expression-based
    const options = {
      visible_bool: {
        type: 'boolean',
        hidden: false,
        default: true,
        label: 'Visible Bool',
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'visible_bool', defaultValue: true },
    ])
  })

  it('should collect a regular field with a default', () => {
    const options = {
      scheduler: {
        type: 'boolean',
        default: true,
        label: 'Enable Scheduler',
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([{ name: 'scheduler', defaultValue: true }])
  })

  // convertToDynamicForm keeps `group` only for a flatten group and turns every other one into
  // `object`, so a `group` reaching this walk always has its children at the ROOT of values. Prefixing
  // them produced paths that do not exist -- `controller.rootSize`, `alerts.runtimeAlertEnabled` -- and
  // the sync silently did nothing for Controller, General, Advanced and Alerts, i.e. most of the
  // cluster definition form.
  // listLengthsSignature gates the collect walk and keys its row-shrink pruning, so it has to agree with
  // it about where a flatten group's children live. Prefixing here emitted a constant signature, making a
  // row add or remove inside such a list invisible.
  it('sees a row change in a list inside a flatten group', () => {
    const options = {
      controller: {
        type: 'group',
        flatten: true,
        options: {
          disks: {
            type: 'list',
            template: { sizeGb: { type: 'number', default: 50 } },
          },
        },
      },
    }
    const one = listLengthsSignature(options, { disks: [{}] })
    const two = listLengthsSignature(options, { disks: [{}, {}] })
    expect(one).not.toEqual(two)
    expect(two).toContain('2')
  })

  it("collects a flatten group's children at the root, not under the group name", () => {
    const options = {
      controller: {
        type: 'group',
        flatten: true,
        label: 'Controller Settings',
        options: {
          rootSize: { type: 'number', default: 100, label: 'Root Size' },
        },
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([{ name: 'rootSize', defaultValue: 100 }])
  })

  it('reads a flatten group value from the root of values', () => {
    const options = {
      general: {
        type: 'group',
        flatten: true,
        options: {
          network: { type: 'string', default: 'default-net' },
        },
      },
    }
    // The value lives at the root, exactly where initializeValues and the renderers put it.
    const collected = collectFieldsWithDefaults(options, { network: 'my-net' })
    expect(collected).toEqual([{ name: 'network', defaultValue: 'default-net' }])
  })

  it("collects a flatten group's list rows so the row template is not dropped", () => {
    const options = {
      controller: {
        type: 'group',
        flatten: true,
        options: {
          disks: {
            type: 'list',
            template: { sizeGb: { type: 'number', default: 50 } },
          },
        },
      },
    }
    // disks lives at the root under a flatten group; reading it as controller.disks yielded undefined,
    // which is not an array, so the whole row template was skipped.
    expect(collectFieldsWithDefaults(options, { disks: [{}, {}] })).toEqual([
      { name: 'disks.0.sizeGb', defaultValue: 50 },
      { name: 'disks.1.sizeGb', defaultValue: 50 },
    ])
  })

  it('still nests a non-flatten group, which arrives as an object', () => {
    const options = {
      desktopSession: {
        type: 'object',
        options: {
          useApptainer: { type: 'boolean', default: false },
        },
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'desktopSession.useApptainer', defaultValue: false },
    ])
  })

  it('should collect hidden boolean field inside a group', () => {
    const options = {
      myGroup: {
        type: 'object',
        label: 'My Group',
        options: {
          is_disabled: {
            type: 'boolean',
            hidden: true,
            default: false,
            label: 'Is Disabled',
          },
        },
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'myGroup.is_disabled', defaultValue: false },
    ])
  })

  it('should collect hidden boolean field inside nested groups', () => {
    const options = {
      outerGroup: {
        type: 'object',
        label: 'Outer',
        options: {
          innerGroup: {
            type: 'object',
            label: 'Inner',
            options: {
              deeply_nested: {
                type: 'boolean',
                hidden: true,
                default: true,
                label: 'Deeply Nested',
              },
            },
          },
        },
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'outerGroup.innerGroup.deeply_nested', defaultValue: true },
    ])
  })

  it('should collect multiple hidden boolean fields at different levels', () => {
    const options = {
      top_level: {
        type: 'boolean',
        hidden: true,
        default: true,
        label: 'Top Level',
      },
      myGroup: {
        type: 'object',
        label: 'My Group',
        options: {
          group_level: {
            type: 'boolean',
            hidden: true,
            default: false,
            label: 'Group Level',
          },
        },
      },
    }
    const result = collectFieldsWithDefaults(options)
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({ name: 'top_level', defaultValue: true })
    expect(result).toContainEqual({
      name: 'myGroup.group_level',
      defaultValue: false,
    })
  })

  it('should skip $meta keys', () => {
    const options = {
      $meta: { labelPosition: 'top' },
      is_disabled: {
        type: 'boolean',
        hidden: true,
        default: true,
        label: 'Is Disabled',
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'is_disabled', defaultValue: true },
    ])
  })

  it('should handle group with items instead of options', () => {
    const options = {
      myGroup: {
        type: 'object',
        label: 'My Group',
        items: {
          is_disabled: {
            type: 'boolean',
            hidden: true,
            default: true,
            label: 'Is Disabled',
          },
        },
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'myGroup.is_disabled', defaultValue: true },
    ])
  })

  it('should collect hidden boolean fields even when parent group is hidden', () => {
    // This is the key scenario from issue3.txt: when the parent group becomes hidden,
    // we still need to find and sync the hidden boolean field inside it
    const options = {
      slurm: {
        type: 'object',
        label: 'SLURM Directives',
        hidden: true, // Parent group is hidden
        options: {
          is_disabled: {
            type: 'boolean',
            hidden: true,
            default: true, // This should be collected even though parent is hidden
            label: 'Is SLURM disabled?',
          },
        },
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'slurm.is_disabled', defaultValue: true },
    ])
  })

  it('should collect from deeply nested hidden groups', () => {
    const options = {
      outer: {
        type: 'object',
        label: 'Outer',
        hidden: true,
        options: {
          middle: {
            type: 'object',
            label: 'Middle',
            hidden: true,
            options: {
              inner_flag: {
                type: 'boolean',
                hidden: true,
                default: false,
                label: 'Inner Flag',
              },
            },
          },
        },
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'outer.middle.inner_flag', defaultValue: false },
    ])
  })

  it('should collect hidden fields inside type="object" (converted groups)', () => {
    // convertToDynamicForm converts type="group" to type="object"
    // This tests the actual structure after conversion
    const options = {
      slurm: {
        type: 'object', // After convertToDynamicForm, groups become objects
        label: 'SLURM Directives',
        hidden: true,
        options: {
          is_disabled: {
            type: 'boolean',
            hidden: true,
            default: true,
            label: 'Is SLURM disabled?',
          },
        },
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'slurm.is_disabled', defaultValue: true },
    ])
  })

  it('should collect hidden string fields (not just booleans)', () => {
    const options = {
      hidden_string: {
        type: 'string',
        hidden: true,
        default: 'computed-value',
        label: 'Hidden String',
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'hidden_string', defaultValue: 'computed-value' },
    ])
  })

  it('should collect hidden number fields', () => {
    const options = {
      hidden_number: {
        type: 'number',
        hidden: true,
        default: 42,
        label: 'Hidden Number',
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'hidden_number', defaultValue: 42 },
    ])
  })

  it('should collect hidden fields of mixed types', () => {
    const options = {
      hidden_bool: {
        type: 'boolean',
        hidden: true,
        default: false,
        label: 'Hidden Bool',
      },
      hidden_string: {
        type: 'string',
        hidden: true,
        default: 'test',
        label: 'Hidden String',
      },
      visible_field: {
        type: 'string',
        label: 'Visible Field',
      },
    }
    const result = collectFieldsWithDefaults(options)
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({ name: 'hidden_bool', defaultValue: false })
    expect(result).toContainEqual({
      name: 'hidden_string',
      defaultValue: 'test',
    })
  })

  it('should NOT collect list fields when no list items exist in values', () => {
    const options = {
      myList: {
        type: 'list',
        label: 'My List',
        options: {
          list_hidden_field: {
            type: 'string',
            hidden: true,
            default: 'list-default',
            label: 'List Hidden Field',
          },
        },
      },
    }
    // No list items in values, so nothing to collect
    expect(collectFieldsWithDefaults(options, {})).toEqual([])
    expect(collectFieldsWithDefaults(options, { myList: [] })).toEqual([])
  })

  it('should collect list item fields with indexed paths when items exist', () => {
    const options = {
      myList: {
        type: 'list',
        label: 'My List',
        options: {
          list_hidden_field: {
            type: 'string',
            hidden: true,
            default: 'list-default',
            label: 'List Hidden Field',
          },
        },
      },
    }
    // One list item exists
    const values = { myList: [{ list_hidden_field: 'old-value' }] }
    expect(collectFieldsWithDefaults(options, values)).toEqual([
      { name: 'myList.0.list_hidden_field', defaultValue: 'list-default' },
    ])
  })

  it('should collect fields for multiple list items', () => {
    const options = {
      myList: {
        type: 'list',
        label: 'My List',
        options: {
          is_disabled: {
            type: 'boolean',
            hidden: true,
            default: false,
            label: 'Is Disabled',
          },
        },
      },
    }
    // Two list items exist
    const values = {
      myList: [{ is_disabled: true }, { is_disabled: true }],
    }
    expect(collectFieldsWithDefaults(options, values)).toEqual([
      { name: 'myList.0.is_disabled', defaultValue: false },
      { name: 'myList.1.is_disabled', defaultValue: false },
    ])
  })

  it('should collect nested list items inside groups', () => {
    const options = {
      slurm: {
        type: 'object',
        label: 'SLURM',
        options: {
          multi: {
            type: 'list',
            label: 'Multi',
            options: {
              is_disabled: {
                type: 'boolean',
                hidden: true,
                default: false,
                label: 'Is Disabled',
              },
            },
          },
        },
      },
    }
    const values = {
      slurm: {
        multi: [{ is_disabled: true }],
      },
    }
    expect(collectFieldsWithDefaults(options, values)).toEqual([
      { name: 'slurm.multi.0.is_disabled', defaultValue: false },
    ])
  })
})

describe('DynamicDefaultsSync', () => {
  // The sync runs during render using a useRef guard: it only fires when
  // fieldsWithDefaults changes between renders (deepEqual comparison).
  // On the initial mount the ref is initialized to the current value, so
  // the sync block is intentionally skipped. This mirrors production
  // behavior where expression re-evaluation causes options/defaults to
  // change across renders, triggering the sync on subsequent renders.
  //
  // To test this, we mount with empty options first (so the ref
  // initializes to []), then rerender with the real options. The
  // deepEqual mismatch triggers the sync block during the rerender.
  // Two-phase render: phase 1 with `optionsA`, phase 2 with `optionsB`. The sync
  // iteration's prev-default tracker records on first-seen during phase 1, then
  // compares against the new resolved default during phase 2 — that's what
  // simulates a dependency-driven default change.
  const renderTwoPhase = (
    optionsA: Record<string, unknown>,
    optionsB: Record<string, unknown>,
    initialValues: Record<string, unknown>,
  ) => {
    const capturedValues: Record<string, unknown>[] = []

    const TestComponent = ({ opts }: { opts: Record<string, unknown> }) => (
      <InForm values={initialValues} seen={capturedValues}>
        <DynamicDefaultsSync options={opts} />
        <input data-testid="mounted-indicator" />
      </InForm>
    )

    const result = render(<TestComponent opts={optionsA} />)
    result.rerender(<TestComponent opts={optionsB} />)
    return { ...result, capturedValues }
  }

  const renderSinglePhase = (
    options: Record<string, unknown>,
    initialValues: Record<string, unknown>,
  ) => {
    const capturedValues: Record<string, unknown>[] = []

    const result = render(
      <InForm values={initialValues} seen={capturedValues}>
        <DynamicDefaultsSync options={options} />
        <input data-testid="mounted-indicator" />
      </InForm>,
    )
    return { ...result, capturedValues }
  }

  it('preserves a saved value that differs from default on first-seen (synth-touched)', async () => {
    // Saved=true, resolved default=false → user-curated. Synth touched, no sync.
    const options = {
      is_disabled: {
        type: 'boolean',
        hidden: true,
        default: false,
        label: 'Is Disabled',
      },
    }
    const initialValues = { is_disabled: true }

    const { capturedValues } = renderSinglePhase(options, initialValues)

    await waitFor(() => expect(screen.getByTestId('mounted-indicator')).toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 50))

    const lastValues = capturedValues[capturedValues.length - 1]!
    expect(lastValues['is_disabled']).toBe(true)
  })

  it('syncs when the resolved default changes between renders (default-tracking)', async () => {
    // Phase 1 default==saved → not synth-touched. Phase 2 default flips → sync fires.
    const optionsA = {
      is_disabled: {
        type: 'boolean',
        hidden: true,
        default: true,
        label: 'Is Disabled',
      },
    }
    const optionsB = {
      is_disabled: {
        type: 'boolean',
        hidden: true,
        default: false,
        label: 'Is Disabled',
      },
    }
    const initialValues = { is_disabled: true }

    const { capturedValues } = renderTwoPhase(optionsA, optionsB, initialValues)

    await waitFor(() => {
      const lastValues = capturedValues[capturedValues.length - 1]!
      expect(lastValues['is_disabled']).toBe(false)
    })
  })

  describe('list row template defaults', () => {
    const template =
      "${{ inputs.partitions.[index].provisioningMode == 'flex' && inputs.partitions.[index].maxNodes * 1 > 1 }}"
    const parserMock = vi.mocked(testEngine.evaluate)
    // The stubs below read only these three; `as unknown as` re-widens to the real signature
    // without an `any`, which lint rejects.
    type ParserCall = {
      obj?: { v?: unknown }
      inputs?: {
        partitions?: Array<{ provisioningMode?: string; maxNodes?: unknown }>
      }
      index: number
    }

    const mkOptions = () => ({
      partitions: {
        type: 'list',
        label: 'Partitions',
        options: {
          maxNodes: { type: 'number', label: 'Max Nodes', default: 1 },
          useNodeGroup: { type: 'boolean', label: 'MIG', default: template },
        },
      },
    })

    const renderWithRaise = (opts: Record<string, unknown>) => {
      const capturedValues: Record<string, unknown>[] = []
      const initialValues = {
        partitions: [{ provisioningMode: 'flex', maxNodes: '1', useNodeGroup: false }],
      }
      const TestComponent = ({ o }: { o: Record<string, unknown> }) => (
        <InForm values={initialValues} seen={capturedValues}>
          <DynamicDefaultsSync options={o} />
          <SetButton testId="raise-max-nodes" name="partitions.0.maxNodes" value={() => '2'} />
        </InForm>
      )
      const view = render(<TestComponent o={opts} />)
      return { view, capturedValues, TestComponent }
    }

    afterEach(() => {
      parserMock.mockImplementation(
        (({ obj }: { obj: unknown }) => obj) as unknown as typeof testEngine.evaluate,
      )
    })

    it('resolves the default per row and syncs the value when its inputs change', async () => {
      parserMock.mockImplementation((({ obj, inputs, index }: ParserCall) => {
        if (obj?.v !== template) {
          return obj
        }
        const row = inputs?.partitions?.[index]
        return {
          v: row?.provisioningMode === 'flex' && Number(row?.maxNodes) > 1,
        }
      }) as unknown as typeof testEngine.evaluate)

      const { view, capturedValues, TestComponent } = renderWithRaise(mkOptions())
      fireEvent.click(screen.getByTestId('raise-max-nodes'))
      // useParsedOpts hands the sync a fresh options identity on a dep change; rebuild to match.
      view.rerender(<TestComponent o={mkOptions()} />)

      await waitFor(() => {
        const last = capturedValues[capturedValues.length - 1] as {
          partitions: Array<Record<string, unknown>>
        }
        expect(last.partitions[0]?.['useNodeGroup']).toBe(true)
      })
    })

    it('skips an unresolvable template default without locking the field', async () => {
      // Parser passes templates through (e.g. wasm not ready): nothing written, nothing locked.
      const { view, capturedValues, TestComponent } = renderWithRaise(mkOptions())
      await waitFor(() => {
        const last = capturedValues[capturedValues.length - 1] as {
          partitions: Array<Record<string, unknown>>
        }
        expect(last.partitions[0]?.['useNodeGroup']).toBe(false)
      })

      // The same field must still sync on a later dep change — proof the skip did not lock it.
      parserMock.mockImplementation((({ obj, inputs, index }: ParserCall) => {
        if (obj?.v !== template) {
          return obj
        }
        const row = inputs?.partitions?.[index]
        return {
          v: row?.provisioningMode === 'flex' && Number(row?.maxNodes) > 1,
        }
      }) as unknown as typeof testEngine.evaluate)
      view.rerender(<TestComponent o={mkOptions()} />)
      fireEvent.click(screen.getByTestId('raise-max-nodes'))
      view.rerender(<TestComponent o={mkOptions()} />)

      await waitFor(() => {
        const last = capturedValues[capturedValues.length - 1] as {
          partitions: Array<Record<string, unknown>>
        }
        expect(last.partitions[0]?.['useNodeGroup']).toBe(true)
      })
    })
  })

  it('never auto-writes a field that carries a secondaryField (cannot maintain the pair)', async () => {
    const mk = (dflt: string) => ({
      instanceType: {
        type: 'dropdown',
        label: 'Instance Type',
        default: dflt,
        secondaryField: 'architecture',
        options: [
          { value: 'c2-standard-4', secondaryValue: 'x86_64' },
          { value: 't2a-standard-4', secondaryValue: 'arm64' },
        ],
      },
    })
    const initialValues = {
      instanceType: 'c2-standard-4',
      architecture: 'x86_64',
    }

    const { capturedValues } = renderTwoPhase(
      mk('c2-standard-4'),
      mk('t2a-standard-4'),
      initialValues,
    )

    await waitFor(() => expect(screen.getByTestId('mounted-indicator')).toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 50))

    const lastValues = capturedValues[capturedValues.length - 1]!
    expect(lastValues['instanceType']).toBe('c2-standard-4')
    expect(lastValues['architecture']).toBe('x86_64')
  })

  it("forgets a list's tracked state when a row is deleted (no transplanted lock state)", async () => {
    // Deleting row0 shifts the curated row1 onto index 0, where it would inherit row0's tracking.
    const mkOptions = (dflt: string) => ({
      partitions: {
        type: 'list',
        label: 'Partitions',
        options: {
          flavor: {
            type: 'string',
            label: 'Flavor',
            prefillDefault: true,
            default: dflt,
          },
        },
      },
    })
    const capturedValues: Record<string, unknown>[] = []
    const initialValues = { partitions: [{ flavor: 'x' }, { flavor: 'custom' }] }
    const TestComponent = ({ o }: { o: Record<string, unknown> }) => (
      <InForm values={initialValues} seen={capturedValues}>
        <DynamicDefaultsSync options={o} />
        <SetButton
          testId="delete-first-row"
          name="partitions"
          value={(values) => (values['partitions'] as unknown[]).slice(1)}
        />
      </InForm>
    )

    const view = render(<TestComponent o={mkOptions('x')} />)
    fireEvent.click(screen.getByTestId('delete-first-row'))
    view.rerender(<TestComponent o={mkOptions('y')} />)

    await waitFor(() => expect(screen.getByTestId('delete-first-row')).toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 50))

    const last = capturedValues[capturedValues.length - 1] as {
      partitions: Array<Record<string, unknown>>
    }
    expect(last.partitions).toHaveLength(1)
    expect(last.partitions[0]?.['flavor']).toBe('custom')
  })

  it('preserves a curated saved value across dependency changes (synth survives default flip)', async () => {
    // Saved=true with phase 1 default=false → synth-touched (curated).
    // Phase 2 default changes to something else → still preserved.
    const optionsA = {
      is_disabled: {
        type: 'boolean',
        hidden: true,
        default: false,
        label: 'Is Disabled',
      },
    }
    const optionsB = {
      is_disabled: {
        type: 'boolean',
        hidden: true,
        default: 'other',
        label: 'Is Disabled',
      },
    }
    const initialValues = { is_disabled: true }

    const { capturedValues } = renderTwoPhase(optionsA, optionsB, initialValues)

    await waitFor(() => expect(screen.getByTestId('mounted-indicator')).toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 50))

    const lastValues = capturedValues[capturedValues.length - 1]!
    expect(lastValues['is_disabled']).toBe(true)
  })

  it('syncs nested group fields when their default changes', async () => {
    const optionsA = {
      slurm: {
        type: 'object',
        label: 'SLURM',
        options: {
          is_disabled: {
            type: 'boolean',
            hidden: true,
            default: true,
            label: 'Is Disabled',
          },
        },
      },
    }
    const optionsB = {
      slurm: {
        type: 'object',
        label: 'SLURM',
        options: {
          is_disabled: {
            type: 'boolean',
            hidden: true,
            default: false,
            label: 'Is Disabled',
          },
        },
      },
    }
    const initialValues = { slurm: { is_disabled: true } }

    const { capturedValues } = renderTwoPhase(optionsA, optionsB, initialValues)

    await waitFor(() => {
      const lastValues = capturedValues[capturedValues.length - 1] as {
        slurm: { is_disabled: boolean }
      }
      expect(lastValues.slurm.is_disabled).toBe(false)
    })
  })

  it('does not sync when value already matches default', async () => {
    const options = {
      is_disabled: {
        type: 'boolean',
        hidden: true,
        default: true,
        label: 'Is Disabled',
      },
    }
    const initialValues = { is_disabled: true }

    const { capturedValues } = renderSinglePhase(options, initialValues)

    await waitFor(() => expect(screen.getByTestId('mounted-indicator')).toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 50))

    const lastValues = capturedValues[capturedValues.length - 1]!
    expect(lastValues['is_disabled']).toBe(true)
  })

  it('treats visible fields the same as hidden — sync-on-default-change applies uniformly', async () => {
    const optionsA = {
      label_prefix: {
        type: 'string',
        prefillDefault: true,
        default: 'A',
        label: 'Label',
      },
    }
    const optionsB = {
      label_prefix: {
        type: 'string',
        prefillDefault: true,
        default: 'B',
        label: 'Label',
      },
    }
    const initialValues = { label_prefix: 'A' }

    const { capturedValues } = renderTwoPhase(optionsA, optionsB, initialValues)

    await waitFor(() => {
      const lastValues = capturedValues[capturedValues.length - 1]!
      expect(lastValues['label_prefix']).toBe('B')
    })
  })

  it('handles null-resolving default that later becomes a real value (wasSeen via Map.has)', async () => {
    // Phase 1: the resolved default is null (e.g. an expression whose dep
    // hasn't arrived yet). Phase 2: a real value resolves. Without Map.has
    // disambiguating "tracked-with-null" from "never seen," phase 2 would
    // be treated as first-seen and the field would be wrongly synth-touched
    // (saved=undefined vs default=real differs), locking the field forever.
    const optionsA = {
      derived: {
        type: 'string',
        prefillDefault: true,
        default: null,
        label: 'Derived',
      },
    }
    const optionsB = {
      derived: {
        type: 'string',
        prefillDefault: true,
        default: 'resolved',
        label: 'Derived',
      },
    }
    const initialValues = { derived: undefined }

    const { capturedValues } = renderTwoPhase(optionsA, optionsB, initialValues)

    await waitFor(() => {
      const lastValues = capturedValues[capturedValues.length - 1]!
      expect(lastValues['derived']).toBe('resolved')
    })
  })

  it('preserves a real saved value when the default first resolves null then real', async () => {
    // Phase 1: defaultValue=null, saved="manual". First-seen check now
    // synth-touches because currVal diverges from the (null) default, even
    // though defaultValue is null. Phase 2: defaultValue="resolved",
    // wasSeen=true. Synth-touched short-circuit fires → "manual" is preserved.
    const optionsA = {
      derived: {
        type: 'string',
        prefillDefault: true,
        default: null,
        label: 'Derived',
      },
    }
    const optionsB = {
      derived: {
        type: 'string',
        prefillDefault: true,
        default: 'resolved',
        label: 'Derived',
      },
    }
    const initialValues = { derived: 'manual' }

    const { capturedValues } = renderTwoPhase(optionsA, optionsB, initialValues)

    await waitFor(() => {
      const lastValues = capturedValues[capturedValues.length - 1]!
      expect(lastValues['derived']).toBe('manual')
    })
  })

  it('does not synth-touch when saved value and default are both null', async () => {
    // Both serializedDefault and currVal must encode null the same way.
    // Pre-fix: serializedDefault was the JS `null`, currVal was the string
    // "null" from JSON.stringify(null) — they compared unequal and the field
    // got synth-touched on first-seen, so phase-2 default changes would no
    // longer sync.
    const optionsA = {
      derived: {
        type: 'string',
        prefillDefault: true,
        default: null,
        label: 'Derived',
      },
    }
    const optionsB = {
      derived: {
        type: 'string',
        prefillDefault: true,
        default: 'resolved',
        label: 'Derived',
      },
    }
    // Saved value is JS null (not undefined, not "manual").
    const initialValues = { derived: null }

    const { capturedValues } = renderTwoPhase(optionsA, optionsB, initialValues)

    await waitFor(() => {
      const lastValues = capturedValues[capturedValues.length - 1]!
      // Sync should fire on phase 2 — saved null didn't diverge from the
      // null default, so synth-touched was NOT set, so the default change
      // flows through.
      expect(lastValues['derived']).toBe('resolved')
    })
  })

  it('prunes prev-default + synth-touched entries when a list item is removed', async () => {
    // Two-item list → one-item list. The dropped index's path should no longer
    // be reachable in fieldsWithDefaults, so the prune block deletes its
    // entries from both refs. We can't read the refs directly, so we drive
    // the assertion by re-adding an item back later and verifying it tracks
    // fresh rather than reusing the previous index's prev-default state.
    const fieldA = {
      type: 'string',
      prefillDefault: true,
      default: 'computed',
      label: 'F',
    }
    const optionsTwo = {
      lst: {
        type: 'list',
        template: { f: fieldA },
      },
    }
    const initialValues = { lst: [{ f: 'a' }, { f: 'b' }] }
    const { capturedValues } = renderTwoPhase(
      optionsTwo,
      // Phase 2: list shrunk to one item (index 1 dropped).
      {
        lst: {
          type: 'list',
          template: { f: fieldA },
        },
      },
      initialValues,
    )
    await waitFor(() => {
      // Surviving item keeps its saved value (not overwritten by sync).
      const last = capturedValues[capturedValues.length - 1] as {
        lst: Array<{ f: string }>
      }
      expect(last.lst[0]!.f).toBe('a')
    })
  })
})

describe('resolveMetaOverrides', () => {
  it('falls back to inherited props when options have no $meta', () => {
    expect(resolveMetaOverrides(undefined, 'left', false)).toEqual({
      labelPosition: 'left',
      spaceCompact: false,
    })
    expect(resolveMetaOverrides({}, 'top', true)).toEqual({
      labelPosition: 'top',
      spaceCompact: true,
    })
  })

  it('uses $meta values when provided', () => {
    expect(
      resolveMetaOverrides({ $meta: { labelPosition: 'top', spaceCompact: true } }, 'left', false),
    ).toEqual({ labelPosition: 'top', spaceCompact: true })
  })

  it('mixes $meta and inherited values per field', () => {
    expect(resolveMetaOverrides({ $meta: { labelPosition: 'top' } }, 'left', true)).toEqual({
      labelPosition: 'top',
      spaceCompact: true,
    })
    expect(resolveMetaOverrides({ $meta: { spaceCompact: false } }, 'top', true)).toEqual({
      labelPosition: 'top',
      spaceCompact: false,
    })
  })

  it('treats undefined $meta values as missing (??) — falls back to inherited', () => {
    // Earlier the top-level form used `||` for labelPosition; `??` is what we
    // standardised on so an explicit `labelPosition: undefined` falls back.
    expect(resolveMetaOverrides({ $meta: { labelPosition: undefined } }, 'top', false)).toEqual({
      labelPosition: 'top',
      spaceCompact: false,
    })
  })
})

describe('DynamicForm default-tracking (integration)', () => {
  // Integration tests simulate dependency-driven default changes by rerendering
  // with a schema whose `default` value differs from phase 1's. The sync iteration's
  // prev-default tracker fires when it sees a different resolved default for a
  // previously-recorded field.
  const sharedProps = {
    workflowForm: true as const,
  }

  it('syncs nested-group hidden field when its resolved default changes', async () => {
    const baseSchema = {
      scheduler: {
        type: 'boolean',
        label: 'Enable Scheduler',
        default: true,
      },
      slurm: {
        type: 'object',
        label: 'SLURM Directives',
        options: {
          is_disabled: {
            type: 'boolean',
            hidden: true,
            default: true,
            label: 'Is SLURM disabled?',
          },
        },
      },
    }

    const updatedSchema = {
      ...baseSchema,
      slurm: {
        ...baseSchema.slurm,
        options: {
          is_disabled: {
            ...baseSchema.slurm.options.is_disabled,
            default: false,
          },
        },
      },
    }

    const initialValues = {
      scheduler: true,
      slurm: { is_disabled: true },
    }

    const { form, rerender } = renderDynamicForm(
      <DynamicForm formJSONs={baseSchema} initialValues={initialValues} {...sharedProps} />,
    )

    rerender(
      <DynamicForm formJSONs={updatedSchema} initialValues={initialValues} {...sharedProps} />,
    )

    await waitFor(() => {
      const lastValues = form.getValues() as {
        slurm: { is_disabled: boolean }
      }
      expect(lastValues?.slurm?.is_disabled).toBe(false)
    })
  })

  it('preserves a saved value that diverged from the resolved default at first-seen', async () => {
    const schema = {
      scheduler: {
        type: 'boolean',
        label: 'Enable Scheduler',
      },
      slurm: {
        type: 'object',
        label: 'SLURM Directives',
        options: {
          is_disabled: {
            type: 'boolean',
            hidden: true,
            default: false,
            label: 'Is SLURM disabled?',
          },
        },
      },
    }

    const { form } = renderDynamicForm(
      <DynamicForm
        formJSONs={schema}
        initialValues={{
          scheduler: true,
          slurm: { is_disabled: true },
        }}
        workflowForm={true}
      />,
    )

    await new Promise((resolve) => setTimeout(resolve, 50))
    const lastValues = form.getValues() as {
      slurm: { is_disabled: boolean }
    }
    expect(lastValues.slurm.is_disabled).toBe(true)
  })

  it('preserves a curated saved value across a default change', async () => {
    // Phase 1: saved=false, default=true → diverges → synth touched.
    // Phase 2: default flips to false. synth still active → preserve saved (false).

    const baseSchema = {
      scheduler: {
        type: 'boolean',
        label: 'Enable Scheduler',
      },
      slurm: {
        type: 'object',
        label: 'SLURM Directives',
        options: {
          is_disabled: {
            type: 'boolean',
            hidden: true,
            default: true,
            label: 'Is SLURM disabled?',
          },
        },
      },
    }

    const updatedSchema = {
      ...baseSchema,
      slurm: {
        ...baseSchema.slurm,
        hidden: true,
        options: {
          is_disabled: {
            ...baseSchema.slurm.options.is_disabled,
            default: false,
          },
        },
      },
    }

    const initialValues = {
      scheduler: false,
      slurm: { is_disabled: false },
    }

    const { form, rerender } = renderDynamicForm(
      <DynamicForm formJSONs={baseSchema} initialValues={initialValues} workflowForm={true} />,
    )

    rerender(
      <DynamicForm formJSONs={updatedSchema} initialValues={initialValues} workflowForm={true} />,
    )

    await new Promise((resolve) => setTimeout(resolve, 50))

    const lastValues = form.getValues() as {
      slurm: { is_disabled: boolean }
    }
    expect(lastValues?.slurm?.is_disabled).toBe(false)
  })
})

describe('DynamicDefaultsSync preserves list item touched state', () => {
  // Regression: appending an item to a list must not cause DynamicDefaultsSync to reset sibling items'
  // user-set values. Writing the list must leave each item's touched state alone, or the sync sees the
  // item untouched and reverts a value differing from its default.
  it('should NOT reset a list item boolean when a new item is appended', async () => {
    const capturedValues: Record<string, unknown>[] = []
    const options = {
      workers: {
        type: 'list',
        template: {
          scheduler: {
            type: 'boolean',
            hidden: false,
            default: true,
            label: 'Schedule Job?',
          },
        },
      },
    }
    let form: UseFormReturn | undefined
    function Grab() {
      form = useFormContext()
      return null
    }
    const TestComponent = ({ opts }: { opts: Record<string, unknown> }) => (
      <InForm values={{ workers: [{ scheduler: true }] }} seen={capturedValues}>
        <Grab />
        <DynamicDefaultsSync options={opts} />
      </InForm>
    )

    // Phase 1: mount with empty options so the sync ref initializes to []
    const { rerender } = render(<TestComponent opts={{}} />)
    // The user switches the first worker off.
    act(() => form?.setValue('workers.0.scheduler', false, { shouldTouch: true }))
    // Phase 2: mount with real options — triggers the sync ref diff
    rerender(<TestComponent opts={options} />)
    // Appending a new worker writes the list path only.
    act(() => form?.setValue('workers', [{ scheduler: false }, { scheduler: true }]))

    await waitFor(() => {
      const last = capturedValues[capturedValues.length - 1] as {
        workers: Array<{ scheduler: boolean }>
      }
      expect(last.workers).toHaveLength(2)
    })

    // The touched state for workers.0.scheduler must survive the append,
    // so DynamicDefaultsSync skips it and the user's false stays false.
    const last = capturedValues[capturedValues.length - 1] as {
      workers: Array<{ scheduler: boolean }>
    }
    expect(last.workers[0]!.scheduler).toBe(false)
    expect(last.workers[1]!.scheduler).toBe(true)
  })
})

describe('defaultReferencesField', () => {
  it('flags any self-reference, transforming or bare', () => {
    expect(defaultReferencesField('${{ inputs.a }}_x', 'a')).toBe(true)
    expect(defaultReferencesField('x${{ inputs.a }}', 'a')).toBe(true)
    expect(defaultReferencesField('${{ inputs.a }}', 'a')).toBe(true)
    expect(defaultReferencesField('${{inputs.a}}', 'a')).toBe(true)
    expect(
      defaultReferencesField('${{ inputs.cluster.settings.time }}!', 'cluster.settings.time'),
    ).toBe(true)
  })

  it('does not flag references to other fields', () => {
    expect(defaultReferencesField('${{ inputs.b }}', 'a')).toBe(false)
    // prefix collision must not match
    expect(defaultReferencesField('${{ inputs.region_name }}', 'region')).toBe(false)
    // sibling within a group is not a self-reference
    expect(
      defaultReferencesField('${{ inputs.cluster.scheduler }}', 'cluster.settings.is_disabled'),
    ).toBe(false)
  })

  it('ignores non-expression and non-string defaults', () => {
    expect(defaultReferencesField('hello', 'a')).toBe(false)
    expect(defaultReferencesField(42, 'a')).toBe(false)
    expect(defaultReferencesField(undefined, 'a')).toBe(false)
  })
})

describe('resetOnChange', () => {
  it('clears the field when the field at its path changes, but not on first render', async () => {
    const options = {
      region: { type: 'string', label: 'Region' },
      zone: { type: 'string', label: 'Zone', resetOnChange: 'region' },
    }
    const seen: Record<string, unknown>[] = []
    const latest = () => seen.at(-1) ?? {}

    render(
      <InForm values={{ region: 'north', zone: 'north-1' }} seen={seen}>
        <FieldsFromOptions options={options} />
        <SetButton testId="change-region" name="region" value={() => 'south'} />
      </InForm>,
    )

    expect(latest()).toHaveProperty('zone', 'north-1')

    fireEvent.click(screen.getByTestId('change-region'))

    await waitFor(() => {
      expect(latest()).toHaveProperty('region', 'south')
    })
    expect(latest()['zone']).toBeUndefined()
  })
})

describe('findSelfReferencingFieldNames', () => {
  it('returns self-referencing field paths from raw workflow inputs', () => {
    const inputs = {
      greeting: {
        type: 'string',
        hidden: true,
        default: '${{ inputs.greeting }}_x',
      },
      mirror: { type: 'string', hidden: true, default: '${{ inputs.other }}' },
      bare: { type: 'string', hidden: true, default: '${{ inputs.bare }}' },
      group: {
        type: 'object',
        items: {
          time: {
            type: 'string',
            hidden: true,
            default: 'at ${{ inputs.group.time }}',
          },
        },
      },
    }
    expect(findSelfReferencingFieldNames(inputs)).toEqual(['greeting', 'bare', 'group.time'])
  })

  it('returns an empty array when nothing references itself', () => {
    expect(
      findSelfReferencingFieldNames({
        a: { type: 'string', hidden: true, default: 'plain' },
        b: { type: 'string', hidden: true, default: '${{ inputs.a }}' },
      }),
    ).toEqual([])
  })
})

// workflow.schema.json declares optional/hidden/ignore as ["string", "boolean"], so a
// field flag can hold an expression. When that expression cannot resolve at form-render
// time the parser hands back the raw ${{…}} string, which is truthy — the opposite of
// every flag's documented `false` default.
describe('unresolved expression in a schema flag', () => {
  const unresolvable = "${{ inputs.volumes.[index].type != 'pvc' }}"

  it('keeps a field required when its optional expression cannot be resolved', async () => {
    render(
      <DynamicForm
        formJSONs={{
          expressionOptional: {
            type: 'string',
            label: 'Expression Optional',
            optional: unresolvable,
          },
        }}
        initialValues={{}}
        onValuesChange={() => {}}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('field-expressionOptional')).toBeInTheDocument()
    })
    // `optional` defaults to false, so an unknowable flag must not drop the asterisk.
    expect(screen.getByTestId('field-expressionOptional')).toHaveAttribute('data-optional', 'false')
  })

  it('keeps a value when its ignore expression cannot be resolved', async () => {
    const { form } = renderDynamicForm(
      <DynamicForm
        formJSONs={{
          visibleField: { type: 'string', label: 'Visible Field' },
          hiddenExpressionIgnore: {
            type: 'string',
            label: 'Hidden Expression Ignore',
            hidden: true,
            ignore: unresolvable,
          },
        }}
        initialValues={{
          visibleField: 'visible',
          hiddenExpressionIgnore: 'should-be-kept',
        }}
        workflowForm={false}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('field-visibleField')).toBeInTheDocument()
    })
    // Deleting user data on a flag we could not evaluate is not recoverable.
    const lastValues = form.getValues()
    expect(lastValues).toHaveProperty('hiddenExpressionIgnore')
  })
})

describe('remote context', () => {
  it('reaches the parser so a remote workflow previews what its run resolves', async () => {
    const parserMock = vi.mocked(testEngine.evaluate)
    parserMock.mockClear()
    const remoteVars = {
      repo: 'https://github.com/example/demo',
      branch: 'canary',
    }
    const formJSONs = {
      branch: {
        type: 'string',
        label: 'Branch',
        default: '${{ remote.branch }}',
      },
    }
    const initialValues = { branch: '${{ remote.branch }}' }

    render(
      <DynamicForm
        formJSONs={formJSONs}
        initialValues={initialValues}
        remoteVars={remoteVars}
        onValuesChange={() => {}}
        workflowForm
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('field-branch')).toBeInTheDocument()
    })

    // The schema parse and the initial-values parse are the two that decide what the
    // form shows before submit; both have to see the same context the run will use.
    const schemaCall = parserMock.mock.calls.find(([args]) => args.obj === formJSONs)
    const valuesCall = parserMock.mock.calls.find(([args]) => args.obj === initialValues)
    expect(schemaCall?.[0].remoteVars).toBe(remoteVars)
    expect(valuesCall?.[0].remoteVars).toBe(remoteVars)
  })
})
