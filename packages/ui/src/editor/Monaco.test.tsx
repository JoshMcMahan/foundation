// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import MonacoEditor from './Monaco'

const created: Array<{ readOnly?: boolean }> = []
const updateOptions = vi.fn()

vi.mock('monaco-editor', () => {
  const listener = () => ({ dispose: vi.fn() })
  const model = {
    uri: 'file:///default',
    getValue: () => '',
    setValue: vi.fn(),
    onDidChangeContent: listener,
  }
  return {
    Uri: { parse: (path: string) => path },
    editor: {
      defineTheme: vi.fn(),
      setTheme: vi.fn(),
      getModel: () => null,
      getModelMarkers: () => [],
      onDidChangeMarkers: listener,
      createModel: () => model,
      create: (_element: HTMLElement, options: { readOnly?: boolean }) => {
        created.push(options)
        return { updateOptions, getModel: () => model, getValue: () => '', dispose: vi.fn() }
      },
    },
  }
})
vi.mock('./workers', () => ({ setupMonacoWorkers: () => {} }))
vi.mock('./yamlLanguage', () => ({ ensureYamlLanguage: () => {} }))
vi.mock('../components/useCssIsDark', () => ({ useCssIsDark: () => false }))

afterEach(() => {
  cleanup()
  created.length = 0
  updateOptions.mockClear()
})

test('an editor that opened disabled becomes editable once disabled turns false', () => {
  const { rerender } = render(<MonacoEditor disabled value="jobs: {}" />)
  expect(created[0]?.readOnly).toBe(true)

  rerender(<MonacoEditor disabled={false} value="jobs: {}" />)
  expect(updateOptions).toHaveBeenLastCalledWith({ readOnly: false })
})

test('readOnly from the host still locks an editor that is not disabled', () => {
  const { rerender } = render(<MonacoEditor readOnly value="jobs: {}" />)
  expect(created[0]?.readOnly).toBe(true)

  rerender(<MonacoEditor readOnly disabled={false} value="jobs: {}" />)
  expect(updateOptions).toHaveBeenLastCalledWith({ readOnly: true })
})
