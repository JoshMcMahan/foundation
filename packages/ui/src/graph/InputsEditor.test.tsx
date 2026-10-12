// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import {
  applyGraphEdit,
  convertToDynamicForm,
  dumpYaml,
  loadYaml,
  workflowInputsSchema,
} from '@parallelworks/workflow-parser'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The editor calls useWorkflowEngine(), which throws outside a UIProvider carrying one.
vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)

// jsdom has no PointerEvent; without it pointer events lose button and coordinates.
if (!('PointerEvent' in window)) {
  Object.defineProperty(window, 'PointerEvent', { value: MouseEvent })
}

vi.mock('@parallelworks/workflow-parser', async () => ({
  ...(await vi.importActual<typeof import('@parallelworks/workflow-parser')>(
    '@parallelworks/workflow-parser',
  )),
  parseStringsOfObj: vi.fn(({ obj }: { obj: unknown }) => obj),
  parseStringsOfObjReady: true,
  callWhenParserInitialized: vi.fn((cb: (ready: boolean) => void) => {
    cb(true)
    return () => {}
  }),
  initializeParseStringsOfObj: vi.fn(() => Promise.resolve()),
}))

// Monaco can't run in jsdom; a textarea stands in, labelled by the model path.
vi.mock('../editor/Monaco', () => ({
  default: ({
    value,
    onChange,
    path,
  }: {
    value?: string
    onChange?: (value: string) => void
    path?: string
  }) => <textarea aria-label={path} value={value} onChange={(e) => onChange?.(e.target.value)} />,
}))
vi.mock('../components/Dropdown', () => import('../test/DropdownStandIn'))

import type { GraphEdit } from '../editing'
import { DynamicForm } from '../form/Form'
import { resolveFormLayout } from '../form/layout'
import { suggestionsOf } from '../test/DropdownStandIn'
import ListStandIn from '../test/ListStandIn'
import type { DependencyGraphEditor, EditorProblem } from './editorApi'
import { GRAPH_EDITOR_STRINGS, INPUTS_EDITOR_STRINGS } from './editorStrings'
import { INPUT_TYPE_GROUPS } from './InputDialog'
import { InputsFormEditor } from './InputsEditor'
import { inputCell } from './inputRows'
import { asRecord } from './records'

afterEach(cleanup)

const INPUTS = {
  name: { type: 'string', label: 'Name' },
  secret: { type: 'string', hidden: true },
  settings: {
    type: 'group',
    label: 'Settings',
    items: { size: { type: 'number', label: 'Size' } },
  },
}

function editor(overrides: Partial<DependencyGraphEditor> = {}): DependencyGraphEditor {
  return {
    onEdit: vi.fn(() => ({ yml: '', layout: undefined })),
    canUndo: true,
    canRedo: false,
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    // Most of these drive the form; the dialog opens as YAML unless told otherwise.
    settingsView: 'form',
    ...overrides,
  }
}

function editsOf(e: DependencyGraphEditor): GraphEdit[] {
  const flatten = (edit: GraphEdit): GraphEdit[] =>
    edit.type === 'batch' ? edit.edits.flatMap(flatten) : [edit]
  return flatten(vi.mocked(e.onEdit).mock.lastCall?.[0] as GraphEdit)
}

function resultOf(e: DependencyGraphEditor, inputs: Record<string, unknown>) {
  const edit = vi.mocked(e.onEdit).mock.lastCall?.[0]
  if (!edit) throw new Error('No edit was submitted')
  const result = applyGraphEdit(
    { yml: dumpYaml({ on: { execute: { inputs } } }), layout: undefined },
    edit,
  )
  const next = asRecord(workflowInputsSchema(asRecord(loadYaml(result.yml))))
  const layout = asRecord(next['$meta'])['layout']
  expect(
    resolveFormLayout(
      layout,
      Object.keys(next).filter((name) => name !== '$meta'),
    ).issues,
  ).toEqual([])
  return { inputs: next, layout }
}

function fieldsOf(value: unknown): string[] {
  const node = asRecord(value)
  return node['type'] === 'field'
    ? [String(node['field'])]
    : Array.isArray(node['children'])
      ? node['children'].flatMap(fieldsOf)
      : []
}

function renderForm(e: DependencyGraphEditor, inputs: Record<string, unknown> = INPUTS) {
  return render(
    <InputsFormEditor editor={e} inputs={inputs}>
      <DynamicForm formJSONs={convertToDynamicForm(inputs)} initialValues={{}} workflowForm />
    </InputsFormEditor>,
  )
}

function row(path: string[]): HTMLElement {
  const el = document.querySelector(`[data-input-path='${JSON.stringify(path)}']`)
  if (!(el instanceof HTMLElement)) {
    throw new Error(`no row for ${path.join('.')}`)
  }
  return el
}

// The editor's own bar, not a group's or list's row, holds the form's page commands.
function barButton(name: string): HTMLElement {
  const found = screen
    .getAllByRole('button', { name })
    .find((button) => !button.closest('[data-input-path]'))
  if (!found) {
    throw new Error(`no ${name} on the bar`)
  }
  return found
}

// The add menu lists types by group; the types these tests add are all basic ones.
function pickType(label: string) {
  const menu = screen.getByRole('menu')
  fireEvent.click(within(menu).getByText('Basic'))
  fireEvent.click(within(menu).getByText(label))
}

// The suggestions a field offers, as the dropdown stand-in lists them.
describe('InputsFormEditor', () => {
  it('gives every input a row, hidden and grouped ones included', () => {
    renderForm(editor())
    expect(within(row(['name'])).getByText('Text')).toBeInTheDocument()
    expect(within(row(['secret'])).getByText('hidden')).toBeInTheDocument()
    expect(within(row(['settings', 'size'])).getByText('Number')).toBeInTheDocument()
  })

  it('ends every list with an add button naming the list, a nested one further in', () => {
    renderForm(editor(), { ...INPUTS, empty: { type: 'group', label: 'Empty', items: {} } })
    expect(screen.getByText('Add input').closest('button')).not.toHaveClass('ml-4')
    expect(screen.getByText('Add field to Settings').closest('button')).toHaveClass('ml-4')
    expect(within(row(['empty'])).getByText('Add field to Empty')).toBeInTheDocument()
  })

  it('adds an input of the picked type at the end once its dialog saves', () => {
    const e = editor()
    renderForm(e)
    fireEvent.click(screen.getByRole('button', { name: 'Input' }))
    pickType('Number')
    expect(screen.getByLabelText('Name')).toHaveValue('input_1')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'addInput',
      parent: [],
      index: 3,
      name: 'input_1',
      definition: { type: 'number' },
    })
  })

  it('lists the type groups and finds any type by search', () => {
    renderForm(editor())
    fireEvent.click(screen.getByRole('button', { name: 'Input' }))
    const menu = screen.getByRole('menu')
    const types = INPUTS_EDITOR_STRINGS.types as Record<string, string>
    const labels = () =>
      within(menu)
        .getAllByRole('button')
        .map((button) => button.textContent)
    expect(labels()).toEqual(
      INPUT_TYPE_GROUPS.map(([group]) => INPUTS_EDITOR_STRINGS.typeGroups[group]),
    )
    const search = within(menu).getByRole('searchbox', { name: 'Search types' })
    expect(search).toHaveFocus()
    fireEvent.change(search, { target: { value: 'nothing like it' } })
    expect(within(menu).getByText('No matching types')).toBeInTheDocument()
    fireEvent.change(search, { target: { value: 'kubernetes-pv' } })
    expect(labels()).toEqual([types['kubernetes-pvc']])
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(screen.getByLabelText('Type')).toHaveValue(types['kubernetes-pvc'])
  })

  it('lists the form’s gestures and keys from its toolbar', () => {
    renderForm(editor())
    fireEvent.click(screen.getByRole('button', { name: 'Shortcuts' }))
    const list = screen.getByRole('dialog', { name: 'Shortcuts' })
    expect(within(list).getByText(GRAPH_EDITOR_STRINGS.shortcutDoes.moveInput)).toBeInTheDocument()
  })

  it('scrolls a picked problem’s input into view and opens it', () => {
    let show: ((problem: EditorProblem) => boolean) | undefined
    renderForm(
      editor({
        registerShow: (next) => {
          show = next
          return () => {}
        },
      }),
    )
    const row = document.querySelector('[data-input-path=\'["name"]\']') as HTMLElement
    const scroll = vi.fn()
    row.scrollIntoView = scroll
    act(() => {
      expect(show?.({ message: '', line: 3, input: ['name'] })).toBe(true)
    })
    expect(scroll).toHaveBeenCalledOnce()
    expect(screen.getByRole('dialog', { name: 'Edit input' })).toBeInTheDocument()
    expect(show?.({ message: '', line: 3, input: ['nowhere'] })).toBe(false)
  })

  it('adds a field inside a group', () => {
    const e = editor()
    renderForm(e)
    fireEvent.click(
      within(row(['settings', 'size'])).getByRole('button', { name: 'Add input below' }),
    )
    pickType('Switch')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'addInput',
        parent: ['settings'],
        index: 1,
        definition: { type: 'boolean' },
      }),
    )
  })

  it('takes focus back after an edit from a row, so undo keys still reach the form', async () => {
    const e = editor()
    renderForm(e)
    const form = row(['name']).closest<HTMLElement>('[tabindex="0"]') as HTMLElement
    fireEvent.click(within(row(['name'])).getByRole('button', { name: 'Delete input' }))
    await waitFor(() => expect(form).toHaveFocus())
    fireEvent.keyDown(form, { key: 'z', metaKey: true })
    expect(e.onUndo).toHaveBeenCalledOnce()
  })

  it('removes, moves and edits from a row', () => {
    const e = editor()
    renderForm(e)
    fireEvent.click(within(row(['name'])).getByRole('button', { name: 'Delete input' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'deleteInput',
      path: ['name'],
    })

    fireEvent.contextMenu(row(['name']), { clientX: 5, clientY: 5 })
    fireEvent.click(screen.getByText('Move down'))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'moveInputs',
      paths: [['name']],
      parent: [],
      index: 2,
    })

    fireEvent.click(within(row(['name'])).getByRole('button', { name: 'Edit input' }))
    fireEvent.change(screen.getByLabelText('Label'), {
      target: { value: 'Full name' },
    })
    fireEvent.change(screen.getByLabelText('Name'), {
      target: { value: 'full_name' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateInput',
      path: ['name'],
      name: 'full_name',
      set: { label: 'Full name' },
      unset: [],
    })
  })

  it('lists the fields of a hidden group so they stay editable', () => {
    const e = editor()
    renderForm(e, {
      ...INPUTS,
      advanced: {
        type: 'group',
        hidden: true,
        items: { depth: { type: 'number' } },
      },
    } as typeof INPUTS)
    expect(within(row(['advanced'])).getAllByText('hidden')).toHaveLength(1)
    expect(within(row(['advanced', 'depth'])).queryByText('hidden')).toBeNull()
    fireEvent.click(
      within(row(['advanced', 'depth'])).getByRole('button', { name: 'Add input below' }),
    )
    pickType('Text')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'addInput', parent: ['advanced'] }),
    )
  })

  it('pages a wizard as it runs, turned by its own controls and the bar’s page number', () => {
    renderForm(editor(), {
      $meta: { wizard: { mode: 'wizard' } },
      first: {
        type: 'step',
        title: 'First',
        options: { a: { type: 'string' } },
      },
      second: {
        type: 'step',
        title: 'Second',
        options: { b: { type: 'string' } },
      },
    } as unknown as typeof INPUTS)
    expect(row(['first', 'a'])).toBeInTheDocument()
    expect(
      document.querySelector(`[data-input-path='${JSON.stringify(['second', 'b'])}']`),
    ).toBeNull()
    fireEvent.change(screen.getByLabelText('Page shown'), { target: { value: '2' } })
    expect(row(['second', 'b'])).toBeInTheDocument()
    expect(within(row(['second'])).getByText('Wizard step')).toBeInTheDocument()
    expect(
      document.querySelector(`[data-input-path='${JSON.stringify(['first', 'a'])}']`),
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Go to previous step' }))
    expect(row(['first', 'a'])).toBeInTheDocument()
    expect(screen.getByLabelText('Page shown')).toHaveValue(1)
  })

  it('edits a repeated page’s fields from any copy, the bar counting each copy as a page', async () => {
    renderForm(editor(), {
      $meta: { wizard: { mode: 'wizard' } },
      hosts: {
        type: 'step',
        title: 'Host',
        multi: true,
        min: 2,
        options: { cpus: { type: 'number' } },
      },
      done: { type: 'step', title: 'Done', options: { note: { type: 'string' } } },
    } as unknown as typeof INPUTS)
    expect(await screen.findByText('/ 3')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Page shown'), { target: { value: '2' } })
    expect(row(['hosts', 'cpus']).dataset['inputInstance']).toBe('hosts[1].cpus')
    expect(within(row(['hosts', 'cpus'])).getByText('Number')).toBeInTheDocument()
  })

  it('starts a repeated page with no copy, as the run form does, and adds the first from it', async () => {
    renderForm(editor(), {
      $meta: { wizard: { mode: 'wizard' } },
      hosts: { type: 'step', title: 'Host', multi: true, options: { cpus: { type: 'number' } } },
      done: { type: 'step', title: 'Done', options: { note: { type: 'string' } } },
    } as unknown as typeof INPUTS)
    expect(await screen.findByText('/ 2')).toBeInTheDocument()
    expect(
      document.querySelector(`[data-input-path='${JSON.stringify(['hosts', 'cpus'])}']`),
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '+ Add Host' }))
    expect(await screen.findByRole('heading', { name: 'Host 1' })).toBeInTheDocument()
    expect(row(['hosts', 'cpus']).dataset['inputInstance']).toBe('hosts[0].cpus')
  })

  it('offers the form’s inputs to a setting that reads one', () => {
    const e = editor()
    renderForm(e, {
      cluster: { type: 'compute-clusters', label: 'Cluster' },
      partition: { type: 'slurm-partitions', resource: '' },
    } as unknown as typeof INPUTS)
    fireEvent.click(within(row(['partition'])).getByRole('button', { name: 'Edit input' }))
    const resource = screen.getByLabelText('Cluster')
    expect(suggestionsOf(resource).map((option) => [option.value, option.label])).toEqual([
      ['${{ inputs.cluster }}', 'Cluster'],
    ])
    // Only an expression reads another input.
    fireEvent.change(resource, { target: { value: 'cluster' } })
    expect(screen.getByText(GRAPH_EDITOR_STRINGS.invalidExpressionValue)).toBeInTheDocument()
    fireEvent.change(resource, { target: { value: '${{ inputs.cluster }}' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateInput',
      path: ['partition'],
      set: { resource: '${{ inputs.cluster }}' },
      unset: [],
    })
  })

  it('adds an input made for a setting just before the field that reads it', () => {
    const e = editor()
    renderForm(e, {
      name: { type: 'string' },
      partition: { type: 'slurm-partitions', resource: '' },
    } as unknown as typeof INPUTS)
    fireEvent.click(within(row(['partition'])).getByRole('button', { name: 'Edit input' }))
    fireEvent.click(screen.getByRole('button', { name: 'New Cluster input…' }))
    const dialogs = screen.getAllByRole('dialog')
    const created = dialogs[dialogs.length - 1] as HTMLElement
    expect(within(created).getByLabelText('Name')).toHaveValue('cluster')
    fireEvent.click(within(created).getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        {
          type: 'addInput',
          parent: [],
          index: 1,
          name: 'cluster',
          definition: { type: 'compute-clusters' },
        },
        {
          type: 'updateInput',
          path: ['partition'],
          set: { resource: '${{ inputs.cluster }}' },
          unset: [],
        },
      ],
    })
  })

  it('keeps an input made in a wizard inside the step that reads it', () => {
    const e = editor()
    renderForm(e, {
      $meta: { wizard: { mode: 'wizard' } },
      first: {
        type: 'step',
        title: 'First',
        options: { partition: { type: 'slurm-partitions', resource: '' } },
      },
    } as unknown as typeof INPUTS)
    fireEvent.click(
      within(row(['first', 'partition'])).getByRole('button', {
        name: 'Edit input',
      }),
    )
    fireEvent.click(screen.getByRole('button', { name: 'New Cluster input…' }))
    const dialogs = screen.getAllByRole('dialog')
    const created = dialogs[dialogs.length - 1] as HTMLElement
    fireEvent.click(within(created).getByRole('button', { name: 'Save' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        {
          type: 'addInput',
          parent: ['first'],
          index: 0,
          name: 'cluster',
          definition: { type: 'compute-clusters' },
        },
        {
          type: 'updateInput',
          path: ['first', 'partition'],
          set: { resource: '${{ inputs.cluster }}' },
          unset: [],
        },
      ],
    })
  })

  it('keeps each row’s index current when the inputs are reordered', () => {
    const e = editor()
    const { rerender } = renderForm(e)
    const reordered = {
      settings: INPUTS.settings,
      name: INPUTS.name,
      secret: INPUTS.secret,
    }
    rerender(
      <InputsFormEditor editor={e} inputs={reordered}>
        <DynamicForm formJSONs={convertToDynamicForm(reordered)} initialValues={{}} workflowForm />
      </InputsFormEditor>,
    )
    expect(row(['settings']).dataset['inputIndex']).toBe('0')
    expect(row(['name']).dataset['inputIndex']).toBe('1')
    expect(row(['secret']).dataset['inputIndex']).toBe('2')
  })

  it('follows two inputs with the same definition when they trade places', () => {
    const e = editor()
    const first = { x: { type: 'string' }, y: { type: 'string' } }
    const { rerender } = renderForm(e, first as unknown as typeof INPUTS)
    const swapped = { y: { type: 'string' }, x: { type: 'string' } }
    rerender(
      <InputsFormEditor editor={e} inputs={swapped}>
        <DynamicForm formJSONs={convertToDynamicForm(swapped)} initialValues={{}} workflowForm />
      </InputsFormEditor>,
    )
    const paths = [...document.querySelectorAll('[data-input-path]')].map((el) =>
      el.getAttribute('data-input-path'),
    )
    expect(paths).toEqual(['["y"]', '["x"]'])
  })

  it('opens a row’s toolbar above its field only while the pointer is over that row', () => {
    renderForm(editor())
    // The strip the toolbar opens in, which sits above the field rather than over it.
    const toolbar = (path: string[]) =>
      within(row(path)).getAllByRole('button', { name: 'Edit input' })[0]?.parentElement
        ?.parentElement as HTMLElement
    expect(toolbar(['name'])).toHaveClass('h-0')
    expect(toolbar(['name'])).not.toHaveClass('absolute')
    fireEvent.pointerOver(row(['name']))
    expect(toolbar(['name'])).toHaveClass('h-7')
    fireEvent.pointerOver(row(['settings', 'size']))
    expect(toolbar(['name'])).toHaveClass('h-0')
    expect(toolbar(['settings', 'size'])).toHaveClass('h-7')
    expect(toolbar(['settings'])).toHaveClass('h-0')
  })

  it('opens an input as YAML and saves the text as written', async () => {
    const e = editor({ settingsView: 'yaml' })
    renderForm(e)
    fireEvent.click(within(row(['name'])).getByRole('button', { name: 'Edit input' }))
    const text = await screen.findByLabelText('file:///workflow-input.yaml')
    expect(text).toHaveValue('type: string\nlabel: Name\n')
    fireEvent.change(text, {
      target: { value: 'type: string\nlabel: Full name # shown\n' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'setInputYaml',
      path: ['name'],
      yaml: 'type: string\nlabel: Full name # shown\n',
    })
  })

  it('renames an input from its YAML view', async () => {
    const e = editor({ settingsView: 'yaml' })
    renderForm(e)
    fireEvent.click(within(row(['name'])).getByRole('button', { name: 'Edit input' }))
    await screen.findByLabelText('file:///workflow-input.yaml')
    const name = screen.getByLabelText('Name')
    expect(name).toHaveValue('name')
    fireEvent.change(name, { target: { value: 'settings' } })
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    fireEvent.change(name, { target: { value: 'full_name' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        { type: 'updateInput', path: ['name'], name: 'full_name' },
        {
          type: 'setInputYaml',
          path: ['full_name'],
          yaml: 'type: string\nlabel: Name\n',
        },
      ],
    })
  })

  it('carries YAML edits into the form, which saves them with its own', async () => {
    const onSettingsViewChange = vi.fn()
    const e = editor({ settingsView: 'yaml', onSettingsViewChange })
    renderForm(e)
    fireEvent.click(within(row(['name'])).getByRole('button', { name: 'Edit input' }))
    fireEvent.change(await screen.findByLabelText('file:///workflow-input.yaml'), {
      target: { value: 'type: string\nlabel: Full name\n' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Form' }))
    expect(onSettingsViewChange).toHaveBeenCalledWith('form')
    expect(screen.getByLabelText('Label')).toHaveValue('Full name')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(e.onEdit).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'updateInput',
        path: ['name'],
        set: { label: 'Full name' },
      }),
    )
  })

  it('lifts a type submenu that would run past the bottom of the window', () => {
    const real = Element.prototype.getBoundingClientRect
    // jsdom lays nothing out, so the submenu reports where it would sit: past the bottom of the window.
    const rect = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      return this.classList.contains('-top-1')
        ? DOMRect.fromRect({ x: 0, y: window.innerHeight - 60, width: 180, height: 200 })
        : real.call(this)
    })
    renderForm(editor())
    fireEvent.click(screen.getByRole('button', { name: 'Input' }))
    fireEvent.mouseEnter(within(screen.getByRole('menu')).getByText('Layout'))
    const panel = screen.getByText('Wizard step').closest('.-top-1')
    expect(panel).toHaveStyle({ transform: 'translateY(-148px)' })
    rect.mockRestore()
  })

  it('adds a wizard step outside a wizard as a wizard of its own, in a group', () => {
    const e = editor({ openOnAdd: false, onOpenOnAddChange: vi.fn() })
    renderForm(e)
    fireEvent.click(screen.getByRole('button', { name: 'Input' }))
    const menu = screen.getByRole('menu')
    fireEvent.click(within(menu).getByText('Layout'))
    fireEvent.click(within(menu).getByText('Wizard step'))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'addInput',
      parent: [],
      index: 3,
      name: 'input_1',
      definition: {
        type: 'group',
        label: 'Steps',
        flatten: true,
        items: {
          $meta: { wizard: { mode: 'wizard', navigation: { allowJump: true } } },
          step_1: { type: 'step', title: 'Step 1', options: {} },
        },
      },
    })
  })

  it('splits the form into pages, its inputs starting the first one', () => {
    const e = editor()
    renderForm(e)
    fireEvent.click(barButton('Split into pages'))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        {
          type: 'updateWorkflow',
          inputsMeta: {
            unset: ['layout'],
            set: {
              wizard: { mode: 'wizard', navigation: { allowJump: true }, submitLabel: 'Submit' },
            },
          },
        },
        {
          type: 'addInput',
          parent: [],
          index: 0,
          name: 'step_1',
          definition: { type: 'step', title: 'Step 1', options: {} },
        },
        {
          type: 'moveInputs',
          paths: [['name'], ['secret'], ['settings']],
          parent: ['step_1'],
          index: 0,
        },
      ],
    })
  })

  it('splits a group’s fields into pages from its row, writing them whole', () => {
    const e = editor()
    renderForm(e)
    fireEvent.click(within(row(['settings'])).getByRole('button', { name: 'Split into pages' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'updateInput',
      path: ['settings'],
      set: {
        items: {
          $meta: { wizard: { mode: 'wizard', navigation: { allowJump: true } } },
          step_1: {
            type: 'step',
            title: 'Step 1',
            options: { size: { type: 'number', label: 'Size' } },
          },
        },
      },
    })
  })

  // A form split into two pages.
  const PAGED = {
    $meta: { wizard: { mode: 'wizard' } },
    step_1: { type: 'step', title: 'One', options: { a: { type: 'string', label: 'A' } } },
    step_2: { type: 'step', title: 'Two', options: { b: { type: 'string', label: 'B' } } },
  }

  it('adds a page after a wizard’s last from the bar', () => {
    const e = editor()
    renderForm(e, PAGED)
    expect(screen.queryByRole('button', { name: 'Split into pages' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Page' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'addInput',
      parent: [],
      name: 'step_3',
      definition: { type: 'step', title: 'Step 3', options: {} },
    })
  })

  it('never drops an input between a wizard’s pages, where the wizard wouldn’t draw it', () => {
    const e = editor()
    renderForm(e, PAGED)
    row(['step_1']).getBoundingClientRect = () => new DOMRect(0, 0, 600, 120)
    row(['step_1', 'a']).getBoundingClientRect = () => new DOMRect(10, 40, 580, 40)
    const grip = row(['step_1', 'a']).querySelector('[data-drag-handle]') as HTMLElement
    fireEvent.pointerDown(grip, { button: 0, clientX: 300, clientY: 45 })
    act(() => {
      fireEvent.pointerMove(window, { clientX: 300, clientY: 140 })
    })
    act(() => {
      fireEvent.pointerUp(window, { clientX: 300, clientY: 140 })
    })
    expect(e.onEdit).not.toHaveBeenCalled()
  })

  it('shows the page “+ Page” adds, after a repeated page’s copies', async () => {
    const REPEATED = {
      $meta: { wizard: { mode: 'wizard' } },
      hosts: {
        type: 'step',
        title: 'Host',
        multi: true,
        min: 2,
        options: { cpus: { type: 'number' } },
      },
      done: { type: 'step', title: 'Done', options: { note: { type: 'string' } } },
    }
    const e = editor()
    const { rerender } = renderForm(e, REPEATED)
    expect(await screen.findByText('/ 3')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Page' }))
    const added = resultOf(e, REPEATED).inputs
    rerender(
      <InputsFormEditor editor={e} inputs={added}>
        <DynamicForm formJSONs={convertToDynamicForm(added)} initialValues={{}} workflowForm />
      </InputsFormEditor>,
    )
    expect(await screen.findByText('/ 4')).toBeInTheDocument()
    expect(screen.getByLabelText('Page shown')).toHaveValue(4)
    expect(within(row(['step_3'])).getByText('Wizard step')).toBeInTheDocument()
  })

  it('unsplits a wizard: each page’s inputs back where it was, in order, and no wizard', () => {
    const e = editor()
    renderForm(e, PAGED)
    fireEvent.click(barButton('Unsplit pages'))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        { type: 'moveInputs', paths: [['step_1', 'a']], parent: [], index: 0 },
        { type: 'deleteInput', path: ['step_1'] },
        { type: 'moveInputs', paths: [['step_2', 'b']], parent: [], index: 1 },
        { type: 'deleteInput', path: ['step_2'] },
        { type: 'updateWorkflow', inputsMeta: { unset: ['wizard'] } },
      ],
    })
  })

  it('adds a new input from the bar to a wizard’s last page', () => {
    const e = editor({ openOnAdd: false, onOpenOnAddChange: vi.fn() })
    renderForm(e, PAGED)
    fireEvent.click(screen.getByText('Input'))
    pickType('Number')
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'addInput',
      parent: ['step_2'],
      index: 1,
      name: 'input_1',
      definition: { type: 'number' },
    })
  })

  it('adds another page for a wizard step picked inside a page', () => {
    const e = editor({ openOnAdd: false, onOpenOnAddChange: vi.fn() })
    renderForm(e, PAGED)
    fireEvent.click(within(row(['step_1', 'a'])).getByRole('button', { name: 'Add input below' }))
    const menu = screen.getByRole('menu')
    fireEvent.click(within(menu).getByText('Layout'))
    fireEvent.click(within(menu).getByText('Wizard step'))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'addInput',
      parent: [],
      name: 'step_3',
      definition: { type: 'step', title: 'Step 3', options: {} },
    })
  })

  it('unsplits a group’s wizard from its row, writing its fields whole without the wizard', () => {
    const e = editor()
    renderForm(e, {
      steps: {
        type: 'group',
        label: 'Steps',
        flatten: true,
        items: {
          $meta: { wizard: { mode: 'wizard' } },
          step_1: { type: 'step', title: 'One', options: { a: { type: 'string', label: 'A' } } },
        },
      },
    })
    fireEvent.click(within(row(['steps'])).getByRole('button', { name: 'Unsplit pages' }))
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        { type: 'moveInputs', paths: [['steps', 'step_1', 'a']], parent: ['steps'], index: 0 },
        { type: 'deleteInput', path: ['steps', 'step_1'] },
        {
          type: 'updateInput',
          path: ['steps'],
          set: { items: { a: { type: 'string', label: 'A' } } },
        },
      ],
    })
  })

  it('adds an input straight away when new ones skip their dialog', () => {
    const e = editor({ openOnAdd: false, onOpenOnAddChange: vi.fn() })
    renderForm(e)
    fireEvent.click(screen.getByRole('button', { name: 'Input' }))
    pickType('Number')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'addInput',
      parent: [],
      index: 3,
      name: 'input_1',
      definition: { type: 'number' },
    })
  })

  it('shows an empty state with an add button for a form without inputs', () => {
    renderForm(editor(), {} as typeof INPUTS)
    expect(screen.getByText(INPUTS_EDITOR_STRINGS.noInputs)).toBeInTheDocument()
    expect(screen.getByText('Add input')).toBeInTheDocument()
  })
})

describe('problems in the inputs', () => {
  it('marks an input with its problems, and shows the first one’s line on a click', () => {
    const onReveal = vi.fn()
    renderForm(
      editor({
        onReveal,
        problems: [
          {
            message: 'Size is not a number',
            line: 12,
            input: ['settings', 'size'],
          },
          { message: 'a job problem', line: 20, job: 'build' },
        ],
      }),
    )
    const flagged = row(['settings', 'size'])
    const badge = within(flagged).getByRole('button', { name: '1 problem' })
    expect(badge.dataset['tooltipContent']).toBe('Size is not a number')
    expect(within(row(['name'])).queryByRole('button', { name: '1 problem' })).toBeNull()
    fireEvent.click(badge)
    expect(onReveal).toHaveBeenCalledWith({ line: 12 })
  })
})

describe('selecting inputs', () => {
  // jsdom lays nothing out, so each row gets a rect by hand.
  function layOut() {
    const rects: [string[], [number, number, number, number]][] = [
      [['name'], [0, 0, 300, 40]],
      [['secret'], [0, 50, 300, 16]],
      [['settings'], [0, 80, 300, 120]],
      [
        ['settings', 'size'],
        [10, 110, 280, 40],
      ],
    ]
    for (const [path, [x, y, w, h]] of rects) {
      row(path).getBoundingClientRect = () => new DOMRect(x, y, w, h)
    }
  }
  const selected = () =>
    [...document.querySelectorAll('[data-input-path][data-selected]')]
      .map((el) => el.getAttribute('data-input-path'))
      .sort()
  const form = () => row(['name']).closest('[tabindex="0"]') as HTMLElement

  // Each release is followed by the click a browser sends after it.
  function shiftClick(path: string[], at: [number, number]) {
    fireEvent.pointerDown(row(path), {
      button: 0,
      shiftKey: true,
      clientX: at[0],
      clientY: at[1],
    })
    act(() => {
      fireEvent.pointerUp(window, { clientX: at[0], clientY: at[1] })
    })
    fireEvent.click(row(path), { shiftKey: true })
  }
  function box(from: [number, number], to: [number, number]) {
    fireEvent.pointerDown(form(), {
      button: 0,
      shiftKey: true,
      clientX: from[0],
      clientY: from[1],
    })
    act(() => {
      fireEvent.pointerMove(window, { clientX: to[0], clientY: to[1] })
    })
    act(() => {
      fireEvent.pointerUp(window, { clientX: to[0], clientY: to[1] })
    })
    fireEvent.click(form(), { shiftKey: true })
  }
  function drag(handle: HTMLElement, from: [number, number], to: [number, number]) {
    fireEvent.pointerDown(handle, { button: 0, clientX: from[0], clientY: from[1] })
    act(() => {
      fireEvent.pointerMove(window, { clientX: to[0], clientY: to[1] })
    })
    act(() => {
      fireEvent.pointerUp(window, { clientX: to[0], clientY: to[1] })
    })
    fireEvent.click(handle)
  }

  it('toggles an input with shift-click, and clears on Escape or a click between fields', () => {
    renderForm(editor())
    layOut()
    shiftClick(['name'], [5, 5])
    shiftClick(['settings', 'size'], [20, 120])
    expect(selected()).toEqual(['["name"]', '["settings","size"]'])
    shiftClick(['name'], [5, 5])
    expect(selected()).toEqual(['["settings","size"]'])
    fireEvent.keyDown(form(), { key: 'Escape' })
    expect(selected()).toEqual([])
    shiftClick(['name'], [5, 5])
    fireEvent.pointerDown(form(), { button: 0, clientX: 5, clientY: 45 })
    act(() => {
      fireEvent.pointerUp(window, { clientX: 5, clientY: 45 })
    })
    expect(selected()).toEqual([])
  })

  it('selects with a box: whole inputs across the form, or the fields of the group holding it', () => {
    renderForm(editor())
    layOut()
    box([-10, -10], [310, 90])
    expect(selected()).toEqual(['["name"]', '["secret"]', '["settings"]'])
    fireEvent.keyDown(form(), { key: 'Escape' })
    box([5, 105], [295, 160])
    expect(selected()).toEqual(['["settings","size"]'])
  })

  it('moves the selected inputs together from any one of their handles', () => {
    const e = editor()
    const { rerender } = renderForm(e)
    layOut()
    shiftClick(['secret'], [5, 55])
    shiftClick(['name'], [5, 5])
    const handle = row(['name']).querySelector('[data-drag-handle]') as HTMLElement
    drag(handle, [5, 5], [5, 112])
    expect(editsOf(e)).toContainEqual({
      type: 'moveInputs',
      paths: [['name'], ['secret']],
      parent: ['settings'],
      index: 0,
    })
    // They stay selected once the page has made the move.
    const moved = {
      settings: {
        ...INPUTS.settings,
        items: {
          name: INPUTS.name,
          secret: INPUTS.secret,
          ...INPUTS.settings.items,
        },
      },
    }
    rerender(
      <InputsFormEditor editor={e} inputs={moved}>
        <DynamicForm formJSONs={convertToDynamicForm(moved)} initialValues={{}} workflowForm />
      </InputsFormEditor>,
    )
    expect(selected()).toEqual(['["settings","name"]', '["settings","secret"]'])
  })

  it('deletes the selected inputs as one edit, leaving a field being typed in alone', () => {
    const e = editor()
    renderForm(e)
    layOut()
    shiftClick(['name'], [5, 5])
    shiftClick(['settings'], [5, 85])
    fireEvent.keyDown(screen.getAllByRole('textbox')[0] as HTMLElement, {
      key: 'Backspace',
    })
    expect(e.onEdit).not.toHaveBeenCalled()
    fireEvent.keyDown(form(), { key: 'Delete' })
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'batch',
      edits: [
        { type: 'deleteInput', path: ['name'] },
        { type: 'deleteInput', path: ['settings'] },
      ],
    })
    expect(selected()).toEqual([])
  })

  // A field's own label, or a group's title.
  const titleOf = (path: string[]) => {
    const title = row(path).querySelector('[data-field-label]')
    if (!(title instanceof HTMLElement)) {
      throw new Error(`no label for ${path.join('.')}`)
    }
    return title
  }
  // Whether the click after the press went on, which on a label hands it to the label's field.
  const clickLabel = (path: string[]) => {
    const label = titleOf(path)
    fireEvent.pointerDown(label, { button: 0, clientX: 5, clientY: 5 })
    act(() => {
      fireEvent.pointerUp(window, { clientX: 5, clientY: 5 })
    })
    return fireEvent.click(label)
  }

  it('highlights an input when its label is clicked, leaving its field alone', () => {
    renderForm(editor())
    const field = row(['settings', 'size']).querySelector('input') as HTMLInputElement
    expect(clickLabel(['settings', 'size'])).toBe(false)
    expect(selected()).toEqual([JSON.stringify(['settings', 'size'])])
    expect(field).not.toHaveFocus()
    expect(form()).toHaveFocus()
  })

  it('moves an input dragged by its label', () => {
    const e = editor()
    renderForm(e)
    layOut()
    drag(titleOf(['name']), [5, 5], [5, 112])
    expect(editsOf(e)).toContainEqual({
      type: 'moveInputs',
      paths: [['name']],
      parent: ['settings'],
      index: 0,
    })
  })

  it('drags every selected input from one of their labels, and a click on one keeps them all', () => {
    const e = editor()
    renderForm(e)
    layOut()
    shiftClick(['secret'], [5, 55])
    shiftClick(['name'], [5, 5])
    clickLabel(['name'])
    expect(selected()).toEqual(['["name"]', '["secret"]'])
    drag(titleOf(['name']), [5, 5], [5, 112])
    expect(editsOf(e)).toContainEqual({
      type: 'moveInputs',
      paths: [['name'], ['secret']],
      parent: ['settings'],
      index: 0,
    })
  })

  it('folds a group from its title on a click, and moves it from its title in a drag', () => {
    const e = editor()
    renderForm(e)
    layOut()
    const title = titleOf(['settings'])
    const open = title.getAttribute('aria-expanded')
    expect(clickLabel(['settings'])).toBe(true)
    expect(title).toHaveAttribute('aria-expanded', open === 'true' ? 'false' : 'true')
    drag(titleOf(['settings']), [5, 85], [5, 45])
    expect(editsOf(e)).toContainEqual({
      type: 'moveInputs',
      paths: [['settings']],
      parent: [],
      index: 1,
    })
    expect(titleOf(['settings'])).toHaveAttribute(
      'aria-expanded',
      open === 'true' ? 'false' : 'true',
    )
  })

  it('moves the highlighted input down with alt and the arrow keys', () => {
    const e = editor()
    renderForm(e)
    clickLabel(['name'])
    fireEvent.keyDown(form(), { key: 'ArrowDown', altKey: true })
    expect(editsOf(e)).toContainEqual({
      type: 'moveInputs',
      paths: [['name']],
      parent: [],
      index: 2,
    })
  })

  it('leaves the first input where it is on arrow up', () => {
    const e = editor()
    renderForm(e)
    clickLabel(['name'])
    fireEvent.keyDown(form(), { key: 'ArrowUp', altKey: true })
    expect(e.onEdit).not.toHaveBeenCalled()
  })

  it('moves between inputs with the arrow keys, and adds each one passed with shift', () => {
    renderForm(editor())
    layOut()
    clickLabel(['name'])
    fireEvent.keyDown(form(), { key: 'ArrowDown' })
    expect(selected()).toEqual(['["secret"]'])
    fireEvent.keyDown(form(), { key: 'ArrowDown', shiftKey: true })
    fireEvent.keyDown(form(), { key: 'ArrowDown', shiftKey: true })
    expect(selected()).toEqual(['["secret"]', '["settings","size"]', '["settings"]'])
    fireEvent.keyDown(form(), { key: 'ArrowUp' })
    expect(selected()).toEqual(['["settings"]'])
  })

  it('picks an input up from anywhere on it but its field, and lets go on a press elsewhere', () => {
    const e = editor()
    renderForm(e)
    layOut()
    // The strip the toolbar opens in, left of the toolbar.
    const strip = row(['name']).querySelector('[data-input-chrome]')?.parentElement as HTMLElement
    fireEvent.pointerDown(strip, { button: 0, clientX: 5, clientY: 5 })
    act(() => {
      fireEvent.pointerUp(window, { clientX: 5, clientY: 5 })
    })
    expect(selected()).toEqual(['["name"]'])
    drag(strip, [5, 5], [5, 112])
    expect(editsOf(e)).toContainEqual({
      type: 'moveInputs',
      paths: [['name']],
      parent: ['settings'],
      index: 0,
    })
    clickLabel(['name'])
    fireEvent.pointerDown(row(['settings', 'size']).querySelector('input') as HTMLElement, {
      button: 0,
    })
    expect(selected()).toEqual([])
    clickLabel(['name'])
    fireEvent.pointerDown(document.body, { button: 0 })
    expect(selected()).toEqual([])
  })
})

describe('keys in a focused field', () => {
  it('leaves keys pressed in a focused switch to the switch, not the selection', () => {
    const e = editor()
    renderForm(e, {
      flag: { type: 'boolean', label: 'Flag' },
      other: { type: 'string', label: 'Other' },
    } as unknown as typeof INPUTS)
    const label = row(['flag']).querySelector('[data-field-label]') as HTMLElement
    fireEvent.pointerDown(label, { button: 0, clientX: 5, clientY: 5 })
    act(() => {
      fireEvent.pointerUp(window, { clientX: 5, clientY: 5 })
    })
    fireEvent.click(label)
    expect(row(['flag'])).toHaveAttribute('data-selected')
    fireEvent.keyDown(within(row(['flag'])).getByRole('switch'), { key: 'Delete' })
    expect(e.onEdit).not.toHaveBeenCalled()
    expect(row(['flag'])).toHaveAttribute('data-selected')
  })
})

describe('inputs side by side', () => {
  const ROWS = {
    a: { type: 'string', label: 'A' },
    b: { type: 'string', label: 'B' },
    c: { type: 'string', label: 'C' },
  }
  const HALVES = {
    a: { type: 'string', label: 'A', width: '50%' },
    b: { type: 'string', label: 'B', width: '50%' },
    c: { type: 'string', label: 'C' },
  }
  const render = (e: DependencyGraphEditor, inputs: Record<string, unknown>) =>
    renderForm(e, inputs as typeof INPUTS)
  // jsdom lays nothing out, so each row, and each cell the form puts it in, gets a rect by hand.
  function layOut(rects: Record<string, [number, number, number, number]>) {
    for (const [name, [x, y, w, h]] of Object.entries(rects)) {
      const el = row([name])
      el.getBoundingClientRect = () => new DOMRect(x, y, w, h)
      const cell = el.closest<HTMLElement>('[data-input-cell]')
      if (cell) {
        cell.getBoundingClientRect = () => new DOMRect(x - 8, y, w + 16, h)
        const flow = cell.parentElement as HTMLElement
        flow.getBoundingClientRect = () => new DOMRect(-8, 0, 616, 200)
      }
    }
  }
  function drag(handle: HTMLElement, from: [number, number], to: [number, number]) {
    fireEvent.pointerDown(handle, { button: 0, clientX: from[0], clientY: from[1] })
    act(() => {
      fireEvent.pointerMove(window, { clientX: to[0], clientY: to[1] })
    })
    act(() => {
      fireEvent.pointerUp(window, { clientX: to[0], clientY: to[1] })
    })
    fireEvent.click(handle)
  }
  const handleOf = (name: string) => row([name]).querySelector('[data-drag-handle]') as HTMLElement
  const form = () => row(['a']).closest('[tabindex="0"]') as HTMLElement

  it('puts an input dragged sideways onto another’s edge beside it, sharing the line evenly', () => {
    const e = editor()
    render(e, ROWS)
    layOut({ a: [0, 0, 600, 40], b: [0, 50, 600, 40], c: [0, 100, 600, 40] })
    drag(handleOf('c'), [480, 105], [590, 20])
    const result = resultOf(e, ROWS)
    expect(fieldsOf(result.layout)).toEqual(['a', 'c', 'b'])
    expect((asRecord(result.layout)['children'] as unknown[])[0]).toMatchObject({
      type: 'grid',
      columns: { base: 1, sm: 2 },
    })
  })

  it('drops above or below an input from the top or bottom half of its middle', () => {
    const e = editor()
    render(e, ROWS)
    layOut({ a: [0, 0, 600, 40], b: [0, 50, 600, 40], c: [0, 100, 600, 40] })
    drag(handleOf('c'), [480, 105], [300, 10])
    expect(fieldsOf(resultOf(e, ROWS).layout)).toEqual(['c', 'a', 'b'])
    drag(handleOf('a'), [480, 5], [300, 70])
    expect(fieldsOf(resultOf(e, ROWS).layout)).toEqual(['b', 'a', 'c'])
  })

  it('migrates a legacy field width to a responsive layout when it moves', () => {
    const e = editor()
    const legacy = { a: { type: 'string', label: 'A', width: '50%' }, b: ROWS.b, c: ROWS.c }
    render(e, legacy)
    layOut({ a: [0, 0, 292, 40], b: [0, 50, 600, 40], c: [0, 100, 600, 40] })
    drag(handleOf('a'), [200, 5], [300, 130])
    const result = resultOf(e, legacy)
    expect(fieldsOf(result.layout)).toEqual(['b', 'c', 'a'])
    expect(result.inputs['a']).toEqual({ type: 'string', label: 'A' })
  })

  it('gives an input dragged out of a shared line, and the one left there, the full width', () => {
    const e = editor()
    render(e, HALVES)
    layOut({ a: [0, 0, 292, 40], b: [308, 0, 292, 40], c: [0, 50, 600, 40] })
    drag(handleOf('b'), [400, 5], [400, 95])
    const result = resultOf(e, HALVES)
    expect(fieldsOf(result.layout)).toEqual(['a', 'c', 'b'])
    expect((asRecord(result.layout)['children'] as unknown[])[0]).toMatchObject({
      type: 'grid',
      columns: { sm: [50] },
    })
    expect([result.inputs['a'], result.inputs['b']]).toEqual([
      { type: 'string', label: 'A' },
      { type: 'string', label: 'B' },
    ])
  })

  it('gives a new input dropped beside another an even share of its line', () => {
    const e = editor()
    render(e, ROWS)
    layOut({ a: [0, 0, 600, 40], b: [0, 50, 600, 40], c: [0, 100, 600, 40] })
    drag(screen.getByText('Input').closest('button') as HTMLElement, [540, 300], [590, 20])
    pickType('Number')
    expect(screen.queryByLabelText('Width')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const result = resultOf(e, ROWS)
    expect(fieldsOf(result.layout)).toEqual(['a', 'input_1', 'b', 'c'])
    expect(result.inputs['input_1']).toEqual({ type: 'number' })
    expect((asRecord(result.layout)['children'] as unknown[])[0]).toMatchObject({
      type: 'grid',
      columns: { sm: 2 },
    })
  })

  it('resizes two inputs sharing a line from the edge between them, in 5% steps', () => {
    const e = editor()
    render(e, HALVES)
    layOut({ a: [0, 0, 292, 40], b: [308, 0, 292, 40], c: [0, 50, 600, 40] })
    expect(screen.queryByRole('separator')).toBeNull()
    fireEvent.pointerMove(form(), { clientX: 300, clientY: 20 })
    const edge = screen.getByRole('separator', { name: INPUTS_EDITOR_STRINGS.resizeInputs })
    expect(edge).toHaveAttribute('aria-valuenow', '50')
    drag(edge, [300, 20], [176, 20])
    expect((asRecord(resultOf(e, HALVES).layout)['children'] as unknown[])[0]).toMatchObject({
      type: 'grid',
      columns: { base: 1, sm: [30, 70] },
    })
  })

  // A hidden input sits between two halves: the run form keeps them on one line, so the editor does.
  const SPLIT = {
    a: HALVES.a,
    h: { type: 'string', label: 'H', hidden: true },
    b: HALVES.b,
    c: HALVES.c,
  }
  const SPLIT_LAYOUT: Record<string, [number, number, number, number]> = {
    a: [0, 0, 292, 40],
    b: [308, 0, 292, 40],
    c: [0, 50, 600, 40],
    h: [0, 100, 600, 16],
  }

  it('lists a hidden input after the ones the form shows, never between two sharing a line', () => {
    render(editor(), SPLIT)
    layOut(SPLIT_LAYOUT)
    expect(row(['h'])).toHaveAttribute('data-input-hidden')
    fireEvent.pointerMove(form(), { clientX: 300, clientY: 20 })
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '50')
  })

  it('lands a shown input dropped on a hidden one after the shown inputs', () => {
    const e = editor()
    render(e, SPLIT)
    layOut(SPLIT_LAYOUT)
    drag(handleOf('a'), [200, 5], [300, 108])
    const result = resultOf(e, SPLIT)
    expect(fieldsOf(result.layout)).toContain('h')
    expect(fieldsOf(result.layout).at(-1)).toBe('a')
  })

  it('never puts a hidden input beside another', () => {
    const e = editor()
    render(e, SPLIT)
    layOut(SPLIT_LAYOUT)
    drag(handleOf('h'), [300, 105], [280, 30])
    expect(resultOf(e, SPLIT).layout).toMatchObject({
      children: [
        { type: 'grid', children: [{ field: 'a' }, { field: 'b' }] },
        { field: 'h' },
        { field: 'c' },
      ],
    })
  })

  // a | b | c on one line, a third each.
  const THIRDS = {
    a: { type: 'string', label: 'A', width: '33%' },
    b: { type: 'string', label: 'B', width: '33%' },
    c: { type: 'string', label: 'C', width: '33%' },
  }
  const THIRDS_LAYOUT: Record<string, [number, number, number, number]> = {
    a: [0, 0, 184, 40],
    b: [208, 0, 184, 40],
    c: [416, 0, 184, 40],
  }

  it('stacks an input dropped on the lower half of one sharing a row under it, in its column', () => {
    const e = editor()
    render(e, THIRDS)
    layOut(THIRDS_LAYOUT)
    drag(handleOf('c'), [500, 5], [300, 30])
    expect(resultOf(e, THIRDS).layout).toMatchObject({
      children: [
        {
          type: 'grid',
          columns: { sm: [33, 33] },
          children: [{ field: 'a' }, { type: 'stack', children: [{ field: 'b' }, { field: 'c' }] }],
        },
      ],
    })
  })

  it('moves the next input up to head a column when its head leaves', () => {
    const e = editor()
    render(e, { ...HALVES, c: { type: 'string', label: 'C', 'anchor-below': true } })
    layOut({ a: [0, 0, 292, 40], b: [308, 0, 292, 40], c: [308, 50, 292, 40] })
    expect(row(['c']).parentElement).toBe(row(['b']).parentElement)
    drag(handleOf('b'), [400, 5], [300, 140])
    const result = resultOf(e, {
      ...HALVES,
      c: { type: 'string', label: 'C', 'anchor-below': true },
    })
    expect(fieldsOf(result.layout)).toEqual(['a', 'c', 'b'])
    expect(result.layout).toMatchObject({
      children: [
        { type: 'grid', children: [{ field: 'a' }, { type: 'stack', children: [{ field: 'c' }] }] },
        { field: 'b' },
      ],
    })
  })

  it('puts a new input dropped on the lower half of one in a column under it', () => {
    const e = editor()
    render(e, HALVES)
    layOut({ a: [0, 0, 292, 40], b: [308, 0, 292, 40], c: [0, 50, 600, 40] })
    drag(screen.getByText('Input').closest('button') as HTMLElement, [540, 300], [450, 30])
    pickType('Number')
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    const result = resultOf(e, HALVES)
    expect(result.inputs['input_1']).toEqual({ type: 'number' })
    expect(result.layout).toMatchObject({
      children: [
        {
          type: 'grid',
          children: [
            { field: 'a' },
            { type: 'stack', children: [{ field: 'b' }, { field: 'input_1' }] },
          ],
        },
        { field: 'c' },
      ],
    })
  })

  it('opens the toolbar of every column’s head on a line of several', () => {
    render(editor(), { ...HALVES, c: { type: 'string', label: 'C', 'anchor-below': true } })
    layOut({ a: [0, 0, 292, 40], b: [308, 0, 292, 40], c: [308, 50, 292, 40] })
    fireEvent.pointerOver(row(['c']))
    const open = (name: string) =>
      row([name]).querySelector('[data-input-chrome]')?.parentElement?.classList.contains('h-7')
    expect([open('a'), open('b'), open('c')]).toEqual([true, true, true])
    fireEvent.pointerOver(row(['b']))
    expect([open('a'), open('b'), open('c')]).toEqual([true, true, false])
  })

  it('moves the edge between two inputs with the arrow keys, their shares never over 100%', () => {
    const e = editor()
    render(e, HALVES)
    // Each cell is 50.6% of the line: rounded, the two would come to 102%.
    layOut({ a: [0, 0, 296, 40], b: [304, 0, 296, 40], c: [0, 50, 600, 40] })
    fireEvent.pointerMove(form(), { clientX: 300, clientY: 20 })
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '50')
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowLeft' })
    expect((asRecord(resultOf(e, HALVES).layout)['children'] as unknown[])[0]).toMatchObject({
      columns: { base: 1, sm: [45, 55] },
    })
  })
})

describe('list templates', () => {
  const HOSTS = {
    hosts: {
      type: 'list',
      label: 'Hosts',
      template: {
        name: { type: 'string', label: 'Name' },
        port: { type: 'number', label: 'Port' },
        creds: {
          type: 'group',
          label: 'Credentials',
          items: { user: { type: 'string', label: 'User' } },
        },
      },
    },
  }
  function renderList(e: DependencyGraphEditor, values: Record<string, unknown> = {}) {
    return render(
      <InputsFormEditor editor={e} inputs={HOSTS}>
        <DynamicForm
          formJSONs={convertToDynamicForm(HOSTS)}
          initialValues={values}
          workflowForm
          fields={{ list: ListStandIn }}
        />
      </InputsFormEditor>,
    )
  }
  const rowsOf = (path: string[]) =>
    document.querySelectorAll(`[data-input-path='${JSON.stringify(path)}']`)

  it('draws a wizard in each row of a list, though the rows hold different copies', async () => {
    const WIZARDS = {
      hosts: {
        type: 'list',
        label: 'Hosts',
        template: {
          $meta: { wizard: { mode: 'wizard' } },
          sites: {
            type: 'step',
            title: 'Site',
            multi: true,
            options: { zone: { type: 'string', label: 'Zone' } },
          },
          done: {
            type: 'step',
            title: 'Done',
            options: { note: { type: 'string', label: 'Note' } },
          },
        },
      },
    }
    render(
      <InputsFormEditor editor={editor()} inputs={WIZARDS}>
        <DynamicForm
          formJSONs={convertToDynamicForm(WIZARDS)}
          initialValues={{ hosts: [{ sites: [{}, {}] }, {}] }}
          workflowForm
          fields={{ list: ListStandIn }}
        />
      </InputsFormEditor>,
    )
    // Each row's wizard reports how many pages it draws; differing counts must settle.
    await waitFor(() => expect(screen.getAllByRole('heading', { name: /^Site/ })).toHaveLength(2))
  })

  it('starts a list with no row, as the run form does', () => {
    renderList(editor())
    expect(rowsOf(['hosts'])).toHaveLength(1)
    expect(rowsOf(['hosts', 'name'])).toHaveLength(0)
  })

  it('edits a list’s template in place through a row, a group in it too', async () => {
    renderList(editor(), { hosts: [{}] })
    await waitFor(() => expect(rowsOf(['hosts', 'name'])).toHaveLength(1))
    expect(rowsOf(['hosts', 'creds', 'user'])).toHaveLength(1)
    expect(within(row(['hosts', 'port'])).getByText('Number')).toBeInTheDocument()
  })

  it('edits the template through every row, opening only the hovered row’s toolbar', () => {
    renderList(editor(), { hosts: [{ name: 'a' }, { name: 'b' }] })
    const [first, second] = [...rowsOf(['hosts', 'name'])] as HTMLElement[]
    expect(first).toContainElement(screen.getByDisplayValue('a'))
    expect(second).toContainElement(screen.getByDisplayValue('b'))
    expect(within(second as HTMLElement).getByText('Text')).toBeInTheDocument()
    ;(second as HTMLElement).getBoundingClientRect = () => new DOMRect(0, 100, 600, 40)
    fireEvent.pointerOver(second as HTMLElement)
    const open = (el: HTMLElement | undefined) =>
      el?.querySelector('[data-input-chrome]')?.parentElement?.classList.contains('h-7')
    expect([open(first), open(second)]).toEqual([false, true])
  })

  // Gives each copy of a template input, by row, a rect; its cell spans 8px more each side.
  function layOutCopies(rects: Record<string, [number, number, number, number][]>) {
    for (const [name, copies] of Object.entries(rects)) {
      copies.forEach(([x, y, w, h], index) => {
        const el = rowsOf(['hosts', ...name.split('.')])[index] as HTMLElement
        el.getBoundingClientRect = () => new DOMRect(x, y, w, h)
        const cell = inputCell(el)
        if (cell) {
          cell.getBoundingClientRect = () => new DOMRect(x - 8, y, w + 16, h)
          const flow = cell.parentElement as HTMLElement
          flow.getBoundingClientRect = () => new DOMRect(-8, y, 616, h)
        }
      })
    }
  }
  const container = () => row(['hosts']).closest('[tabindex="0"]') as HTMLElement
  const selectedPaths = () => [
    ...new Set(
      [...document.querySelectorAll('[data-input-path][data-selected]')].map((el) =>
        el.getAttribute('data-input-path'),
      ),
    ),
  ]

  it('steps with the arrow keys from the row an input was picked in, not the first row', () => {
    renderList(editor(), { hosts: [{ name: 'a' }, { name: 'b' }] })
    row(['hosts']).getBoundingClientRect = () => new DOMRect(0, 0, 600, 400)
    layOutCopies({
      name: [
        [0, 50, 600, 40],
        [0, 220, 600, 40],
      ],
      port: [
        [0, 100, 600, 40],
        [0, 270, 600, 40],
      ],
      creds: [
        [0, 150, 600, 60],
        [0, 320, 600, 60],
      ],
      'creds.user': [
        [10, 160, 580, 40],
        [10, 330, 580, 40],
      ],
    })
    const label = rowsOf(['hosts', 'port'])[1]?.querySelector('[data-field-label]') as HTMLElement
    fireEvent.pointerDown(label, { button: 0, clientX: 5, clientY: 275 })
    act(() => {
      fireEvent.pointerUp(window, { clientX: 5, clientY: 275 })
    })
    fireEvent.click(label)
    fireEvent.keyDown(container(), { key: 'ArrowUp' })
    expect(selectedPaths()).toEqual(['["hosts","name"]'])
    // From the second row's Name, the input above is the first row's last, not the list.
    fireEvent.keyDown(container(), { key: 'ArrowUp' })
    expect(selectedPaths()).toEqual(['["hosts","creds","user"]'])
  })

  it('resizes side-by-side template inputs from the row whose edge is grabbed', () => {
    const PAIRED = {
      hosts: {
        type: 'list',
        label: 'Hosts',
        template: {
          $meta: {
            layout: {
              type: 'grid',
              columns: { base: 1, sm: 2 },
              children: [
                { type: 'field', field: 'name' },
                { type: 'field', field: 'port' },
              ],
            },
          },
          name: { type: 'string', label: 'Name' },
          port: { type: 'number', label: 'Port' },
        },
      },
    }
    const e = editor()
    render(
      <InputsFormEditor editor={e} inputs={PAIRED}>
        <DynamicForm
          formJSONs={convertToDynamicForm(PAIRED)}
          initialValues={{ hosts: [{}, {}] }}
          workflowForm
          fields={{ list: ListStandIn }}
        />
      </InputsFormEditor>,
    )
    // The first row splits its line evenly; the second, 31% to 68%.
    layOutCopies({
      name: [
        [0, 50, 292, 40],
        [0, 150, 176, 40],
      ],
      port: [
        [308, 50, 292, 40],
        [192, 150, 408, 40],
      ],
    })
    fireEvent.pointerMove(container(), { clientX: 184, clientY: 170 })
    const edge = screen.getByRole('separator')
    expect(edge).toHaveAttribute('aria-valuenow', '31')
    fireEvent.keyDown(edge, { key: 'ArrowLeft' })
    const edit = vi.mocked(e.onEdit).mock.lastCall?.[0]
    if (!edit) throw new Error('No edit was submitted')
    const result = applyGraphEdit(
      { yml: dumpYaml({ on: { execute: { inputs: PAIRED } } }), layout: undefined },
      edit,
    )
    const template = asRecord(
      asRecord(workflowInputsSchema(asRecord(loadYaml(result.yml))))['hosts'],
    )['template']
    const [left, right] = asRecord(
      asRecord(asRecord(asRecord(template)['$meta'])['layout'])['columns'],
    )['sm'] as number[]
    expect((left ?? 0) / (right ?? 1)).toBeCloseTo(25 / 74)
  })

  it('moves a template field among the template’s own', () => {
    const e = editor()
    renderList(e, { hosts: [{}] })
    const label = row(['hosts', 'port']).querySelector('[data-field-label]') as HTMLElement
    fireEvent.pointerDown(label, { button: 0, clientX: 5, clientY: 5 })
    act(() => {
      fireEvent.pointerUp(window, { clientX: 5, clientY: 5 })
    })
    fireEvent.click(label)
    fireEvent.keyDown(row(['hosts']).closest('[tabindex="0"]') as HTMLElement, {
      key: 'ArrowUp',
      altKey: true,
    })
    expect(e.onEdit).toHaveBeenCalledWith({
      type: 'moveInputs',
      paths: [['hosts', 'port']],
      parent: ['hosts'],
      index: 0,
    })
  })
})
