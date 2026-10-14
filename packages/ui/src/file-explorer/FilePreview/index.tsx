import { useEffect, useState } from 'react'
import { IconButton } from '../../components/IconButton'
import { Modal } from '../../components/Modal'
import { usePersistedState, useStrings } from '../../components/Provider'
import { SegmentedControl } from '../../components/SegmentedControl'
import { cx } from '../../cx'
import { formatBytes } from '../../format'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DownloadIcon,
  FileIcon,
  LinkIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../../icons'
import type { TreeNode, TStorage } from '../lib/types'
import { getPreviewKind, type PreviewKind } from './previewType'
import { StreamedBadge } from './StreamedBadge'
import { usePresignedUrl } from './usePresignedUrl'
import { FilePreviewViewer } from './Viewer'

// A stored value from before `compact` was named reads as compact too: only
// 'overlay' opens the full window.
type PreviewStyle = 'compact' | 'overlay'

/** Document views run their own chrome and text to the edge of the stage, which
 * full-window bars would float on top of; they get the bars in flow instead. */
function isDocumentView(kind: PreviewKind): boolean {
  return kind === 'code' || kind === 'csv' || kind === 'notebook'
}

interface FilePreviewProps {
  open: boolean
  node: TreeNode | null
  siblings: TreeNode[]
  storage: TStorage | null
  getPresignedUrl: (node: TreeNode) => Promise<[string | null, Error | null]>
  onNavigate: (node: TreeNode) => void
  onClose: () => void
  onDownload: (node: TreeNode) => void
  onCopyUri: (node: TreeNode) => void
}

export function FilePreview({
  open,
  node,
  siblings,
  storage,
  getPresignedUrl,
  onNavigate,
  onClose,
  onDownload,
  onCopyUri,
}: FilePreviewProps) {
  const t = useStrings().fileExplorer
  const { common } = useStrings()
  const [style, setStyle] = usePersistedState<PreviewStyle>('fileExplorer.previewStyle', 'compact')
  const [zoom, setZoom] = useState(100)
  const {
    url,
    loading: urlLoading,
    error: urlError,
  } = usePresignedUrl(node, getPresignedUrl, {
    enabled: open,
    linkErrorMessage: t.preview.linkError,
  })

  const isOverlay = style === 'overlay'
  const index = node ? siblings.findIndex((s) => s.path === node.path) : -1
  const hasPrev = index > 0
  const hasNext = index > -1 && index < siblings.length - 1

  const goPrev = () => {
    const prev = index > 0 ? siblings[index - 1] : undefined
    if (prev) {
      onNavigate(prev)
    }
  }
  const goNext = () => {
    const next = index > -1 ? siblings[index + 1] : undefined
    if (next) {
      onNavigate(next)
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on file change
  useEffect(() => {
    setZoom(100)
  }, [node])

  if (!node) {
    return null
  }

  const kind = getPreviewKind(node)
  const showZoom = kind === 'image'
  const floatingChrome = isOverlay && !isDocumentView(kind)

  const topBar = (
    <div
      className={cx(
        'flex items-center justify-between gap-3 px-4 py-3',
        floatingChrome
          ? cx(
              'absolute inset-x-0 top-0 z-10 bg-linear-to-b from-black/80 to-transparent text-white',
              overImage,
            )
          : 'shrink-0 border-b theme-border',
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <FileIcon className={cx('h-4 w-4 shrink-0', !floatingChrome && 'theme-muted-text')} />
        <span className="truncate font-semibold">{node.name}</span>
        {url && <StreamedBadge />}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <div className="mr-1">
          <SegmentedControl
            label={t.preview.previewLayout}
            value={style}
            onValueChange={setStyle}
            options={[
              { value: 'compact', label: t.preview.compact },
              { value: 'overlay', label: t.preview.fullWindow },
            ]}
          />
        </div>
        <IconButton
          size="md"
          label={t.preview.copyUri}
          icon={<LinkIcon />}
          onClick={() => onCopyUri(node)}
        />
        <IconButton
          size="md"
          label={common.download}
          icon={<DownloadIcon />}
          onClick={() => onDownload(node)}
        />
        <IconButton size="md" label={common.close} icon={<CloseIcon />} onClick={onClose} />
      </div>
    </div>
  )

  const footer = (
    <div
      className={cx(
        'flex items-center justify-between gap-4 px-4 py-2.5',
        floatingChrome
          ? cx(
              'absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-black/80 to-transparent text-white',
              overImage,
            )
          : 'shrink-0 border-t theme-border',
      )}
    >
      <span className={cx('text-xs', !floatingChrome && 'theme-muted-text')}>
        {typeof node.size === 'number' && formatBytes(node.size)}
        {node.contentType && ` · ${node.contentType}`}
      </span>
      <div className="flex items-center gap-3">
        {showZoom && (
          <div
            className={cx(
              'flex items-center gap-1 rounded-lg p-0.5',
              floatingChrome ? 'bg-white/10' : 'theme-muted-panel',
            )}
          >
            <IconButton
              size="xs"
              label={common.zoomOut}
              onClick={() => setZoom((z) => Math.max(25, z - 25))}
              icon={<ZoomOutIcon />}
            />
            <span className="min-w-11 text-center text-xs tabular-nums">{zoom}%</span>
            <IconButton
              size="xs"
              label={common.zoomIn}
              onClick={() => setZoom((z) => Math.min(400, z + 25))}
              icon={<ZoomInIcon />}
            />
          </div>
        )}
        <div className="flex items-center gap-1">
          <IconButton
            size="xs"
            label={t.preview.previousFile}
            disabled={!hasPrev}
            onClick={goPrev}
            icon={<ChevronLeftIcon />}
          />
          <span className="min-w-14 text-center text-xs tabular-nums">
            {index >= 0 ? `${index + 1} / ${siblings.length}` : ''}
          </span>
          <IconButton
            size="xs"
            label={t.preview.nextFile}
            disabled={!hasNext}
            onClick={goNext}
            icon={<ChevronRightIcon />}
          />
        </div>
      </div>
    </div>
  )

  const stage = (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <FilePreviewViewer
        key={node.path}
        node={node}
        kind={kind}
        url={url}
        urlLoading={urlLoading}
        urlError={urlError}
        zoom={zoom}
        storage={storage}
        onDownload={() => onDownload(node)}
      />
    </div>
  )

  return (
    <Modal
      open={open}
      onClose={onClose}
      align="center"
      panel={false}
      aria-label={node.name}
      backdropClassName={
        isOverlay ? 'bg-[rgba(1,4,9,.94)]' : 'bg-[rgba(1,4,9,.62)] backdrop-blur-[3px]'
      }
      className={cx(
        'flex flex-col',
        isOverlay
          ? 'fixed inset-0'
          : 'relative h-[min(780px,90vh)] w-[min(1120px,94vw)] overflow-hidden rounded-2xl border theme-border shadow-2xl',
        floatingChrome ? 'bg-transparent' : 'bg-(--theme-panel-bg)',
      )}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') {
          goNext()
        } else if (e.key === 'ArrowLeft') {
          goPrev()
        }
      }}
    >
      {isOverlay && (
        <>
          <EdgeButton
            side="left"
            label={t.preview.previousFile}
            disabled={!hasPrev}
            onClick={goPrev}
          />
          <EdgeButton
            side="right"
            label={t.preview.nextFile}
            disabled={!hasNext}
            onClick={goNext}
          />
        </>
      )}
      {topBar}
      {stage}
      {footer}
    </Modal>
  )
}

// Chrome drawn over an image reads light on dark: its buttons keep their one
// look, with the tokens they read set for the dark backdrop.
const overImage =
  '[--theme-app:#fff] [--theme-muted-text-color:rgb(255_255_255/0.8)] [--theme-muted-panel-bg:rgb(255_255_255/0.15)]'

function EdgeButton({
  side,
  label,
  disabled,
  onClick,
}: {
  side: 'left' | 'right'
  label: string
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'absolute top-1/2 z-20 flex h-13 w-13 -translate-y-1/2 items-center justify-center rounded-full text-white backdrop-blur',
        side === 'left' ? 'left-5' : 'right-5',
        disabled ? 'cursor-not-allowed opacity-30' : 'cursor-pointer hover:bg-white/20',
      )}
      style={{ backgroundColor: 'rgba(22,27,34,.7)' }}
    >
      {side === 'left' ? (
        <ChevronLeftIcon className="h-6 w-6" />
      ) : (
        <ChevronRightIcon className="h-6 w-6" />
      )}
    </button>
  )
}
