import { type MouseEvent, type ReactNode, useRef, useState } from 'react'
import { isPlainClick } from '../../components/AppLink'
import { cx } from '../../cx'
import { formatBytes } from '../../format'
import { DownloadIcon, FileIcon } from '../../icons'
import { safeUrl } from '../../safeUrl'
import { useChatConfig } from '../core/config'
import type { AttachmentRef } from '../types'
import AttachmentImageViewer, { type ViewableImage } from './AttachmentImageViewer'

const chipClasses =
  'inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-(--theme-muted-panel-bg)'

/** The files sent with a message. One the reader can download is a link to
 *  it, so it can be saved or opened in a new tab like any other; a host that
 *  previews attachments takes the plain click, and without one a picture opens
 *  larger in the page. */
export default function MessageAttachments({
  attachments,
  downloadUrl,
  onOpen,
  className,
}: {
  attachments: AttachmentRef[]
  downloadUrl?: ((id: string) => string) | undefined
  onOpen?: ((attachment: AttachmentRef) => void) | undefined
  className?: string | undefined
}) {
  const t = useChatConfig().strings.attachmentManager
  const [viewing, setViewing] = useState<number | null>(null)
  const thumbnails = useRef(new Map<number, HTMLElement>())
  // Without a host viewer, the message's pictures open in the page's own.
  const images: ViewableImage[] = []
  const items = attachments.map((att) => {
    const isImage = att.contentType?.startsWith('image/')
    const name = att.filename || (isImage ? t.unnamedImage : t.unnamedFile)
    const url = att.id && downloadUrl ? downloadUrl(att.id) : undefined
    // Only a URL that cannot run script becomes a link; an image still
    // shows from any URL the host gives, since loading one runs nothing.
    // The preview is only ever an image's source, so a data: URL suits it.
    const href = safeUrl(url)
    const src = isImage ? att.previewUrl || url : undefined
    const viewer =
      src && !onOpen ? images.push({ attachment: att, name, src, fullUrl: url, href }) - 1 : -1
    return { att, name, href, src, viewer }
  })
  return (
    // Top-aligned: a chip beside a thumbnail keeps its own height.
    <div className={cx('mt-3 flex flex-wrap items-start gap-2', className)}>
      {items.map(({ att, name, href, src, viewer }) => {
        const thumbnail = Boolean(src)
        const open = onOpen ? () => onOpen(att) : viewer >= 0 ? () => setViewing(viewer) : undefined
        const keepThumbnail = (element: HTMLElement | null) => {
          if (viewer < 0) {
            return
          }
          if (element) {
            thumbnails.current.set(viewer, element)
          } else {
            thumbnails.current.delete(viewer)
          }
        }
        const body: ReactNode = thumbnail ? (
          <img
            src={src}
            alt={name}
            className="max-h-[200px] max-w-[200px] object-cover"
            loading="lazy"
          />
        ) : (
          <>
            <FileIcon aria-hidden="true" className="h-3.5 w-3.5 flex-shrink-0" />
            <span className="max-w-[150px] truncate">{name}</span>
            {att.size ? <span className="theme-muted-text">({formatBytes(att.size)})</span> : null}
            {href && <DownloadIcon aria-hidden="true" className="h-3 w-3 flex-shrink-0" />}
          </>
        )
        const className = thumbnail
          ? 'block overflow-hidden rounded-lg border theme-border'
          : cx(
              chipClasses,
              !href && 'theme-muted-text',
              (href || onOpen) && 'transition-colors hover:theme-hover',
            )

        if (href) {
          return (
            <a
              key={att.id}
              ref={keepThumbnail}
              href={href}
              download={att.filename || true}
              onClick={(e: MouseEvent) => {
                if (open && isPlainClick(e)) {
                  e.preventDefault()
                  open()
                }
              }}
              className={className}
            >
              {body}
            </a>
          )
        }
        if (open) {
          return (
            <button
              key={att.id}
              ref={keepThumbnail}
              type="button"
              onClick={open}
              aria-label={thumbnail ? undefined : t.open(name)}
              className={className}
            >
              {body}
            </button>
          )
        }
        return (
          <span key={att.id} className={className}>
            {body}
          </span>
        )
      })}
      {images.length > 0 && (
        <AttachmentImageViewer
          images={images}
          index={viewing !== null && viewing < images.length ? viewing : null}
          onIndexChange={setViewing}
          onClose={() => setViewing(null)}
          returnFocusTo={(index) => thumbnails.current.get(index)}
        />
      )}
    </div>
  )
}
