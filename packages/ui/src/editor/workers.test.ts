// @vitest-environment jsdom
import { addEditorLanguages } from './languages'
import { setupMonacoWorkers } from './workers'

class FakeWorker {
  readonly url: string
  constructor(url: URL | string) {
    this.url = String(url)
  }
}
vi.stubGlobal('Worker', FakeWorker)
setupMonacoWorkers()
const worker = (label: string) =>
  window.MonacoEnvironment?.getWorker?.('workerMain.js', label) as unknown as FakeWorker

test('the editor and JSON services run in the workers bundled for them', () => {
  expect(worker('editorWorkerService').url).toMatch(/editor\.worker/)
  expect(worker('json').url).toMatch(/json\.worker/)
})

test('a service the host added runs in the host’s worker', () => {
  const ts = new FakeWorker('ts.worker.js')
  addEditorLanguages({ load: async () => {}, workers: { typescript: () => ts as never } })
  expect(worker('typescript')).toBe(ts)
})

test('a service nobody gave a worker fails, rather than running in one that can’t serve it', () => {
  expect(() => worker('css')).toThrow(/addEditorLanguages/)
})
