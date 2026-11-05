import { type KeyboardEvent, type MouseEvent, useLayoutEffect, useRef } from 'react'
import { cx } from '../cx'
import { ZoomInIcon, ZoomOutIcon } from '../icons'
import { IconButton } from './IconButton'
import { useStrings } from './Provider'

/** The zoom at which a picture fits its stage. */
export const ZOOM_FIT = 100
const ZOOM_STEP = 25
const ZOOM_MIN = 25
const ZOOM_MAX = 400

export const zoomIn = (zoom: number) => Math.min(ZOOM_MAX, zoom + ZOOM_STEP)
export const zoomOut = (zoom: number) => Math.max(ZOOM_MIN, zoom - ZOOM_STEP)

/** The zoom a key asks for: + or = zooms in, - out, and 0 back to fit. Undefined for any
 *  other key, or one with a modifier, which belongs to the browser's own page zoom. */
export function zoomForKey(event: KeyboardEvent, zoom: number): number | undefined {
  if (event.metaKey || event.ctrlKey || event.altKey) {
    return undefined
  }
  switch (event.key) {
    case '+':
    case '=':
      return zoomIn(zoom)
    case '-':
      return zoomOut(zoom)
    case '0':
      return ZOOM_FIT
    default:
      return undefined
  }
}

/** A picture on a stage that fills its box. At `ZOOM_FIT` it shrinks to fit and is never
 *  drawn past its own size; zoomed, it takes that share of the stage's width and the
 *  stage scrolls. */
export function ImageStage({
  src,
  alt,
  zoom = ZOOM_FIT,
  className,
  imageClassName,
  onError,
  onClick,
}: {
  src: string
  alt: string
  zoom?: number | undefined
  /** On the stage. */
  className?: string | undefined
  /** On the picture. */
  imageClassName?: string | undefined
  onError?: (() => void) | undefined
  /** A click on the stage, beside the picture: a viewer's backdrop. */
  onClick?: ((event: MouseEvent<HTMLDivElement>) => void) | undefined
}) {
  const fit = zoom === ZOOM_FIT
  const stage = useRef<HTMLDivElement | null>(null)
  // The point of the picture at the middle of the view, as shares of its scroll size, so
  // a zoom keeps looking at the same spot instead of jumping to the corner.
  const center = useRef({ x: 0.5, y: 0.5 })
  const keepCenter = () => {
    const el = stage.current
    if (el && el.scrollWidth > 0 && el.scrollHeight > 0) {
      center.current = {
        x: (el.scrollLeft + el.clientWidth / 2) / el.scrollWidth,
        y: (el.scrollTop + el.clientHeight / 2) / el.scrollHeight,
      }
    }
  }
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per zoom change
  useLayoutEffect(() => {
    const el = stage.current
    if (!el) {
      return
    }
    if (fit) {
      center.current = { x: 0.5, y: 0.5 }
      return
    }
    el.scrollLeft = center.current.x * el.scrollWidth - el.clientWidth / 2
    el.scrollTop = center.current.y * el.scrollHeight - el.clientHeight / 2
  }, [zoom])
  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: a click beside the picture is a backdrop's, which Escape stands in for
    // biome-ignore lint/a11y/noStaticElementInteractions: the stage only forwards a backdrop click
    <div
      ref={stage}
      onScroll={keepCenter}
      // Safe centering: plain center would put a zoomed picture's start edges out of the
      // scroll's reach.
      className={cx(
        'flex h-full w-full items-center-safe justify-center-safe overflow-auto',
        className,
      )}
      onClick={
        onClick &&
        ((event) => {
          if (event.target === event.currentTarget) {
            onClick(event)
          }
        })
      }
    >
      <img
        src={src}
        alt={alt}
        // shrink-0, or the stage's flex would squeeze a zoomed picture back to its own width.
        className={cx('block shrink-0', fit && 'object-contain', imageClassName)}
        style={
          fit ? { maxWidth: '100%', maxHeight: '100%' } : { width: `${zoom}%`, maxWidth: 'none' }
        }
        onError={onError}
      />
    </div>
  )
}

/** Zoom out, the zoom as a percentage, and zoom in, for an `ImageStage`. */
export function ZoomControls({
  zoom,
  onZoomChange,
  className = 'theme-muted-panel',
}: {
  zoom: number
  onZoomChange: (zoom: number) => void
  /** On the group, for its surface. */
  className?: string | undefined
}) {
  const { common } = useStrings()
  return (
    <div className={cx('flex items-center gap-1 rounded-lg p-0.5', className)}>
      <IconButton
        size="xs"
        label={common.zoomOut}
        onClick={() => onZoomChange(zoomOut(zoom))}
        icon={<ZoomOutIcon />}
      />
      <span className="min-w-11 text-center text-xs tabular-nums">{zoom}%</span>
      <IconButton
        size="xs"
        label={common.zoomIn}
        onClick={() => onZoomChange(zoomIn(zoom))}
        icon={<ZoomInIcon />}
      />
    </div>
  )
}
