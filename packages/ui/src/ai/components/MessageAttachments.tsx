import type { MouseEvent, ReactNode } from 'react'
import { isPlainClick } from '../../components/AppLink'
import { cx } from '../../cx'
import { formatBytes } from '../../format'
import { DownloadIcon, FileIcon } from '../../icons'
import { safeUrl } from '../../safeUrl'
import { useChatConfig } from '../core/config'
import type { AttachmentRef } from '../types'

const chipClasses =
  'inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg bg-(--theme-muted-panel-bg)'

/** The files sent with a message. One the reader can download is a link to
 *  it, so it can be saved or opened in a new tab like any other; a host that
 *  previews attachments takes the plain click. */
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
  return (
    // Top-aligned: a chip beside a thumbnail keeps its own height.
    <div className={cx('mt-3 flex flex-wrap items-start gap-2', className)}>
      {attachments.map((att) => {
        const isImage = att.contentType?.startsWith('image/')
        const name = att.filename || (isImage ? t.unnamedImage : t.unnamedFile)
        const url = att.id && downloadUrl ? downloadUrl(att.id) : undefined
        // Only a URL that cannot run script becomes a link; an image still
        // shows from any URL the host gives, since loading one runs nothing.
        const href = safeUrl(url)
        const thumbnail = isImage && url
        const body: ReactNode = thumbnail ? (
          <img
            src={url}
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
              href={href}
              download={att.filename || true}
              onClick={
                onOpen &&
                ((e: MouseEvent) => {
                  if (isPlainClick(e)) {
                    e.preventDefault()
                    onOpen(att)
                  }
                })
              }
              className={className}
            >
              {body}
            </a>
          )
        }
        if (onOpen) {
          return (
            <button
              key={att.id}
              type="button"
              onClick={() => onOpen(att)}
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
    </div>
  )
}
