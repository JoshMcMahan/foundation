import { type KeyboardEvent, type MouseEvent, useEffect, useRef, useState } from 'react'
import { IconButton } from '../../components/IconButton'
import { ImageStage, ZOOM_FIT, ZoomControls, zoomForKey } from '../../components/ImageStage'
import { Modal } from '../../components/Modal'
import { useStrings } from '../../components/Provider'
import { useClosingValue } from '../../components/useClosingValue'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, DownloadIcon } from '../../icons'
import { useChatConfig } from '../core/config'
import type { AttachmentRef } from '../types'

/** An image a message carries, as the viewer shows it. */
export interface ViewableImage {
  attachment: AttachmentRef
  name: string
  /** What the thumbnail shows: the preview, or the file itself. */
  src: string
  /** The file itself, loaded in place of the preview once it arrives. */
  fullUrl?: string | undefined
  /** The file as a link, only when following it cannot run script. */
  href?: string | undefined
}

/** The full image once it has loaded, and the preview until then or if it fails,
 *  so the viewer never shows a broken picture over one it already had. */
function useLoadedImage(preview: string, full: string | undefined): string {
  const [loaded, setLoaded] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!full || full === preview) {
      return
    }
    let current = true
    const image = new Image()
    image.onload = () => {
      if (current) {
        setLoaded(full)
      }
    }
    image.src = full
    return () => {
      current = false
      image.onload = null
    }
  }, [preview, full])
  return full && loaded === full ? full : preview
}

/** A message's images, one at a time, at their own size or smaller to fit the window. */
export default function AttachmentImageViewer({
  images,
  index,
  onIndexChange,
  onClose,
  returnFocusTo,
}: {
  images: ViewableImage[]
  /** The image shown, or null while the viewer is closed. */
  index: number | null
  onIndexChange: (index: number) => void
  onClose: () => void
  /** The thumbnail focus goes back to on close. */
  returnFocusTo: (index: number) => HTMLElement | null | undefined
}) {
  const shown = useClosingValue(index)
  const image = shown === undefined ? undefined : images[shown]
  const t = useChatConfig().strings.attachmentManager
  const { common } = useStrings()
  const src = useLoadedImage(image?.src ?? '', image?.fullUrl)
  const popup = useRef<HTMLDivElement | null>(null)
  const several = images.length > 1
  // Held against the image it was set for, so stepping starts at fit and closing keeps it
  // while the viewer fades; opening again starts at fit.
  const [zoomed, setZoomed] = useState<{ index: number; zoom: number } | null>(null)
  const [wasOpen, setWasOpen] = useState(index !== null)
  if (wasOpen !== (index !== null)) {
    setWasOpen(index !== null)
    if (index !== null) {
      setZoomed(null)
    }
  }
  const zoom = zoomed && zoomed.index === shown ? zoomed.zoom : ZOOM_FIT
  const setZoom = (next: number) => {
    if (index !== null) {
      setZoomed({ index, zoom: next })
    }
  }
  // From the open index, not the closing one, so a key pressed while it fades out can't reopen it.
  const step = (by: number) => {
    if (index !== null && several) {
      onIndexChange((index + by + images.length) % images.length)
    }
  }
  const onKeyDown = (event: KeyboardEvent) => {
    const nextZoom = zoomForKey(event, zoom)
    if (nextZoom !== undefined) {
      event.preventDefault()
      setZoom(nextZoom)
      return
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
      return
    }
    const rtl = getComputedStyle(event.currentTarget).direction === 'rtl'
    step((event.key === 'ArrowRight') !== rtl ? 1 : -1)
  }
  // The popup fills the window, so the empty room beside the bar is the backdrop's.
  const closeOnSelf = (event: MouseEvent) => {
    if (event.target === event.currentTarget) {
      onClose()
    }
  }
  return (
    <Modal
      ref={popup}
      open={index !== null}
      onClose={onClose}
      align="center"
      panel={false}
      aria-label={image?.name}
      backdropClassName="bg-[rgba(1,4,9,.94)]"
      // Focus starts on the dialog, not its first button, where Enter would step away from the picture.
      initialFocus={popup}
      finalFocus={() => (shown === undefined ? true : (returnFocusTo(shown) ?? true))}
      onKeyDown={onKeyDown}
      onClick={closeOnSelf}
      className="flex h-full w-full min-w-0 flex-col gap-2"
    >
      {image && (
        <>
          <div className="mx-auto flex w-full max-w-xl min-w-0 shrink-0 items-center gap-1 rounded-lg border border-(--theme-border) bg-(--theme-panel-bg) p-1 text-(--theme-app) shadow-lg">
            <span aria-live="polite" className="min-w-0 flex-1 truncate px-2 text-sm">
              {image.name}
            </span>
            {several && (
              <>
                <IconButton
                  icon={<ChevronLeftIcon className="rtl:rotate-180" />}
                  label={t.previousImage}
                  onClick={() => step(-1)}
                />
                <span className="text-xs tabular-nums text-(--theme-muted-text-color)">
                  {t.imagePosition((shown ?? 0) + 1, images.length)}
                </span>
                <IconButton
                  icon={<ChevronRightIcon className="rtl:rotate-180" />}
                  label={t.nextImage}
                  onClick={() => step(1)}
                />
              </>
            )}
            <ZoomControls zoom={zoom} onZoomChange={setZoom} />
            {image.href && (
              <IconButton
                href={image.href}
                reloadDocument
                download={image.attachment.filename || true}
                icon={<DownloadIcon />}
                label={t.download(image.name)}
              />
            )}
            <IconButton icon={<CloseIcon />} label={common.close} onClick={onClose} />
          </div>
          {/* Keyed by image, so stepping never shows the last one's picture under the next one's name. */}
          <ImageStage
            key={shown}
            src={src}
            alt={image.name}
            zoom={zoom}
            className="min-h-0 flex-1"
            onClick={onClose}
          />
        </>
      )}
    </Modal>
  )
}
