import { addEditorLanguages, editorLanguagesLoading, hostEditorWorker } from './languages'

test('an editor waits for the languages added before it mounts, then for none', async () => {
  const loaded: string[] = []
  addEditorLanguages({
    load: async () => {
      loaded.push('ruby')
    },
  })
  addEditorLanguages({
    load: () => Promise.reject(new Error('offline')),
    workers: { typescript: () => 'ts worker' as unknown as Worker },
  })
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  const loading = editorLanguagesLoading()
  // A second editor mounting meanwhile waits on the same load rather than starting another.
  expect(editorLanguagesLoading()).toBe(loading)
  await loading
  expect(loaded).toEqual(['ruby'])
  expect(error).toHaveBeenCalledOnce()
  expect(editorLanguagesLoading()).toBeUndefined()
  expect(hostEditorWorker('typescript')?.()).toBe('ts worker')
  expect(hostEditorWorker('css')).toBeUndefined()
  error.mockRestore()
})

test('a language added while others load is waited for with them', async () => {
  let finish = () => {}
  addEditorLanguages({ load: () => new Promise<void>((resolve) => (finish = resolve)) })
  const first = editorLanguagesLoading()
  const loaded: string[] = []
  addEditorLanguages({
    load: async () => {
      loaded.push('r')
    },
  })
  const both = editorLanguagesLoading()
  expect(both).not.toBe(first)
  finish()
  await both
  expect(loaded).toEqual(['r'])
  expect(editorLanguagesLoading()).toBeUndefined()
})
