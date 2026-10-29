import { Button } from '../../components/Button'
import { useStrings } from '../../components/Provider'
import { formatBytes } from '../../format'
import { ExpandIcon } from '../../icons'
import type { TreeNode, TStorage } from '../lib/types'
import { exceededTransferLimit } from '../lib/utils'
import { getPreviewKind } from './previewType'
import { StreamedBadge } from './StreamedBadge'
import { usePresignedUrl } from './usePresignedUrl'
import { FilePreviewViewer } from './Viewer'

interface FilePreviewInlineProps {
  node: TreeNode
  storage: TStorage | null
  getPresignedUrl: (node: TreeNode) => Promise<[string | null, Error | null]>
  onOpenFull: (node: TreeNode) => void
  onDownload: (node: TreeNode) => void
  /** When false, skip fetching and release any held preview blob. */
  active?: boolean
}

export function FilePreviewInline({
  node,
  storage,
  getPresignedUrl,
  onOpenFull,
  onDownload,
  active = true,
}: FilePreviewInlineProps) {
  const t = useStrings().fileExplorer
  const { url, loading, error } = usePresignedUrl(node, getPresignedUrl, {
    enabled: active,
    linkErrorMessage: t.preview.linkError,
  })
  const kind = getPreviewKind(node)

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        <FilePreviewViewer
          key={node.path}
          node={node}
          kind={kind}
          url={url}
          urlLoading={loading}
          urlError={error}
          storage={storage}
          onDownload={
            exceededTransferLimit(node, storage) === undefined ? () => onDownload(node) : undefined
          }
        />
      </div>
      <div className="flex shrink-0 items-center justify-between gap-3 border-t theme-border px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs theme-muted-text">
          <span>
            {typeof node.size === 'number' && formatBytes(node.size)}
            {node.contentType && ` · ${node.contentType}`}
          </span>
          {url && <StreamedBadge />}
        </div>
        <Button
          variant="secondary"
          size="sm"
          icon={<ExpandIcon />}
          onClick={() => onOpenFull(node)}
        >
          {t.preview.openFullPreview}
        </Button>
      </div>
    </div>
  )
}
