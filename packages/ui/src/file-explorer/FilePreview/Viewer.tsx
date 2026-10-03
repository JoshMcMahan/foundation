import cx from 'classnames'
import { lazy, Suspense, useCallback, useMemo, useState } from 'react'
import { positionKeys, withPositionKeys } from '../../components/keys'
import Loader from '../../components/Loader'
import Markdown from '../../components/Markdown'
import { useStrings } from '../../components/Provider'
import { DownloadFileIcon, FileIcon, LockIcon, MusicIcon, ZipIcon } from '../../icons'
import { type CorsAwareRefresh, CorsIssuePreview } from '../helpers'
import type { TreeNode, TStorage } from '../lib/types'
import { formatFileSize } from '../lib/utils'
import { joinSource, type NotebookOutput, parseDelimited, parseNotebook, stripAnsi } from './parse'
import {
  CODE_PREVIEW_MAX_BYTES,
  CODE_PREVIEW_MAX_LINES,
  CSV_PREVIEW_MAX_ROWS,
  getFileExtension,
  getMonacoLanguage,
  PDF_PREVIEW_MAX_BYTES,
  type PreviewKind,
  TABULAR_PREVIEW_MAX_BYTES,
} from './previewType'
import { countLines } from './readCappedBytes'
import { useObjectBlobUrl } from './useObjectBlobUrl'
import { useObjectText } from './useObjectText'

// Monaco is heavy; load it only when a code file is actually previewed.
const CodePreviewEditor = lazy(() => import('./CodePreviewEditor'))

// Streamdown's table/mermaid fullscreen overlays portal to <body> at z-50, which
// renders behind the preview modal (z-9995). Disable them for previews.
const PREVIEW_MARKDOWN_CONTROLS = {
  table: { fullscreen: false },
  mermaid: { fullscreen: false },
}

interface FilePreviewViewerProps {
  node: TreeNode
  kind: PreviewKind
  url: string | null
  urlLoading: boolean
  urlError: string | null
  /** Image zoom percentage; 100 fits the stage. */
  zoom?: number
  onDownload?: (() => void) | undefined
  storage?: TStorage | null
}

export function FilePreviewViewer({
  node,
  kind,
  url,
  urlLoading,
  urlError,
  zoom = 100,
  onDownload,
  storage = null,
}: FilePreviewViewerProps) {
  const t = useStrings().fileExplorer
  const [reloadNonce, setReloadNonce] = useState(0)
  const onCorsRetry = useCallback<CorsAwareRefresh>(
    async (opts) => {
      if (opts?.silent) {
        if (!url) {
          return { corsError: true }
        }
        try {
          // This probes a signed preview URL outside the product API.
          const res = await fetch(url)
          res.body?.cancel().catch(() => {})
          return { corsError: false }
        } catch {
          return { corsError: true }
        }
      }
      setReloadNonce((n) => n + 1)
      return { corsError: false }
    },
    [url],
  )

  if (urlError) {
    return (
      <NotPreviewable
        icon={<FileIcon className="h-9 w-9 theme-muted-text" />}
        title={t.preview.errorTitle}
        message={urlError}
        onDownload={onDownload}
      />
    )
  }

  if (kind === 'archive') {
    return (
      <NotPreviewable
        icon={<ZipIcon className="h-9 w-9 text-(--theme-link)" />}
        title={t.preview.archiveTitle}
        message={t.preview.archiveMessage}
        onDownload={onDownload}
      />
    )
  }

  if (kind === 'unsupported') {
    return (
      <NotPreviewable
        icon={<FileIcon className="h-9 w-9 theme-muted-text" />}
        title={t.preview.unsupportedTitle}
        message={t.preview.unsupportedMessage}
        onDownload={onDownload}
      />
    )
  }

  if (urlLoading || !url) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <Loader size={40} text={t.preview.loading} />
      </div>
    )
  }

  switch (kind) {
    case 'image':
      return <ImageView node={node} url={url} zoom={zoom} onDownload={onDownload} />
    case 'video':
      return <VideoView node={node} url={url} onDownload={onDownload} />
    case 'audio':
      return <AudioView node={node} url={url} onDownload={onDownload} />
    case 'pdf':
      return (
        <PdfView
          key={reloadNonce}
          node={node}
          url={url}
          onDownload={onDownload}
          storage={storage}
          onCorsRetry={onCorsRetry}
        />
      )
    case 'code':
      return (
        <CodeView
          key={reloadNonce}
          node={node}
          url={url}
          onDownload={onDownload}
          storage={storage}
          onCorsRetry={onCorsRetry}
        />
      )
    case 'csv':
      return (
        <CsvView
          key={reloadNonce}
          node={node}
          url={url}
          onDownload={onDownload}
          storage={storage}
          onCorsRetry={onCorsRetry}
        />
      )
    case 'notebook':
      return (
        <NotebookView
          key={reloadNonce}
          node={node}
          url={url}
          onDownload={onDownload}
          storage={storage}
          onCorsRetry={onCorsRetry}
        />
      )
    default:
      return null
  }
}

function ImageView({
  node,
  url,
  zoom,
  onDownload,
}: {
  node: TreeNode
  url: string
  zoom: number
  onDownload?: (() => void) | undefined
}) {
  const [hasError, setHasError] = useState(false)
  if (hasError) {
    return <PreviewError onDownload={onDownload} />
  }
  const fit = zoom === 100
  return (
    <div className="flex h-full w-full items-center justify-center overflow-auto bg-(--theme-app-bg) p-4">
      <img
        src={url}
        alt={node.name}
        className={cx('block rounded-md shadow-lg', fit && 'object-contain')}
        style={
          fit ? { maxWidth: '100%', maxHeight: '100%' } : { width: `${zoom}%`, maxWidth: 'none' }
        }
        onError={() => setHasError(true)}
      />
    </div>
  )
}

function VideoView({
  node,
  url,
  onDownload,
}: {
  node: TreeNode
  url: string
  onDownload?: (() => void) | undefined
}) {
  const [hasError, setHasError] = useState(false)
  if (hasError) {
    return <PreviewError onDownload={onDownload} />
  }
  return (
    <div className="h-full w-full bg-black">
      {/** biome-ignore lint/a11y/useMediaCaption: user content has no caption track */}
      <video
        src={url}
        controls
        className="h-full w-full object-contain"
        aria-label={node.name}
        onError={() => setHasError(true)}
      />
    </div>
  )
}

function AudioView({
  node,
  url,
  onDownload,
}: {
  node: TreeNode
  url: string
  onDownload?: (() => void) | undefined
}) {
  const [hasError, setHasError] = useState(false)
  if (hasError) {
    return <PreviewError onDownload={onDownload} />
  }
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="flex w-full max-w-xl flex-col items-center gap-6">
        <div className="flex h-28 w-28 items-center justify-center rounded-2xl bg-linear-to-br from-(--theme-element) to-(--theme-link) shadow-lg">
          <MusicIcon className="h-12 w-12 text-white" />
        </div>
        <div className="text-center">
          <div className="break-all font-medium">{node.name}</div>
          <div className="mt-0.5 text-xs theme-muted-text">
            {node.contentType}
            {typeof node.size === 'number' && ` · ${formatFileSize(node.size)}`}
          </div>
        </div>
        {/** biome-ignore lint/a11y/useMediaCaption: user content has no caption track */}
        <audio
          src={url}
          controls
          className="w-full"
          aria-label={node.name}
          onError={() => setHasError(true)}
        />
      </div>
    </div>
  )
}

// Shared fallback for media load errors and fetch failures (e.g. a CORS-blocked object).
function PreviewError({ onDownload }: { onDownload?: (() => void) | undefined }) {
  const t = useStrings().fileExplorer
  return (
    <NotPreviewable
      icon={<FileIcon className="h-9 w-9 theme-muted-text" />}
      title={t.preview.errorTitle}
      message={t.preview.previewError}
      onDownload={onDownload}
    />
  )
}

interface FetchViewProps {
  node: TreeNode
  url: string
  onDownload?: (() => void) | undefined
  storage: TStorage | null
  onCorsRetry: CorsAwareRefresh
}

function PdfView({ node, url, onDownload, storage, onCorsRetry }: FetchViewProps) {
  const { blobUrl, loading, error, tooLarge, corsError } = useObjectBlobUrl(url, {
    enabled: true,
    maxBytes: PDF_PREVIEW_MAX_BYTES,
    knownSize: node.size,
    mimeType: 'application/pdf',
    cacheKey: node.path,
  })

  return (
    <PreviewFetchState
      loading={loading}
      tooLarge={tooLarge}
      error={error}
      corsError={corsError}
      storage={storage}
      onCorsRetry={onCorsRetry}
      onDownload={onDownload}
    >
      {blobUrl ? (
        <iframe
          src={blobUrl}
          title={node.name}
          className="h-full w-full border-0 bg-(--theme-app-bg)"
        />
      ) : null}
    </PreviewFetchState>
  )
}

function CodeView({ node, url, onDownload, storage, onCorsRetry }: FetchViewProps) {
  const t = useStrings().fileExplorer
  const language = getMonacoLanguage(node)
  const [tail, setTail] = useState(false)
  const { text, loading, error, tooLarge, truncated, corsError } = useObjectText(url, {
    enabled: true,
    maxBytes: CODE_PREVIEW_MAX_BYTES,
    maxLines: CODE_PREVIEW_MAX_LINES,
    knownSize: node.size,
    cacheKey: node.path,
    tail,
  })
  const shownLines = useMemo(() => countLines(text ?? ''), [text])
  // The toggle outlives truncation so tail mode is escapable on a file that turns
  // out to fit; the count only appears when something was actually left out.
  const canToggle = truncated || tail

  return (
    <div className="flex h-full w-full flex-col bg-(--theme-app-bg)">
      <div className="flex shrink-0 items-center gap-2 border-b theme-border px-3.5 py-2">
        <span className="truncate font-mono text-xs theme-muted-text">{node.name}</span>
        <span className="flex-1" />
        {truncated && text !== null && (
          <span className="shrink-0 font-mono text-[11px] theme-muted-text">
            {tail ? t.preview.lastLines(shownLines) : t.preview.firstLines(shownLines)}
          </span>
        )}
        {canToggle && (
          <div className="inline-flex shrink-0 overflow-hidden rounded-full border theme-border text-[11px]">
            <button
              type="button"
              className={cx(
                'cursor-pointer px-2 py-0.5',
                tail ? 'theme-muted-text theme-hover' : 'theme-element',
              )}
              onClick={() => setTail(false)}
            >
              {t.preview.head}
            </button>
            <button
              type="button"
              className={cx(
                'cursor-pointer px-2 py-0.5',
                tail ? 'theme-element' : 'theme-muted-text theme-hover',
              )}
              onClick={() => setTail(true)}
            >
              {t.preview.tail}
            </button>
          </div>
        )}
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border theme-border px-2 py-0.5 text-[11px] theme-muted-text">
          <LockIcon className="h-2.5 w-2.5" />
          {t.readOnly}
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <PreviewFetchState
          loading={loading}
          tooLarge={tooLarge}
          error={error}
          corsError={corsError}
          storage={storage}
          onCorsRetry={onCorsRetry}
          onDownload={onDownload}
        >
          {language === 'markdown' ? (
            <div className="h-full overflow-auto px-5 py-4">
              <Markdown controls={PREVIEW_MARKDOWN_CONTROLS}>{text ?? ''}</Markdown>
            </div>
          ) : (
            <Suspense fallback={<PreviewLoading />}>
              <CodePreviewEditor value={text ?? ''} language={language} />
            </Suspense>
          )}
        </PreviewFetchState>
      </div>
    </div>
  )
}

/** Wrap code in a fenced block for the markdown renderer, using a fence long
 * enough to survive backtick runs inside the content. */
function toFencedCode(text: string, language: string): string {
  const longestRun = (text.match(/`+/g) ?? []).reduce((max, run) => Math.max(max, run.length), 0)
  const fence = '`'.repeat(Math.max(3, longestRun + 1))
  return `${fence}${language}\n${text}\n${fence}`
}

function CsvView({ node, url, onDownload, storage, onCorsRetry }: FetchViewProps) {
  const { text, loading, error, tooLarge, corsError } = useObjectText(url, {
    enabled: true,
    maxBytes: TABULAR_PREVIEW_MAX_BYTES,
    maxLines: CSV_PREVIEW_MAX_ROWS + 2,
    knownSize: node.size,
    cacheKey: node.path,
  })

  return (
    <PreviewFetchState
      loading={loading}
      tooLarge={tooLarge}
      error={error}
      corsError={corsError}
      storage={storage}
      onCorsRetry={onCorsRetry}
      onDownload={onDownload}
    >
      <CsvTable node={node} text={text ?? ''} />
    </PreviewFetchState>
  )
}

function CsvTable({ node, text }: { node: TreeNode; text: string }) {
  const t = useStrings().fileExplorer
  const delimiter = getFileExtension(node.name) === 'tsv' ? '\t' : ','
  const rows = parseDelimited(text, delimiter, CSV_PREVIEW_MAX_ROWS + 2)
  const header = rows[0] ?? []
  const body = rows.slice(1)
  const shown = body.slice(0, CSV_PREVIEW_MAX_ROWS)
  const truncated = body.length > CSV_PREVIEW_MAX_ROWS
  const columnCount = Math.max(header.length, ...shown.map((r) => r.length))

  return (
    <div className="flex h-full w-full flex-col bg-(--theme-app-bg)">
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse font-mono text-xs">
          <thead>
            <tr className="sticky top-0 bg-(--theme-panel-bg)">
              <th className="w-11 border-b theme-border px-3.5 py-2 text-right font-semibold theme-muted-text">
                #
              </th>
              {positionKeys(columnCount, 'column').map((key, i) => (
                <th key={key} className="border-b theme-border px-3.5 py-2 text-left font-semibold">
                  {header[i] ?? ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {withPositionKeys(shown, 'row').map(({ key, item: row }, r) => (
              <tr key={key} className={cx(r % 2 === 1 && 'bg-(--theme-panel-bg)/50')}>
                <td className="px-3.5 py-1.5 text-right theme-muted-text">{r + 1}</td>
                {positionKeys(columnCount, 'cell').map((cellKey, c) => (
                  <td key={cellKey} className="px-3.5 py-1.5">
                    {row[c] ?? ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="shrink-0 border-t theme-border px-3.5 py-1.5 font-mono text-[11px] theme-muted-text">
        {truncated
          ? t.preview.csvFirstRows(shown.length, columnCount)
          : t.preview.csvRows(body.length, columnCount)}
      </div>
    </div>
  )
}

function NotebookView({ node, url, onDownload, storage, onCorsRetry }: FetchViewProps) {
  const { text, loading, error, tooLarge, corsError } = useObjectText(url, {
    enabled: true,
    maxBytes: TABULAR_PREVIEW_MAX_BYTES,
    knownSize: node.size,
    cacheKey: node.path,
  })

  return (
    <PreviewFetchState
      loading={loading}
      tooLarge={tooLarge}
      error={error}
      corsError={corsError}
      storage={storage}
      onCorsRetry={onCorsRetry}
      onDownload={onDownload}
    >
      <NotebookBody text={text ?? ''} onDownload={onDownload} />
    </PreviewFetchState>
  )
}

function NotebookBody({
  text,
  onDownload,
}: {
  text: string
  onDownload?: (() => void) | undefined
}) {
  const t = useStrings().fileExplorer
  const notebook = parseNotebook(text)
  if (!notebook) {
    return <InlineError message={t.preview.notebookParseError} onDownload={onDownload} />
  }

  return (
    <div className="h-full w-full overflow-auto bg-(--theme-app-bg) p-4">
      <div className="mx-auto flex max-w-4xl flex-col gap-3">
        {withPositionKeys(notebook.cells, 'cell').map(({ key, item: cell }) => {
          const source = joinSource(cell.source)
          if (cell.cell_type === 'markdown') {
            return (
              <div key={key} className="rounded-lg border theme-border px-4 py-3">
                <Markdown controls={PREVIEW_MARKDOWN_CONTROLS}>{source}</Markdown>
              </div>
            )
          }
          if (cell.cell_type === 'code') {
            return (
              <div key={key} className="flex gap-2">
                <span className="w-14 shrink-0 pt-3 font-mono text-[11px] theme-muted-text">
                  {typeof cell.execution_count === 'number'
                    ? `In [${cell.execution_count}]:`
                    : 'In [ ]:'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="rounded-lg border theme-border px-1 py-1 text-xs">
                    <Markdown>{toFencedCode(source, 'python')}</Markdown>
                  </div>
                  {withPositionKeys(cell.outputs ?? [], 'output').map(
                    ({ key: outputKey, item: output }) => (
                      <NotebookOutputView key={outputKey} output={output} />
                    ),
                  )}
                </div>
              </div>
            )
          }
          return null
        })}
      </div>
    </div>
  )
}

function NotebookOutputView({ output }: { output: NotebookOutput }) {
  const t = useStrings().fileExplorer
  const [imgError, setImgError] = useState(false)
  const png = output.data?.['image/png']
  if ((typeof png === 'string' || Array.isArray(png)) && !imgError) {
    return (
      <div className="mt-2 rounded-lg bg-white p-3">
        <img
          src={`data:image/png;base64,${joinSource(png as string | string[])}`}
          alt={t.preview.notebookOutput}
          className="max-w-full"
          onError={() => setImgError(true)}
        />
      </div>
    )
  }

  if (output.output_type === 'stream') {
    return (
      <pre className="mt-2 overflow-auto rounded-lg bg-(--theme-panel-bg) px-3 py-2 font-mono text-[11px] theme-muted-text">
        {joinSource(output.text)}
      </pre>
    )
  }

  if (output.output_type === 'error') {
    return (
      <pre className="mt-2 overflow-auto rounded-lg bg-red-500/15 px-3 py-2 font-mono text-[11px] text-red-500">
        {stripAnsi((output.traceback ?? []).join('\n'))}
      </pre>
    )
  }

  const plain = output.data?.['text/plain']
  if (plain !== undefined) {
    return (
      <pre className="mt-2 overflow-auto rounded-lg bg-(--theme-panel-bg) px-3 py-2 font-mono text-[11px]">
        {joinSource(plain as string | string[])}
      </pre>
    )
  }

  return null
}

function PreviewLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader size={36} />
    </div>
  )
}

function PreviewFetchState({
  loading,
  tooLarge,
  error,
  corsError,
  storage,
  onCorsRetry,
  onDownload,
  children,
}: {
  loading: boolean
  tooLarge: boolean
  error: string | null
  corsError: boolean
  storage: TStorage | null
  onCorsRetry: CorsAwareRefresh
  onDownload?: (() => void) | undefined
  children: React.ReactNode
}) {
  if (loading) {
    return <PreviewLoading />
  }
  if (corsError) {
    return (
      <div className="flex h-full w-full items-center justify-center p-6">
        <CorsIssuePreview selectedStorage={storage} onRefresh={onCorsRetry} />
      </div>
    )
  }
  if (tooLarge) {
    return <TooLargeInline onDownload={onDownload} />
  }
  if (error) {
    return <PreviewError onDownload={onDownload} />
  }
  return <>{children}</>
}

function NotPreviewable({
  icon,
  title,
  message,
  onDownload,
}: {
  icon: React.ReactNode
  title: string
  message: string
  onDownload?: (() => void) | undefined
}) {
  const t = useStrings().fileExplorer
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="flex h-18 w-18 items-center justify-center rounded-2xl theme-muted-panel">
          {icon}
        </div>
        <div>
          <div className="font-semibold">{title}</div>
          <div className="mt-1 text-sm theme-muted-text">{message}</div>
        </div>
        {onDownload && (
          <button type="button" className="btn btn-info cursor-pointer" onClick={onDownload}>
            <DownloadFileIcon className="mr-2 h-4 w-4" />
            {t.preview.downloadInstead}
          </button>
        )}
      </div>
    </div>
  )
}

function TooLargeInline({ onDownload }: { onDownload?: (() => void) | undefined }) {
  const t = useStrings().fileExplorer
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <div className="text-sm theme-muted-text">{t.preview.tooLarge}</div>
        {onDownload && (
          <button type="button" className="btn btn-info cursor-pointer" onClick={onDownload}>
            <DownloadFileIcon className="mr-2 h-4 w-4" />
            {t.preview.downloadInstead}
          </button>
        )}
      </div>
    </div>
  )
}

function InlineError({
  message,
  onDownload,
}: {
  message: string
  onDownload?: (() => void) | undefined
}) {
  const t = useStrings().fileExplorer
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="flex max-w-md flex-col items-center gap-3 text-center">
        <div className="text-sm theme-muted-text">{message}</div>
        {onDownload && (
          <button type="button" className="btn btn-neutral cursor-pointer" onClick={onDownload}>
            <DownloadFileIcon className="mr-2 h-4 w-4" />
            {t.preview.downloadInstead}
          </button>
        )}
      </div>
    </div>
  )
}
