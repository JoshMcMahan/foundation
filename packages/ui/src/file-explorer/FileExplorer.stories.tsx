import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { userEvent, within } from 'storybook/test'
import FileExplorer from './FileExplorer'
import { FileExplorerProvider } from './FileExplorerContext'
import { CorsPropagatingPreview, NoDataAvailablePreview } from './helpers'
import type { IFileExplorerClient, IFileExplorerProvider } from './lib/fileExplorer'
import type { TStorage, TStorageObject, UploadSession } from './lib/types'
import { UploadSessionToast } from './toasts'

const meta: Meta = {
  title: 'UI/FileExplorer',
  parameters: {
    docs: {
      description: {
        component:
          'The explorer against a mock in-memory provider with simulated ' +
          'latency — the same injection seam real CSP providers use.',
      },
    },
  },
}
export default meta

// An in-memory object store. Keys are object keys; directories are implied.
const OBJECTS: Record<string, string> = {
  'README.md': '# Demo storage\n\nThis tree lives in memory.\n',
  'data/input.csv': 'id,value\n1,alpha\n2,beta\n',
  'results/run-001/metrics.json': '{ "loss": 0.021, "epochs": 12 }\n',
  'results/run-001/stdout.log': 'epoch 1/12 ... done\nepoch 12/12 ... done\n',
  'results/run-002/metrics.json': '{ "loss": 0.018, "epochs": 14 }\n',
  'results/run-002/checkpoints/epoch-14-validation-loss-0.018-summary.json':
    '{ "epoch": 14, "loss": 0.018 }\n',
  'results/run-002/report.ipynb': JSON.stringify({
    cells: [{ cell_type: 'markdown', metadata: {}, source: ['# Run 002 report'] }],
    metadata: {},
    nbformat: 4,
    nbformat_minor: 5,
  }),
}

const LATENCY_MS = 350

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

type MockListInput = { directoryPath: string }

function listEntries(directoryPath: string): TStorageObject[] {
  const prefix = directoryPath ? `${directoryPath.replace(/\/+$/, '')}/` : ''
  const seen = new Set<string>()
  const out: TStorageObject[] = []
  for (const key of Object.keys(OBJECTS)) {
    if (!key.startsWith(prefix)) {
      continue
    }
    const rest = key.slice(prefix.length)
    const slash = rest.indexOf('/')
    if (slash === -1) {
      out.push({
        path: `${prefix}${rest}`,
        type: 'file',
        key,
        size: OBJECTS[key]?.length,
        modified: new Date().toISOString(),
      })
    } else {
      const dir = rest.slice(0, slash)
      if (!seen.has(dir)) {
        seen.add(dir)
        out.push({
          path: `${prefix}${dir}/`,
          type: 'directory',
          key: `${prefix}${dir}/`,
        })
      }
    }
  }
  return out
}

function createMockClient(): IFileExplorerClient {
  return {
    getExpiresAt: () => new Date(Date.now() + 60 * 60 * 1000),
    async listDirectory(input: unknown) {
      await sleep(LATENCY_MS)
      return input as MockListInput
    },
    async getFile(input: unknown) {
      await sleep(LATENCY_MS)
      const { key } = input as { key: string }
      const content = OBJECTS[key]
      if (content === undefined) {
        return [null, new Error(`No such object: ${key}`)]
      }
      return [URL.createObjectURL(new Blob([content], { type: 'text/plain' })), null]
    },
    async deleteFiles(input: unknown) {
      await sleep(LATENCY_MS)
      const { keys } = input as { keys: string[] }
      for (const key of keys) {
        delete OBJECTS[key]
      }
      return {}
    },
    async uploadFile(input: unknown, onProgress) {
      const { key, file } = input as { key: string; file: File | Blob }
      const total = file.size || 1
      for (const pct of [15, 45, 80, 100]) {
        await sleep(200)
        onProgress?.({
          loadedBytes: Math.round((total * pct) / 100),
          totalBytes: total,
          percentage: pct,
        })
      }
      OBJECTS[key] = `(uploaded ${total} bytes)`
      return {}
    },
  }
}

const mockProvider: IFileExplorerProvider = {
  convertDataToStorageObjects(data: unknown) {
    return listEntries((data as MockListInput).directoryPath)
  },
  listDirectoryInput: (_storage, dir_path = '') => ({
    directoryPath: dir_path,
  }),
  getFileInput: (_storageName, node) => ({
    key: node.relativePath ?? node.path,
  }),
  deleteFilesInput: (_storageName, nodes) => ({
    keys: nodes.map((n) => n.relativePath ?? n.path),
  }),
  uploadFileInput: (_storageName, objectPath, file) => ({
    key: objectPath,
    file,
  }),
}

const STORAGE: TStorage = {
  id: 'demo-storage',
  name: 'demo-bucket',
  user: 'storybook',
  type: 'bucket',
  csp: 'aws',
  canWrite: true,
  canUpload: true,
  canShare: false,
  canManageAccess: false,
}
const STORAGES = [STORAGE]

const COMPUTE_STORAGE: TStorage = {
  id: 'demo-compute',
  name: 'cluster~demo-cluster',
  displayName: 'demo-cluster',
  user: 'storybook',
  type: 'cluster',
  csp: 'compute',
  canWrite: true,
  canUpload: true,
  canDelete: false,
  canShare: false,
  canManageAccess: false,
  previewLimits: { codeLines: 1, notebookBytes: 64 },
}

function ExplorerDemo({
  storages = STORAGES,
  initialPath = '',
  width,
}: {
  storages?: TStorage[]
  initialPath?: string
  width?: number
}) {
  const [path, setPath] = useState(initialPath)
  return (
    <div style={{ height: 560, width }}>
      <FileExplorerProvider>
        <FileExplorer
          storages={storages}
          showUserHierarchy
          getProviderAndClient={async () => ({
            provider: mockProvider,
            client: createMockClient(),
          })}
          selectedPath={path}
          onPathChange={setPath}
        />
      </FileExplorerProvider>
    </div>
  )
}

export const Default: StoryObj = {
  render: () => <ExplorerDemo />,
}

export const NarrowPane: StoryObj = {
  render: () => (
    <ExplorerDemo width={960} initialPath="storybook/demo-bucket/results/run-002/checkpoints" />
  ),
}

function ComputeRootDemo() {
  const [connected, setConnected] = useState(true)
  return (
    <div>
      <button type="button" onClick={() => setConnected((c) => !c)}>
        {connected ? 'Disconnect demo-cluster' : 'Reconnect demo-cluster'}
      </button>
      <ExplorerDemo storages={connected ? [STORAGE, COMPUTE_STORAGE] : STORAGES} />
    </div>
  )
}

export const ComputeRoot: StoryObj = {
  render: () => <ComputeRootDemo />,
}

const uploadSession = (
  status: UploadSession['status'],
  overallProgress: number,
  completedFiles: number,
): UploadSession =>
  ({
    id: status,
    storageName: 'demo-bucket',
    targetPath: 'results/run-002',
    uploadNodes: [
      { name: 'metrics.json', file: new Blob(['{}']), relativePath: 'metrics.json' },
      { name: 'stdout.log', file: new Blob(['ok']), relativePath: 'stdout.log' },
    ],
    status,
    queueIndex: 1,
    progress: {
      completedFiles,
      totalFiles: 2,
      totalSizeBytes: 48_000_000,
      overallProgress,
      estimatedSecondsLeft: status === 'uploading' ? 42 : undefined,
      allFiles: new Map([
        [
          'metrics.json',
          { fileKey: 'metrics.json', fileSizeBytes: 16_000_000, percentage: overallProgress },
        ],
        [
          'stdout.log',
          { fileKey: 'stdout.log', fileSizeBytes: 32_000_000, percentage: overallProgress },
        ],
      ]),
    },
    toastId: status,
  }) as unknown as UploadSession

/** An upload's toast in each state; the first shows its details open. */
export const UploadToasts: StoryObj = {
  render: () => (
    <div className="flex w-96 flex-col gap-3">
      {(
        [
          ['uploading', 45, 0],
          ['queued', 0, 0],
          ['completed', 100, 2],
          ['failed', 60, 1],
          ['canceled', 30, 0],
        ] as const
      ).map(([status, progress, done]) => (
        <div key={status} className="panel rounded-lg p-3 shadow">
          <UploadSessionToast session={uploadSession(status, progress, done)} queueLength={3} />
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const [expand] = within(canvasElement).getAllByRole('button', { name: 'Expand details' })
    if (expand) {
      await userEvent.click(expand)
    }
  },
}

/** A folder whose listing failed. */
export const ConnectionIssue: StoryObj = {
  render: () => (
    <div style={{ height: 360 }} className="flex">
      <NoDataAvailablePreview
        selectedStorage={STORAGE}
        connectionIssueMessage="Failed to load contents for results: request timed out"
        onRefresh={async () => {}}
      />
    </div>
  ),
}

/** New CORS rules spreading through the storage; motion stops under reduced motion. */
export const CorsPropagating: StoryObj = {
  render: () => (
    <div style={{ height: 420 }} className="flex items-center">
      <CorsPropagatingPreview />
    </div>
  ),
}

/** A file's details, with Details and Preview tabs. */
export const FileDetails: StoryObj = {
  render: () => <ExplorerDemo initialPath="storybook/demo-bucket/results/run-001/metrics.json" />,
}

/** Checked rows take the theme's selection tint. */
export const CheckedRows: StoryObj = {
  render: () => <ExplorerDemo initialPath="storybook/demo-bucket/results/run-002" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(
      await canvas.findByLabelText('Select metrics.json', {}, { timeout: 10000 }),
    )
    await userEvent.click(
      await canvas.findByLabelText('Select report.ipynb', {}, { timeout: 10000 }),
    )
  },
}
