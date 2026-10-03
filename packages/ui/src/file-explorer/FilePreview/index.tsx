import cx from 'classnames'
import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocalStorage } from 'usehooks-ts'
import { useStrings } from '../../components/Provider'
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CloseIcon,
  DownloadFileIcon,
  FileIcon,
  LinkIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from '../../icons'
import type { TreeNode, TStorage } from '../lib/types'
import { formatFileSize } from '../lib/utils'
import { getPreviewKind, type PreviewKind } from './previewType'
import { StreamedBadge } from './StreamedBadge'
import { usePresignedUrl } from './usePresignedUrl'
import { FilePreviewViewer } from './Viewer'

type PreviewStyle = 'quicklook' | 'overlay'

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
  const [style, setStyle] = useLocalStorage<PreviewStyle>('fileExplorer.previewStyle', 'quicklook')
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

  const goPrev = useCallback(() => {
    const prev = index > 0 ? siblings[index - 1] : undefined
    if (prev) {
      onNavigate(prev)
    }
  }, [index, siblings, onNavigate])
  const goNext = useCallback(() => {
    const next = index > -1 ? siblings[index + 1] : undefined
    if (next) {
      onNavigate(next)
    }
  }, [index, siblings, onNavigate])

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on file change
  useEffect(() => {
    setZoom(100)
  }, [node])

  useEffect(() => {
    if (!open) {
      return
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowRight') {
        goNext()
      } else if (e.key === 'ArrowLeft') {
        goPrev()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose, goNext, goPrev])

  if (!open || !node) {
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
          ? 'absolute inset-x-0 top-0 z-10 bg-linear-to-b from-black/80 to-transparent text-white'
          : 'shrink-0 border-b theme-border',
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <FileIcon className={cx('h-4 w-4 shrink-0', !floatingChrome && 'theme-muted-text')} />
        <span className="truncate font-semibold">{node.name}</span>
        {url && <StreamedBadge />}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <div
          className={cx(
            'mr-1 flex items-center rounded-lg p-0.5',
            floatingChrome ? 'bg-white/10' : 'theme-muted-panel',
          )}
        >
          <SegButton
            active={!isOverlay}
            overlayChrome={floatingChrome}
            onClick={() => setStyle('quicklook')}
          >
            {t.preview.quickLook}
          </SegButton>
          <SegButton
            active={isOverlay}
            overlayChrome={floatingChrome}
            onClick={() => setStyle('overlay')}
          >
            {t.preview.fullWindow}
          </SegButton>
        </div>
        <ChromeButton
          overlay={floatingChrome}
          label={t.preview.copyUri}
          onClick={() => onCopyUri(node)}
        >
          <LinkIcon className="h-4 w-4" />
        </ChromeButton>
        <ChromeButton
          overlay={floatingChrome}
          label={t.preview.download}
          onClick={() => onDownload(node)}
        >
          <DownloadFileIcon className="h-4 w-4" />
        </ChromeButton>
        <ChromeButton overlay={floatingChrome} label={t.preview.close} onClick={onClose}>
          <CloseIcon className="h-4 w-4" />
        </ChromeButton>
      </div>
    </div>
  )

  const footer = (
    <div
      className={cx(
        'flex items-center justify-between gap-4 px-4 py-2.5',
        floatingChrome
          ? 'absolute inset-x-0 bottom-0 z-10 bg-linear-to-t from-black/80 to-transparent text-white'
          : 'shrink-0 border-t theme-border',
      )}
    >
      <span className={cx('text-xs', !floatingChrome && 'theme-muted-text')}>
        {typeof node.size === 'number' && formatFileSize(node.size)}
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
            <MiniButton
              overlay={floatingChrome}
              label={t.preview.zoomOut}
              onClick={() => setZoom((z) => Math.max(25, z - 25))}
            >
              <ZoomOutIcon className="h-3.5 w-3.5" />
            </MiniButton>
            <span className="min-w-11 text-center text-xs tabular-nums">{zoom}%</span>
            <MiniButton
              overlay={floatingChrome}
              label={t.preview.zoomIn}
              onClick={() => setZoom((z) => Math.min(400, z + 25))}
            >
              <ZoomInIcon className="h-3.5 w-3.5" />
            </MiniButton>
          </div>
        )}
        <div className="flex items-center gap-1">
          <MiniButton
            overlay={floatingChrome}
            label={t.preview.previousFile}
            disabled={!hasPrev}
            onClick={goPrev}
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </MiniButton>
          <span className="min-w-14 text-center text-xs tabular-nums">
            {index >= 0 ? `${index + 1} / ${siblings.length}` : ''}
          </span>
          <MiniButton
            overlay={floatingChrome}
            label={t.preview.nextFile}
            disabled={!hasNext}
            onClick={goNext}
          >
            <ChevronRightIcon className="h-4 w-4" />
          </MiniButton>
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

  return createPortal(
    <div
      role="none"
      className="fixed inset-0 z-9995 flex items-center justify-center"
      style={{
        backgroundColor: isOverlay ? 'rgba(1,4,9,.94)' : 'rgba(1,4,9,.62)',
        backdropFilter: isOverlay ? undefined : 'blur(3px)',
        WebkitBackdropFilter: isOverlay ? undefined : 'blur(3px)',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose()
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
      <div
        role="dialog"
        aria-modal="true"
        aria-label={node.name}
        className={cx(
          'relative flex flex-col',
          isOverlay
            ? 'h-screen w-screen'
            : 'overflow-hidden rounded-2xl border theme-border shadow-2xl',
          floatingChrome ? 'bg-transparent' : 'bg-(--theme-panel-bg)',
        )}
        style={isOverlay ? undefined : { width: 'min(1120px, 94vw)', height: 'min(780px, 90vh)' }}
      >
        {topBar}
        {stage}
        {footer}
      </div>
    </div>,
    // Portal at the body: the theme tokens live on the document root.
    document.body,
  )
}

function SegButton({
  active,
  overlayChrome,
  onClick,
  children,
}: {
  active: boolean
  overlayChrome: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        'cursor-pointer whitespace-nowrap rounded-md px-2.5 py-1 text-[11.5px] font-medium transition-colors',
        active
          ? 'bg-(--theme-element) text-(--theme-element-text)'
          : overlayChrome
            ? 'text-white/70 hover:text-white'
            : 'theme-muted-text hover:theme-text',
      )}
    >
      {children}
    </button>
  )
}

function ChromeButton({
  overlay,
  label,
  onClick,
  children,
}: {
  overlay: boolean
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx(
        'flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg transition-colors',
        overlay
          ? 'text-white/90 hover:bg-white/15'
          : 'theme-muted-text hover:theme-hover hover:theme-text',
      )}
    >
      {children}
    </button>
  )
}

function MiniButton({
  overlay,
  label,
  onClick,
  disabled,
  children,
}: {
  overlay: boolean
  label: string
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'flex h-6 w-7 items-center justify-center rounded-md transition-colors',
        disabled
          ? 'cursor-not-allowed opacity-40'
          : cx('cursor-pointer', overlay ? 'hover:bg-white/15' : 'hover:theme-hover'),
      )}
    >
      {children}
    </button>
  )
}

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
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
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
