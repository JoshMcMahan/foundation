// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
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
      defineTheme: vi.fn(),
      setTheme: vi.fn(),
      getModel: () => null,
      getModelMarkers: () => [],
      setModelMarkers: vi.fn(),
      setModelLanguage: vi.fn(),
      onDidChangeMarkers: () => ({ dispose: () => {} }),
      createModel: makeModel,
      create: (_element: HTMLElement, options: { model: ReturnType<typeof makeModel> }) => {
        const node = document.createElement('div')
        const editor = {
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
