// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import MonacoEditor from './Monaco'

// A Monaco that keeps markers by owner and calls its listeners, as the editor's marker loop needs.
const fake = vi.hoisted(() => {
  const markers = new Map<string, { message: string; startLineNumber: number }[]>()
  const markerListeners = new Set<(resources: string[]) => void>()
  const contentListeners = new Set<() => void>()
  const disposed: string[] = []
  const listen = <T,>(set: Set<T>, listener: T, name: string) => {
    set.add(listener)
    return {
      dispose: () => {
        set.delete(listener)
        disposed.push(name)
      },
    }
  }
  const model = {
    uri: 'file:///workflow.yaml',
    value: '',
    getValue: () => model.value,
    setValue: vi.fn((value: string) => {
      model.value = value
      for (const listener of [...contentListeners]) {
        listener()
      }
    }),
    pushEditOperations: vi.fn((_: unknown, [edit]: { text: string }[]) => {
      model.value = edit?.text ?? ''
    }),
    getFullModelRange: () => ({}),
    isDisposed: () => false,
    getLineCount: () => 3,
    getLineFirstNonWhitespaceColumn: () => 1,
    getLineMaxColumn: () => 10,
    getLanguageId: () => 'yaml',
    onDidChangeContent: (listener: () => void) => listen(contentListeners, listener, 'content'),
  }
  const setModelMarkers = vi.fn(
    (_: unknown, owner: string, wanted: { message: string; startLineNumber: number }[]) => {
      markers.set(owner, wanted)
      for (const listener of [...markerListeners]) {
        listener([model.uri])
      }
    },
  )
  const getModelMarkers = ({ owner }: { owner?: string }) =>
    owner
      ? (markers.get(owner) ?? []).map((marker) => ({ ...marker, owner }))
      : [...markers].flatMap(([key, list]) => list.map((marker) => ({ ...marker, owner: key })))
  return { markers, setModelMarkers, getModelMarkers, model, disposed, markerListeners, listen }
})

vi.mock('monaco-editor', () => ({
  Uri: { parse: (path: string) => path },
  MarkerSeverity: { Error: 8 },
  editor: {
    defineTheme: vi.fn(),
    setTheme: vi.fn(),
    getModel: () => null,
    createModel: (value: string) => {
      fake.model.value = value
      return fake.model
    },
    getModelMarkers: fake.getModelMarkers,
    setModelMarkers: fake.setModelMarkers,
    onDidChangeMarkers: (listener: (resources: string[]) => void) =>
      fake.listen(fake.markerListeners, listener, 'markers'),
    create: () => ({
      updateOptions: vi.fn(),
      getModel: () => fake.model,
      getValue: () => fake.model.value,
      pushUndoStop: vi.fn(),
      dispose: vi.fn(),
    }),
  },
}))
vi.mock('./workers', () => ({ setupMonacoWorkers: () => {} }))
vi.mock('./yamlLanguage', () => ({ ensureYamlLanguage: () => {} }))
vi.mock('./reveal', () => ({ registerRevealer: () => () => {} }))
vi.mock('../components/useCssIsDark', () => ({ useCssIsDark: () => false }))
// The lint finds one problem on line 2 whenever it runs.
vi.mock('./lintContext', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./lintContext')>()),
  useLintEditing: (load: boolean) =>
    load ? { lintWorkflow: () => [{ line: 2, message: 'lint' }], loadYaml: () => ({}) } : undefined,
  useLintSources: () => ({}),
  lintContext: () => ({}),
}))

const messages = (owner: string) => (fake.markers.get(owner) ?? []).map((m) => m.message)

beforeEach(() => {
  fake.markers.clear()
  fake.disposed.length = 0
  fake.setModelMarkers.mockClear()
})
afterEach(cleanup)

test('keeps the host’s marks when the lint runs, each under its own owner', () => {
  vi.useFakeTimers()
  render(<MonacoEditor lint value="jobs: {}" markers={[{ line: 1, message: 'host' }]} />)
  expect(messages('workflowmarkers')).toEqual(['host'])
  expect(messages('workflowlint')).toEqual(['lint'])
  act(() => {
    fake.model.setValue('jobs: { a: {} }')
    vi.advanceTimersByTime(400)
  })
  expect(messages('workflowmarkers')).toEqual(['host'])
  vi.useRealTimers()
})

test('drops the host’s marks once it passes none', () => {
  const { rerender } = render(
    <MonacoEditor value="jobs: {}" markers={[{ line: 1, message: 'host' }]} />,
  )
  expect(messages('workflowmarkers')).toEqual(['host'])
  rerender(<MonacoEditor value="jobs: {}" />)
  expect(messages('workflowmarkers')).toEqual([])
})

test('lints once turned on, and drops its marks once turned off', () => {
  vi.useFakeTimers()
  const { rerender } = render(<MonacoEditor value="jobs: {}" />)
  expect(messages('workflowlint')).toEqual([])
  rerender(<MonacoEditor lint value="jobs: {}" />)
  expect(messages('workflowlint')).toEqual(['lint'])
  rerender(<MonacoEditor lint={false} value="jobs: {}" />)
  expect(messages('workflowlint')).toEqual([])
  act(() => {
    fake.model.setValue('jobs: { a: {} }')
    vi.advanceTimersByTime(400)
  })
  expect(messages('workflowlint')).toEqual([])
  vi.useRealTimers()
})

test('settles once the markers it would set are the ones there', () => {
  render(<MonacoEditor lint value="jobs: {}" />)
  const settled = fake.setModelMarkers.mock.calls.length
  act(() => {
    for (const listener of [...fake.markerListeners]) {
      listener([fake.model.uri])
    }
  })
  expect(fake.setModelMarkers.mock.calls.length).toBe(settled)
})

test('applies an outside change as an undoable edit with preserveUndo', () => {
  const { rerender } = render(<MonacoEditor preserveUndo value="a: 1" />)
  rerender(<MonacoEditor preserveUndo value="a: 2" />)
  expect(fake.model.pushEditOperations).toHaveBeenCalled()
  expect(fake.model.value).toBe('a: 2')
})

test('lets go of its listeners when it unmounts', () => {
  const { unmount } = render(<MonacoEditor lint value="jobs: {}" />)
  unmount()
  expect(fake.disposed).toEqual(expect.arrayContaining(['content', 'markers']))
  expect(fake.markerListeners.size).toBe(0)
})
