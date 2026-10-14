import { useCallback, useMemo, useState } from 'react'
import useSWRInfinite from 'swr/infinite'
import { EmptyState } from '../../components/EmptyState'
import { Loader } from '../../components/Loader'
import { useStrings } from '../../components/Provider'
import { RelativeTime } from '../../components/relativeTime'
import { toast } from '../../components/Toast'
import { Tooltip } from '../../components/Tooltip'
import { cx } from '../../cx'
import { formatBytes } from '../../format'
import { DownloadIcon, FileIcon, TrashIcon } from '../../icons'
import { safeUrl } from '../../safeUrl'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import { ATTACHMENTS_PAGE_SIZE, attachmentsPageKey } from './attachmentKeys'

export default function AttachmentManager() {
  const { adapter } = useChat()
  const t = useChatConfig().strings.attachmentManager
  const { common } = useStrings()
  const attachmentsAdapter = adapter.attachments

  const [deleting, setDeleting] = useState<string | null>(null)
  const [thumbnails, setThumbnails] = useState<Record<string, 'loaded' | 'broken'>>({})

  const markThumbnail = useCallback((attachmentId: string, state: 'loaded' | 'broken') => {
    setThumbnails((previous) =>
      previous[attachmentId] === state ? previous : { ...previous, [attachmentId]: state },
    )
  }, [])

  const {
    data: pages,
    size,
    setSize,
    isLoading,
    isValidating,
    mutate,
  } = useSWRInfinite(
    // The key loader stays `attachmentsPageKey` so the cache entry matches the
    // serialized key AttachmentUpload revalidates after an upload.
    attachmentsAdapter ? attachmentsPageKey : () => null,
    ([, cursor]: [string, string]) =>
      attachmentsAdapter?.list({ limit: ATTACHMENTS_PAGE_SIZE, cursor }),
  )

  const attachments = useMemo(
    () => pages?.flatMap((page) => page?.attachments ?? []) ?? [],
    [pages],
  )

  const handleDelete = useCallback(
    async (attachmentId: string) => {
      if (!attachmentsAdapter) {
        return
      }
      setDeleting(attachmentId)
      try {
        await attachmentsAdapter.remove(attachmentId)
        await mutate()
      } catch (error) {
        toast.error(error instanceof Error ? error.message : String(error))
      } finally {
        setDeleting(null)
      }
    },
    [attachmentsAdapter, mutate],
  )

  if (!attachmentsAdapter) {
    return null
  }

  const hasMore = pages?.[pages.length - 1]?.hasMore ?? false

  return (
    <div className="flex h-full bg-(--theme-app-bg)">
      <div className="flex-1 flex flex-col min-w-0">
        {/* Main content area */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl font-semibold mb-6 text-(--theme-app)">{t.title}</h1>

            {isLoading && attachments.length === 0 ? (
              <div className="py-12">
                <Loader size={32} />
              </div>
            ) : attachments.length === 0 ? (
              <EmptyState variant="bare" title={t.empty} />
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {attachments.map((att) => {
                    const downloadUrl = safeUrl(attachmentsAdapter.downloadUrl(att.id))
                    const name = att.filename || t.unnamedFile
                    const isDeleting = deleting === att.id
                    const thumbnail = thumbnails[att.id]
                    const showThumbnail =
                      att.contentType?.startsWith('image/') && thumbnail !== 'broken'
                    const preview = (
                      <>
                        <FileIcon aria-hidden="true" className="w-8 h-8 theme-muted-text" />
                        {showThumbnail && (
                          // Kept transparent until it decodes so a slow or missing
                          // file shows the placeholder, never a broken-image glyph.
                          <img
                            src={downloadUrl}
                            alt=""
                            className={cx(
                              'absolute inset-0 w-full h-full object-cover',
                              thumbnail !== 'loaded' && 'opacity-0',
                            )}
                            loading="lazy"
                            onLoad={() => markThumbnail(att.id, 'loaded')}
                            onError={() => markThumbnail(att.id, 'broken')}
                          />
                        )}
                      </>
                    )
                    const previewClasses =
                      'relative aspect-square w-full bg-(--theme-muted-panel-bg) flex items-center justify-center'

                    return (
                      <div
                        key={att.id}
                        className={cx(
                          'rounded-lg border theme-border overflow-hidden',
                          isDeleting && 'opacity-50 pointer-events-none',
                        )}
                      >
                        {attachmentsAdapter.onOpen ? (
                          <button
                            type="button"
                            onClick={() => attachmentsAdapter.onOpen?.(att)}
                            aria-label={t.open(name)}
                            className={cx(previewClasses, 'cursor-pointer')}
                          >
                            {preview}
                          </button>
                        ) : (
                          <div className={previewClasses}>{preview}</div>
                        )}
                        <div className="p-3 text-xs bg-(--theme-panel-bg) flex items-center justify-between gap-1">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-(--theme-app)">{name}</p>
                            <p className="truncate theme-muted-text">
                              {att.size ? formatBytes(att.size) : ''}
                              {att.uploadedAt && (
                                <>
                                  {att.size ? ' · ' : ''}
                                  <RelativeTime value={att.uploadedAt} />
                                </>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            <Tooltip content={common.download}>
                              <a
                                href={downloadUrl}
                                download={att.filename || true}
                                aria-label={t.download(name)}
                                className="p-1.5 rounded-lg hover:theme-hover theme-muted-text transition-colors"
                              >
                                <DownloadIcon aria-hidden="true" className="w-4 h-4" />
                              </a>
                            </Tooltip>
                            <Tooltip content={common.delete}>
                              <button
                                type="button"
                                onClick={() => handleDelete(att.id)}
                                disabled={isDeleting}
                                aria-label={t.remove(name)}
                                className="p-1.5 rounded-lg hover:bg-red-500/15 theme-muted-text hover:text-red-600 transition-colors"
                              >
                                <TrashIcon aria-hidden="true" className="w-4 h-4" />
                              </button>
                            </Tooltip>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {hasMore && (
                  <div className="flex justify-center mt-8">
                    <button
                      type="button"
                      onClick={() => setSize(size + 1)}
                      disabled={isValidating}
                      className="px-6 py-3 text-sm rounded-lg theme-muted-panel hover:theme-hover transition-colors disabled:opacity-50"
                    >
                      {isValidating ? common.loading : common.loadMore}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
