import { type JSX, useState, useTransition } from 'react'
import { Button } from '../components/Button'
import Callout from '../components/Callout'
import { ProgressBar } from '../components/Meter'
import {
  type UIData,
  type UIStrings,
  usePersistedState,
  useProvisionCorsRules,
  useSlots,
  useStrings,
} from '../components/Provider'
import { useElapsed } from '../components/relativeTime'
import { Skeleton } from '../components/Skeleton'
import { toast } from '../components/Toast'
import { cx } from '../cx'
import { formatBytes } from '../format'
import {
  CustomizeIcon,
  DiskIcon,
  FileIcon,
  FileTextIcon,
  FolderIcon,
  ImageIcon,
  PdfIcon,
  RefreshIcon,
  RetryIcon,
  ShareIcon,
  SpreadsheetIcon,
  UserIcon,
  VideoIcon,
  WarningIcon,
  ZipIcon,
} from '../icons'
import { ListSkeleton } from '../list/index'
import { CorsError } from './lib/errors'
import type { TreeNode, TStorage, UploadNode } from './lib/types'
import { getFileExtension } from './lib/utils'

const SIDEBAR_WIDTH_STORAGE_KEY = 'fileExplorerSidebarWidth'
const SIDEBAR_WIDTH_DEFAULT = 300

const contentTypeIconMap = [
  {
    pattern: /^image\//,
    icon: <ImageIcon className="h-4 w-4 text-blue-500" />,
  },
  {
    pattern: /^video\//,
    icon: <VideoIcon className="h-4 w-4 text-purple-500" />,
  },
  {
    pattern: /^application\/pdf$/,
    icon: <PdfIcon className="h-4 w-4 text-red-500" />,
  },
  {
    pattern: /(spreadsheet|csv|excel)/,
    icon: <SpreadsheetIcon className="h-4 w-4 text-green-500" />,
  },
  {
    pattern: /(document|word)/,
    icon: <FileTextIcon className="h-4 w-4 text-blue-400" />,
  },
  {
    pattern: /(javascript|json|css|html)/,
    icon: <FileTextIcon className="h-4 w-4 text-yellow-500" />,
  },
  {
    pattern: /(zip|gzip|tar)/,
    icon: <ZipIcon className="h-4 w-4 text-purple-600" />,
  },
]

// Use regex for extension matching, similar to contentTypeIconMap
const extensionIconMap = [
  {
    pattern: /^(jpe?g|png|gif|svg|webp)$/i,
    icon: <ImageIcon className="h-4 w-4 text-blue-500" />,
  },
  {
    pattern: /^(mp4|mov|avi|mkv)$/i,
    icon: <VideoIcon className="h-4 w-4 text-purple-500" />,
  },
  { pattern: /^pdf$/i, icon: <PdfIcon className="h-4 w-4 text-red-500" /> },
  {
    pattern: /^(xlsx?|csv|ods)$/i,
    icon: <SpreadsheetIcon className="h-4 w-4 text-green-500" />,
  },
  {
    pattern: /^(docx?|odt)$/i,
    icon: <FileTextIcon className="h-4 w-4 text-blue-400" />,
  },
  {
    pattern: /^(js|ts|json|css|html|md|txt)$/i,
    icon: <FileTextIcon className="h-4 w-4 text-yellow-500" />,
  },
  {
    pattern: /^(zip|gz|gzip|tar|rar)$/i,
    icon: <ZipIcon className="h-4 w-4 text-purple-600" />,
  },
]

// A storage's own image, or the host's for its type, falling back to the host's if its own fails.
function StorageImage({ node }: { node: TreeNode }) {
  const { storageIconUrl } = useSlots()
  const alt = useStrings().fileExplorer.chrome.storageIconAlt
  const fallbackSrc = node.storageNodeIcon
    ? storageIconUrl?.({ type: node.storageNodeIcon })
    : undefined
  const src = node.storageImageUrl || fallbackSrc
  if (!src) {
    return <DiskIcon className="h-4 w-4 mr-2" />
  }
  return (
    <img
      className="h-4 w-4 mr-2"
      src={src}
      alt={alt}
      onError={(e) => {
        if (fallbackSrc) {
          e.currentTarget.src = fallbackSrc
        }
      }}
    />
  )
}

function getNodeIcon(node: TreeNode): JSX.Element | null {
  const isUserNode = !node.storageId
  const isStorageNode = node.root
  if (isUserNode) {
    return <UserIcon className="h-3 w-3 mr-2" />
  }

  if (isStorageNode && node.storageType === 'workspace') {
    return <DiskIcon className="h-4 w-4 mr-2" />
  }

  if (isStorageNode && node.storageNodeIcon) {
    return <StorageImage node={node} />
  }

  // Skip directories as the icon is handled conditionally in the tree
  if (!isStorageNode && node.type === 'directory') {
    return null
  }

  if (node.contentType) {
    for (const { pattern, icon } of contentTypeIconMap) {
      if (pattern.test(node.contentType)) {
        return icon
      }
    }
  }

  const ext = getFileExtension(node.name)
  if (ext) {
    for (const { pattern, icon } of extensionIconMap) {
      if (pattern.test(ext)) {
        return icon
      }
    }
  }

  // Default file icon for unknown types
  return <FileIcon className="h-4 w-4 theme-muted-text" />
}

function renderUploadNodes(uploadNodes: UploadNode[]) {
  const sorted = [...uploadNodes].sort((a, b) => a.relativePath.localeCompare(b.relativePath))

  let lastFolders: string[] = []

  return sorted.map((node) => {
    const parts = node.relativePath.split('/')
    const folders = parts.slice(0, -1)
    const fileName = parts[parts.length - 1]

    // Find where the folder path diverges from the last rendered
    let common = 0
    while (
      common < folders.length &&
      common < lastFolders.length &&
      folders[common] === lastFolders[common]
    ) {
      common++
    }

    const folderElements = folders.slice(common).map((folder, i) => (
      <div
        key={folders.slice(0, common + i + 1).join('/')}
        style={{ marginLeft: (common + i) * 16 }}
      >
        <FolderIcon className="inline h-3 w-3 mr-1" />
        <span className="font-semibold">{folder}/</span>
      </div>
    ))

    lastFolders = folders

    return (
      <div key={node.relativePath}>
        {folderElements}
        <div style={{ marginLeft: folders.length * 16 }}>
          <span className="inline-block w-3" />
          {fileName}
          {node.file && (
            <span className="ml-2 text-xs theme-muted-text">({formatBytes(node.file.size)})</span>
          )}
        </div>
      </div>
    )
  })
}

function NoFileSelectedPreview() {
  const t = useStrings().fileExplorer
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="flex flex-col items-center max-w-sm text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full theme-muted-panel mb-4">
          <DiskIcon className="h-6 w-6 theme-muted-text" />
        </div>
        <h2 className="text-base font-semibold mb-1">{t.empty.nothingSelected}</h2>
        <p className="text-sm theme-muted-text">{t.empty.nothingSelectedHint}</p>
      </div>
    </div>
  )
}

/** Shown instead of a skeleton that has nothing left to wait for. */
function NotFoundPreview({ path, onRetry }: { path: string; onRetry: () => void }) {
  const t = useStrings().fileExplorer.notFound
  const { common } = useStrings()
  const name = path.replace(/\/$/, '').split('/').pop() || path
  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="flex flex-col items-center max-w-sm text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-full theme-muted-panel mb-4">
          <DiskIcon className="h-6 w-6 theme-muted-text" />
        </div>
        <h2 className="text-base font-semibold mb-1">{t.title(name)}</h2>
        <p className="text-sm theme-muted-text mb-4">{t.description}</p>
        <Button variant="primary" icon={<RetryIcon />} onClick={onRetry}>
          {common.retry}
        </Button>
      </div>
    </div>
  )
}

export type CorsAwareRefresh = (opts?: {
  silent?: boolean
  // biome-ignore lint/suspicious/noConfusingVoidType: a refresh that reports nothing is an async function with no return
}) => Promise<{ corsError: boolean } | void>

function CorsIssuePreview({
  selectedStorage,
  onRefresh,
}: {
  selectedStorage: TStorage | null
  onRefresh?: CorsAwareRefresh | undefined
}) {
  const t = useStrings().fileExplorer.cors
  const messages = useStrings().fileExplorer.messages
  const { common } = useStrings()
  const provisionCorsRules = useProvisionCorsRules()
  const [isPending, startTransition] = useTransition()
  const handleAddCorsRules = () => {
    if (!provisionCorsRules) {
      return
    }
    startTransition(async () => {
      await addCorsRules({
        provision: provisionCorsRules,
        strings: messages,
        csp: selectedStorage?.csp,
        type: selectedStorage?.type,
        username: selectedStorage?.user,
        storageName: selectedStorage?.displayName,
        onRefresh,
      })
    })
  }

  if (isPending) {
    return <CorsPropagatingPreview />
  }

  return (
    <div className="flex flex-col items-center justify-center max-w-lg mx-auto">
      <Callout className="text-left" type="info">
        <h4 className="font-semibold mb-2">{t.explanation.title}</h4>
        <p className="mb-2">{t.explanation.description}</p>
        <p>{t.explanation.action}</p>
        <p className="mt-2 text-sm italic">{t.explanation.note}</p>
      </Callout>
      <div className="flex gap-3 justify-center">
        <Button
          variant="primary"
          icon={<RefreshIcon />}
          onClick={onRefresh ? () => onRefresh() : undefined}
        >
          {common.retry}
        </Button>
        {provisionCorsRules && (
          <Button variant="primary" icon={<CustomizeIcon />} onClick={handleAddCorsRules}>
            {t.actions.addRules}
          </Button>
        )}
      </div>
    </div>
  )
}

// Expected Azure propagation window. The backend polls up to 90s; we show
// progress relative to this so a typical propagation reads as steady rather
// than rushed.
const CORS_PROPAGATION_BUDGET_MS = 60_000

function CorsPropagatingPreview() {
  const t = useStrings().fileExplorer.cors.propagating
  const [start] = useState(Date.now)
  const elapsedMs = useElapsed(start) ?? 0

  const totalSeconds = Math.floor(elapsedMs / 1000)
  const mm = String(Math.floor(totalSeconds / 60)).padStart(2, '0')
  const ss = String(totalSeconds % 60).padStart(2, '0')
  const progressPct = Math.min(99, (elapsedMs / CORS_PROPAGATION_BUDGET_MS) * 100)

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col items-center justify-center max-w-md mx-auto px-6 py-8 motion-safe:animate-[fadeInUp_400ms_ease-out]"
    >
      {/* The rings are decoration: with reduced motion they hold still, and
          the stages and the progress bar below still say how far along it is. */}
      <div aria-hidden="true" className="relative w-28 h-28 mb-6 flex items-center justify-center">
        <span
          className="absolute inline-flex h-full w-full rounded-full bg-(--theme-info)/30 motion-safe:animate-ping"
          style={{ animationDuration: '2.4s' }}
        />
        <span
          className="absolute inline-flex h-2/3 w-2/3 rounded-full bg-(--theme-info)/40 motion-safe:animate-ping"
          style={{ animationDuration: '2.4s', animationDelay: '0.6s' }}
        />
        <span
          className="absolute inline-flex h-1/3 w-1/3 rounded-full bg-(--theme-info)/60 motion-safe:animate-ping"
          style={{ animationDuration: '2.4s', animationDelay: '1.2s' }}
        />
        <span className="relative inline-flex items-center justify-center w-8 h-8 rounded-full bg-(--theme-info) shadow-[0_0_24px_color-mix(in_oklab,var(--theme-info)_55%,transparent)]">
          <span className="absolute inline-flex h-2 w-2 rounded-full bg-(--theme-panel-bg) motion-safe:animate-pulse" />
        </span>
      </div>

      <h3 className="text-lg font-semibold mb-1 tracking-tight">{t.title}</h3>
      <p className="theme-muted-text text-sm text-center mb-6 max-w-sm">{t.description}</p>

      <ol className="flex items-center gap-2 mb-6">
        <PropagationStage status="done" label={t.stages.submitted} />
        <PropagationConnector active />
        <PropagationStage status="active" label={t.stages.propagating} />
        <PropagationConnector active={false} />
        <PropagationStage status="pending" label={t.stages.verified} />
      </ol>

      <ProgressBar
        value={progressPct}
        size="sm"
        aria-label={t.stages.propagating}
        className="w-full max-w-xs mb-3"
      />

      <div className="flex items-center gap-2 theme-muted-text text-xs font-mono tabular-nums">
        <span>
          {mm}:{ss}
        </span>
        <span aria-hidden="true" className="opacity-40">
          ·
        </span>
        <span>{t.telemetry.probing}</span>
      </div>
    </div>
  )
}

function PropagationStage({
  status,
  label,
}: {
  status: 'done' | 'active' | 'pending'
  label: string
}) {
  return (
    <li className="flex flex-col items-center gap-1.5">
      <span
        className={cx(
          'relative flex items-center justify-center w-6 h-6 rounded-full border transition-colors',
          status === 'done' &&
            'bg-(--theme-success-solid) border-(--theme-success-solid) text-white',
          status === 'active' && 'border-(--theme-info)',
          status === 'pending' && 'theme-border',
        )}
      >
        {status === 'done' && (
          <svg
            viewBox="0 0 16 16"
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="3.5 8.5 6.5 11.5 12.5 5" />
          </svg>
        )}
        {status === 'active' && (
          <>
            <span className="absolute inline-flex h-full w-full motion-safe:animate-ping rounded-full bg-(--theme-info)/60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-(--theme-info)" />
          </>
        )}
        {status === 'pending' && (
          <span className="inline-flex h-1.5 w-1.5 rounded-full theme-muted-text opacity-60" />
        )}
      </span>
      <span
        className={cx(
          'text-[11px] uppercase tracking-wider',
          status === 'pending' ? 'theme-muted-text opacity-60' : 'theme-text',
        )}
      >
        {label}
      </span>
    </li>
  )
}

function PropagationConnector({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cx(
        'h-px w-8 -mt-5 transition-colors',
        active ? 'bg-(--theme-info)' : 'theme-border border-t',
      )}
    />
  )
}

function NoDataAvailablePreview({
  selectedStorage,
  error,
  onRefresh,
  connectionIssueMessage = null,
  className,
  canWrite = true,
}: {
  selectedStorage: TStorage | null
  error?: Error | null
  onRefresh?: CorsAwareRefresh
  connectionIssueMessage?: string | null | undefined
  className?: string
  canWrite?: boolean
}) {
  const t = useStrings().fileExplorer
  const { common } = useStrings()
  if (error instanceof CorsError) {
    return (
      <div className={cx('flex-1 flex items-center justify-center w-full text-center', className)}>
        <CorsIssuePreview selectedStorage={selectedStorage} onRefresh={onRefresh} />
      </div>
    )
  }

  return (
    <div className={cx('flex-1 flex items-center justify-center w-full text-center', className)}>
      {!connectionIssueMessage ? (
        <div className="flex flex-col items-center justify-center max-w-sm p-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full theme-muted-panel mb-4">
            <FileIcon className="h-6 w-6 theme-muted-text" />
          </div>
          <h2 className="text-base font-semibold mb-1">{t.empty.folderEmpty}</h2>
          <p className="text-sm theme-muted-text">
            {canWrite ? t.empty.dropHint : t.empty.readOnlyHint}
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center max-w-md p-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-(--theme-warning-muted) mb-4">
            <WarningIcon aria-hidden="true" className="h-6 w-6 text-(--theme-warning)" />
          </div>
          <h2 className="text-base font-semibold mb-1">{t.empty.connectionIssue}</h2>
          <p className="text-sm theme-muted-text mb-4">{connectionIssueMessage}</p>
          <Button
            variant="primary"
            icon={<RefreshIcon />}
            onClick={onRefresh ? () => onRefresh() : undefined}
          >
            {common.retry}
          </Button>
        </div>
      )}
    </div>
  )
}

function SkeletonPreview() {
  const [sidebarWidth] = usePersistedState(SIDEBAR_WIDTH_STORAGE_KEY, SIDEBAR_WIDTH_DEFAULT)
  // Mirror the real explorer chrome so nothing shifts when it swaps in.
  return (
    <div className="w-full h-full flex">
      {/* Sidebar skeleton */}
      <div className="h-full shrink-0" style={{ width: `${sidebarWidth}px` }}>
        <div className="h-full flex flex-col border-r theme-border bg-(--theme-panel-bg)/60">
          <div className="flex items-center justify-end h-10 px-3 shrink-0 border-b theme-border">
            <div className="flex gap-x-0.5">
              <div className="h-7 w-7" />
              <div className="h-7 w-7" />
            </div>
          </div>
          <div className="overflow-auto flex-1 px-2 py-2 space-y-1.5">
            <Skeleton count={6} height={14} />
          </div>
        </div>
      </div>
      {/* Details Panel */}
      <div className="h-full flex flex-col flex-1 min-w-0">
        <div className="h-12 shrink-0 border-b theme-border" />
        <ListSkeleton />
      </div>
    </div>
  )
}

interface IDragDropZoneProps {
  onDropFiles?: ((files: FileList | DataTransferItemList) => void) | undefined
  children: React.ReactNode
  className?: string
}

function DragDropZone({ onDropFiles, children, className = '' }: IDragDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  return (
    <div
      role="none"
      className={cx(
        'transition-[box-shadow,background-color] duration-150',
        className,
        isDragging && 'ring-1 ring-(--theme-link) ring-inset bg-(--theme-link)/5',
      )}
      onDragOver={(e) => {
        e.preventDefault()
        if (onDropFiles) {
          setIsDragging(true)
        }
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setIsDragging(false)
        if (!onDropFiles) {
          return
        }
        onDropFiles(e.dataTransfer.items.length ? e.dataTransfer.items : e.dataTransfer.files)
      }}
    >
      {children}
    </div>
  )
}

interface IShareFileButtonProps {
  node: TreeNode
  onShare: (node: TreeNode) => Promise<void>
}

function ShareFileButton({ node, onShare }: IShareFileButtonProps) {
  const t = useStrings().fileExplorer
  const [isPending, startTransition] = useTransition()

  return (
    <Button
      variant="primary"
      size="sm"
      aria-label={t.preview.shareFile}
      icon={<ShareIcon />}
      onClick={() => {
        startTransition(async () => {
          await onShare(node)
        })
      }}
      loading={isPending}
    >
      <span className="hidden md:inline">{t.empty.shareThisFile}</span>
    </Button>
  )
}

async function addCorsRules({
  provision,
  strings,
  csp,
  type,
  username,
  storageName,
  onRefresh,
}: {
  provision: NonNullable<UIData['provisionCorsRules']>
  strings: UIStrings['fileExplorer']['messages']
  csp: string | undefined
  type?: string | undefined
  username: string | undefined
  storageName: string | undefined
  onRefresh?: CorsAwareRefresh | undefined
}) {
  if (!storageName || !username || !csp) {
    toast.error(strings.corsNoStorage)
    return
  }

  const res = await provision({ csp, type, username, storageName })
  if (res.error) {
    toast.error(res.error)
    return
  }
  if (!onRefresh) {
    toast.success(strings.corsAdded)
    return
  }
  // Azure can take tens of seconds to propagate new CORS rules. Probe
  // silently (no UI state updates) so the user keeps seeing the "CORS
  // Configuration Required" screen with the Waiting… button — instead of
  // flashing between the CORS preview and an empty list while we poll.
  // When a probe finally succeeds, do one non-silent refresh to populate
  // the listing and clear the CORS flag.
  const pollBudgetMs = 90_000
  const pollIntervalMs = 3_000
  const deadline = Date.now() + pollBudgetMs
  await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  while (Date.now() < deadline) {
    const result = await onRefresh({ silent: true })
    if (!result?.corsError) {
      await onRefresh()
      toast.success(strings.corsAdded)
      return
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
  }
  toast.warning(strings.corsPropagating)
}

export {
  CorsIssuePreview,
  CorsPropagatingPreview,
  DragDropZone,
  getNodeIcon,
  NoDataAvailablePreview,
  NoFileSelectedPreview,
  NotFoundPreview,
  renderUploadNodes,
  ShareFileButton,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_STORAGE_KEY,
  SkeletonPreview,
}
