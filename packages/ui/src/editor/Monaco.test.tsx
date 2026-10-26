// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Field } from '../components/Field'
import MonacoEditor from './Monaco'

const fake = vi.hoisted(() => {
  type Model = {
    uri: string
    value: string
    language: string
    disposed: boolean
    contentListeners: Set<() => void>
  }
  const models: Model[] = []
  const created: { options: Record<string, unknown>; editor: Record<string, unknown> }[] = []
  return { models, created }
})

vi.mock('monaco-editor/editor/editor.api', () => {
  const makeModel = (value: string, language: string, uri: string) => {
    const state = {
      uri,
      value,
      language,
      disposed: false,
      contentListeners: new Set<() => void>(),
    }
    fake.models.push(state)
    return {
      uri,
      getValue: () => state.value,
      setValue: vi.fn((next: string) => {
        state.value = next
        for (const listener of [...state.contentListeners]) {
          listener()
        }
      }),
      isDisposed: () => state.disposed,
      dispose: () => {
        state.disposed = true
      },
      getLanguageId: () => state.language,
      onDidChangeContent: (listener: () => void) => {
        state.contentListeners.add(listener)
        return { dispose: () => state.contentListeners.delete(listener) }
      },
    }
  }
  return {
    Uri: { parse: (path: string) => path },
    editor: {
      ShowLightbulbIconMode: { Off: 'off', OnCode: 'onCode', On: 'on' },
      defineTheme: vi.fn(),
      setTheme: vi.fn(),
      getModel: () => null,
      getModelMarkers: () => [],
      setModelMarkers: vi.fn(),
      setModelLanguage: vi.fn(),
      onDidChangeMarkers: () => ({ dispose: () => {} }),
      createModel: makeModel,
      create: (element: HTMLElement, options: { model: ReturnType<typeof makeModel> }) => {
        const node = document.createElement('div')
        const input = Object.assign(document.createElement('div'), {
          className: 'native-edit-context',
          tabIndex: 0,
        })
        input.setAttribute('role', 'textbox')
        node.append(input)
        element.append(node)
        const layoutListeners = new Set<(info: { width: number }) => void>()
        const keyboardButton = { dispose: vi.fn() }
        const editor = {
          layoutListeners,
          keyboardButton,
          onDidLayoutChange: (listener: (info: { width: number }) => void) => {
            layoutListeners.add(listener)
            return { dispose: () => layoutListeners.delete(listener) }
          },
          getContribution: (id: string) =>
            id === 'editor.contrib.iPadShowKeyboard' ? keyboardButton : null,
          getDomNode: () => node,
          updateOptions: vi.fn(),
          getModel: () => options.model,
          getValue: () => options.model.getValue(),
          saveViewState: vi.fn(() => ({ cursor: 'kept' })),
          restoreViewState: vi.fn(),
          dispose: vi.fn(),
        }
        fake.created.push({ options, editor })
        return editor
      },
    },
  }
})
vi.mock('./monacoFeatures', () => ({}))
vi.mock('./workers', () => ({ setupMonacoWorkers: () => {} }))
vi.mock('./yamlLanguage', () => ({ ensureYamlLanguage: () => {} }))
vi.mock('./reveal', () => ({ registerRevealer: () => () => {} }))
vi.mock('../components/useCssIsDark', () => ({ useCssIsDark: () => false }))

const monaco = await import('monaco-editor/editor/editor.api')

afterEach(() => {
  cleanup()
  fake.created.length = 0
  fake.models.length = 0
  vi.mocked(monaco.editor.setTheme).mockClear()
})

const last = () => fake.created.at(-1)!
const type = (index: number, text: string) =>
  act(() => {
    const model = fake.models[index]!
    model.value = text
    for (const listener of [...model.contentListeners]) {
      listener()
    }
  })

test('an editor that opened disabled becomes editable once disabled turns false', () => {
  const { rerender } = render(<MonacoEditor disabled value="jobs: {}" />)
  expect(last().options['readOnly']).toBe(true)

  rerender(<MonacoEditor disabled={false} value="jobs: {}" />)
  expect(last().editor['updateOptions']).toHaveBeenLastCalledWith(
    expect.objectContaining({ readOnly: false }),
  )
})

test('readOnly from the host still locks an editor that is not disabled', () => {
  const { rerender } = render(<MonacoEditor readOnly value="jobs: {}" />)
  expect(last().options['readOnly']).toBe(true)

  rerender(<MonacoEditor readOnly disabled={false} value="jobs: {}" />)
  expect(last().editor['updateOptions']).toHaveBeenLastCalledWith(
    expect.objectContaining({ readOnly: true }),
  )
})

test('a read-only editor reads as one and offers nothing to edit, until it turns editable', () => {
  const { container, rerender } = render(<MonacoEditor readOnly value="a" />)
  const input = () =>
    (last().editor['getDomNode'] as () => HTMLElement)().querySelector('.native-edit-context')
  expect(last().options).toMatchObject({
    readOnly: true,
    domReadOnly: true,
    renderLineHighlight: 'none',
    hideCursorInOverviewRuler: true,
    scrollBeyondLastLine: false,
    lightbulb: { enabled: 'off' },
    scrollbar: { alwaysConsumeMouseWheel: false },
  })
  expect(input()?.getAttribute('aria-readonly')).toBe('true')
  expect(container.firstElementChild).toHaveProperty('dataset.readOnly', '')

  rerender(<MonacoEditor readOnly={false} value="a" />)
  expect(last().editor['updateOptions']).toHaveBeenLastCalledWith(
    expect.objectContaining({
      readOnly: false,
      domReadOnly: false,
      renderLineHighlight: 'line',
      scrollBeyondLastLine: true,
      lightbulb: { enabled: 'onCode' },
      scrollbar: { alwaysConsumeMouseWheel: true },
    }),
  )
  expect(input()?.getAttribute('aria-readonly')).toBe('false')
  expect(container.firstElementChild).not.toHaveProperty('dataset.readOnly')
})

test('a read-only editor takes the host options over its own', () => {
  render(
    <MonacoEditor
      readOnly
      value="a"
      renderLineHighlight="line"
      scrollBeyondLastLine
      scrollbar={{ alwaysConsumeMouseWheel: true }}
    />,
  )
  expect(last().options).toMatchObject({
    renderLineHighlight: 'line',
    scrollBeyondLastLine: true,
    scrollbar: { alwaysConsumeMouseWheel: true },
  })
})

test('a disabled editor greys out on its own, leaving the page-wide theme alone', () => {
  const { container, rerender } = render(<MonacoEditor disabled value="a" />)
  expect(container.firstElementChild).toHaveProperty('dataset.disabled', '')
  const node = (last().editor['getDomNode'] as () => HTMLElement)()
  expect(node.style.getPropertyValue('--vscode-editor-background')).toBe(
    'var(--theme-input-disabled-bg)',
  )
  rerender(<MonacoEditor value="a" />)
  expect(node.style.getPropertyValue('--vscode-editor-background')).toBe('')
  expect(vi.mocked(monaco.editor.setTheme).mock.calls.flat()).toEqual(
    expect.not.arrayContaining([expect.stringContaining('disabled')]),
  )
})

test('names itself from the strings unless the host names it', () => {
  render(<MonacoEditor value="a" />)
  expect(last().options['ariaLabel']).toBe('Code editor')
  render(<MonacoEditor value="a" ariaLabel="Script" />)
  expect(last().options['ariaLabel']).toBe('Script')
})

test('calls the onChange the host passes now, not the one it first passed', () => {
  const first = vi.fn()
  const second = vi.fn()
  const { rerender } = render(<MonacoEditor value="a" onChange={first} />)
  rerender(<MonacoEditor value="a" onChange={second} />)
  type(0, 'ab\r\n')
  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledWith('ab\n')
})

test('editors without a path each get a model of their own', () => {
  render(
    <>
      <MonacoEditor value="one" />
      <MonacoEditor value="two" />
    </>,
  )
  const [a, b] = fake.models
  expect(a?.uri).not.toBe(b?.uri)
  expect(a?.disposed).toBe(false)
  expect(b?.disposed).toBe(false)
})

test('keeps the cursor and scroll when the host hands it other text', () => {
  const { rerender } = render(<MonacoEditor value="a: 1" />)
  rerender(<MonacoEditor value="a: 2" />)
  const { editor } = last()
  expect(fake.models[0]?.value).toBe('a: 2')
  expect(editor['restoreViewState']).toHaveBeenCalledWith({ cursor: 'kept' })
})

test('follows a new language and new options', () => {
  const { rerender } = render(<MonacoEditor value="a" language="shell" fontSize={12} />)
  rerender(<MonacoEditor value="a" language="python" fontSize={14} />)
  expect(monaco.editor.setModelLanguage).toHaveBeenCalledWith(expect.anything(), 'python')
  expect(last().editor['updateOptions']).toHaveBeenLastCalledWith(
    expect.objectContaining({ fontSize: 14 }),
  )
})

test('disposes its model when it unmounts, but keeps a YAML one for the next editor on its path', () => {
  const { unmount } = render(
    <>
      <MonacoEditor value="echo hi" language="shell" />
      <MonacoEditor value="a: 1" language="yaml" path="file:///workflow.yaml" />
    </>,
  )
  unmount()
  expect(fake.models.map((model) => model.disposed)).toEqual([true, false])
  for (const { editor } of fake.created) {
    expect(editor['dispose']).toHaveBeenCalledTimes(1)
  }
})

test('in a Field, the label names the editor and its description and help describe it', () => {
  const { rerender } = render(
    <Field label="Script" description="Runs before the job." help="Bash, by default." required>
      <MonacoEditor value="echo hi" />
    </Field>,
  )
  const editor = screen.getByRole('textbox', { name: 'Script' })
  expect(editor).toHaveAccessibleDescription('Runs before the job. Bash, by default.')
  expect(last().options).toMatchObject({ ariaRequired: true })
  // The label points at no element by `for`; a click on it focuses the editor instead.
  const label = screen.getByText('Script').closest('label')!
  expect(label).not.toHaveAttribute('for')
  fireEvent.click(label)
  expect(editor).toHaveFocus()

  rerender(
    <Field label="Script" error="Not valid shell.">
      <MonacoEditor value="echo hi" />
    </Field>,
  )
  expect(editor).toHaveAttribute('aria-invalid', 'true')
  expect(editor).toHaveAccessibleDescription('Not valid shell.')
})

test('outside a Field, the editor keeps its own name and no field attributes', () => {
  render(<MonacoEditor value="a" />)
  const input = document.querySelector('.native-edit-context')!
  expect(input).not.toHaveAttribute('aria-labelledby')
  expect(input).not.toHaveAttribute('aria-describedby')
  expect(input).not.toHaveAttribute('id')
})

test('drops the minimap when the editor is too narrow for it, unless the host sets it', () => {
  render(<MonacoEditor value="a" />)
  const editor = last().editor as {
    layoutListeners: Set<(info: { width: number }) => void>
    updateOptions: ReturnType<typeof vi.fn>
  }
  const layOut = (width: number) =>
    act(() => {
      for (const listener of editor.layoutListeners) {
        listener({ width })
      }
    })
  layOut(360)
  expect(editor.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({ minimap: { enabled: false } }),
  )
  // Hidden, 0 wide, it keeps what it had.
  layOut(0)
  layOut(900)
  expect(editor.updateOptions).toHaveBeenLastCalledWith(
    expect.objectContaining({ minimap: { enabled: true } }),
  )

  cleanup()
  render(<MonacoEditor value="a" minimap={{ enabled: true }} />)
  const own = last().editor as typeof editor
  for (const listener of own.layoutListeners) {
    act(() => listener({ width: 360 }))
  }
  expect(own.updateOptions).not.toHaveBeenCalledWith(
    expect.objectContaining({ minimap: { enabled: false } }),
  )
})

test('leaves out the touch keyboard button, which would cover the text', () => {
  render(<MonacoEditor value="a" />)
  expect(
    (last().editor['keyboardButton'] as { dispose: ReturnType<typeof vi.fn> }).dispose,
  ).toHaveBeenCalled()
})
