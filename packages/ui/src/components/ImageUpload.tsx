import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useRef,
  useState,
} from 'react'
import { cx } from '../cx'
import { EditIcon, TrashIcon } from '../icons'
import { ActionMenu } from './ActionMenu'
import { Button } from './Button'
import { buttonClasses } from './buttonClasses'
import { Modal } from './Modal'
import { useStrings } from './Provider'
import { Slider } from './Slider'

/** The side of the saved square, large enough to stay crisp on a high-density screen. */
export const IMAGE_UPLOAD_SIZE = 512

const accept = 'image/png,image/jpeg,image/gif,image/webp,image/svg+xml'
const maxZoom = 5
const THIRDS = ['33.333%', '66.667%']
// The shadow keeps the line visible on a light picture as well as a dark one.
const GRID_LINE = 'absolute bg-white/70 shadow-[0_0_1px_rgb(0_0_0/0.6)]'
/** The crop square in the dialog, in CSS pixels. */
const frame = 320

export interface ImageUploadProps {
  /** The current image; without one the tile shows `name`'s first letter. */
  src?: string | undefined
  /** What the image stands for, such as a team: it names the controls and gives the letter. */
  name: string
  /** Saves the cropped square, a PNG `IMAGE_UPLOAD_SIZE` pixels on a side. A rejection
   *  keeps the dialog open with its message. */
  onUpload: (image: Blob) => Promise<void>
  /** Removes the image; without it there is no Remove item. */
  onRemove?: (() => Promise<void> | void) | undefined
  disabled?: boolean | undefined
  /** The tile's side in CSS pixels. */
  size?: number | undefined
  className?: string | undefined
}

/** An icon a person uploads for something, such as a workspace or a project: a square
 *  tile with a menu to upload, crop and save an image, or remove it. An image can also be
 *  dropped on the tile. */
export function ImageUpload({
  src,
  name,
  onUpload,
  onRemove,
  disabled = false,
  size = 64,
  className,
}: ImageUploadProps) {
  const { imageUpload: t } = useStrings()
  const input = useRef<HTMLInputElement>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  // The image that failed to load, so a new one is tried again.
  const [broken, setBroken] = useState<string>()

  // A data: URL rather than a blob: one, which a strict Content-Security-Policy's
  // img-src often leaves out.
  const pick = (file: File | undefined) => {
    if (!file || !accept.split(',').includes(file.type)) return
    const reader = new FileReader()
    reader.onload = () => typeof reader.result === 'string' && setPicked(reader.result)
    reader.readAsDataURL(file)
  }
  const onFile = (e: ChangeEvent<HTMLInputElement>) => {
    pick(e.currentTarget.files?.[0])
    e.currentTarget.value = ''
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (!disabled) pick(e.dataTransfer.files[0])
  }
  const shown = src && src !== broken
  return (
    <div className={cx('flex items-center gap-3', className)}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: a drop target for the pointer; the menu beside it uploads too */}
      <div
        onDragOver={(e) => {
          if (disabled) return
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        style={{ width: size, height: size }}
        className={cx(
          'flex shrink-0 items-center justify-center overflow-hidden rounded-lg border theme-border bg-(--theme-muted-panel-bg)',
          dragging && 'outline-2 outline-offset-2 outline-(--theme-accent)',
        )}
      >
        {shown ? (
          <img src={src} alt="" onError={() => setBroken(src)} className="size-full object-cover" />
        ) : (
          <span
            aria-hidden
            style={{ fontSize: size * 0.42 }}
            className="font-semibold text-(--theme-muted-text-color) uppercase"
          >
            {[...name.trim()][0] ?? ''}
          </span>
        )}
      </div>
      {!disabled && (
        <ActionMenu
          label={t.change(name)}
          triggerClassName={buttonClasses({ variant: 'outline', size: 'sm' })}
          items={[
            {
              icon: <EditIcon />,
              label: shown ? t.replace : t.upload,
              onClick: () => input.current?.click(),
            },
            ...(onRemove && shown
              ? [
                  {
                    icon: <TrashIcon />,
                    label: t.remove,
                    destructive: true,
                    onClick: () => void onRemove(),
                  },
                ]
              : []),
          ]}
        >
          {t.edit}
        </ActionMenu>
      )}
      <input ref={input} type="file" accept={accept} onChange={onFile} hidden />
      {picked && (
        <CropDialog image={picked} name={name} onSave={onUpload} onClose={() => setPicked(null)} />
      )}
    </div>
  )
}

interface Point {
  x: number
  y: number
}

/** Crops `image` to a square: drag to move it, zoom with the slider, the wheel or
 *  the keyboard, then save. */
function CropDialog({
  image,
  name,
  onSave,
  onClose,
}: {
  image: string
  name: string
  onSave: (image: Blob) => Promise<void>
  onClose: () => void
}) {
  const { imageUpload: t, common } = useStrings()
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState<Point>({ x: 0, y: 0 })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const drag = useRef<{ start: Point; from: Point } | null>(null)

  useEffect(() => {
    const el = new Image()
    el.onload = () => setImg(el)
    el.onerror = () => setError(t.unreadable)
    el.src = image
  }, [image, t.unreadable])

  // The image covers the square at zoom 1, by its shorter side.
  const base = img ? frame / Math.min(img.naturalWidth, img.naturalHeight) : 1
  const scale = base * zoom
  const w = (img?.naturalWidth ?? 0) * scale
  const h = (img?.naturalHeight ?? 0) * scale
  const clamp = (p: Point, s = scale): Point => {
    const mx = Math.max(0, ((img?.naturalWidth ?? 0) * s - frame) / 2)
    const my = Math.max(0, ((img?.naturalHeight ?? 0) * s - frame) / 2)
    return { x: Math.min(mx, Math.max(-mx, p.x)), y: Math.min(my, Math.max(-my, p.y)) }
  }
  const zoomTo = (z: number) => {
    const next = Math.min(maxZoom, Math.max(1, z))
    setZoom(next)
    setOffset((o) => clamp({ x: (o.x * next) / zoom, y: (o.y * next) / zoom }, base * next))
  }

  const onPointerDown = (e: PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { start: { x: e.clientX, y: e.clientY }, from: offset }
  }
  const onPointerMove = (e: PointerEvent) => {
    const d = drag.current
    if (!d) return
    setOffset(clamp({ x: d.from.x + e.clientX - d.start.x, y: d.from.y + e.clientY - d.start.y }))
  }
  const onKeyDown = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 40 : 10
    const moves: Record<string, Point> = {
      ArrowLeft: { x: step, y: 0 },
      ArrowRight: { x: -step, y: 0 },
      ArrowUp: { x: 0, y: step },
      ArrowDown: { x: 0, y: -step },
    }
    const m = moves[e.key]
    if (m) {
      e.preventDefault()
      setOffset((o) => clamp({ x: o.x + m.x, y: o.y + m.y }))
    } else if (e.key === '+' || e.key === '=') zoomTo(zoom + 0.25)
    else if (e.key === '-') zoomTo(zoom - 0.25)
  }

  const save = async () => {
    if (!img) return
    setSaving(true)
    setError(null)
    try {
      // The square's top-left corner in the image's own pixels.
      const side = frame / scale
      const sx = (img.naturalWidth - side) / 2 - offset.x / scale
      const sy = (img.naturalHeight - side) / 2 - offset.y / scale
      await onSave(await squarePNG(img, sx, sy, side))
      onClose()
    } catch (err) {
      setError(err instanceof Error && err.message ? err.message : t.failed)
      setSaving(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      dismissible={!saving}
      title={t.cropTitle(name)}
      description={t.cropHint}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            {common.cancel}
          </Button>
          <Button variant="primary" onClick={() => void save()} loading={saving} disabled={!img}>
            {t.save}
          </Button>
        </>
      }
    >
      <div className="flex flex-col items-center gap-4">
        <div
          role="application"
          aria-label={t.cropArea}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: arrow keys move the image
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
          onWheel={(e) => zoomTo(zoom - e.deltaY / 400)}
          onKeyDown={onKeyDown}
          style={{ width: frame, height: frame }}
          className="relative max-w-full cursor-grab touch-none overflow-hidden rounded-lg bg-(--theme-muted-panel-bg) select-none active:cursor-grabbing"
        >
          {img && (
            <img
              src={image}
              alt=""
              draggable={false}
              style={{
                width: w,
                height: h,
                left: (frame - w) / 2 + offset.x,
                top: (frame - h) / 2 + offset.y,
              }}
              className="pointer-events-none absolute max-w-none"
            />
          )}
          {img && (
            <div aria-hidden="true" className="pointer-events-none absolute inset-0">
              {THIRDS.map((at) => (
                <div
                  key={`x${at}`}
                  style={{ left: at }}
                  className={cx(GRID_LINE, 'inset-y-0 w-px')}
                />
              ))}
              {THIRDS.map((at) => (
                <div
                  key={`y${at}`}
                  style={{ top: at }}
                  className={cx(GRID_LINE, 'inset-x-0 h-px')}
                />
              ))}
            </div>
          )}
        </div>
        <Slider
          value={zoom}
          onValueChange={zoomTo}
          min={1}
          max={maxZoom}
          step={0.05}
          aria-label={t.zoom}
          className="w-64 max-w-full"
        />
        {error && (
          <p role="alert" className="text-sm text-(--theme-error)">
            {error}
          </p>
        )}
      </div>
    </Modal>
  )
}

/** The square of `img` at (sx, sy) with side `side`, as a PNG `IMAGE_UPLOAD_SIZE` on a
 *  side. Transparent margins are trimmed and what's left is centered, so a logo with
 *  empty space around it fills the square without being stretched. */
async function squarePNG(img: HTMLImageElement, sx: number, sy: number, side: number) {
  const n = IMAGE_UPLOAD_SIZE
  const probe = document.createElement('canvas')
  probe.width = n
  probe.height = n
  const ctx = probe.getContext('2d')
  if (!ctx) throw new Error('')
  ctx.drawImage(img, sx, sy, side, side, 0, 0, n, n)
  const { data } = ctx.getImageData(0, 0, n, n)
  let minX = n
  let minY = n
  let maxX = -1
  let maxY = -1
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if ((data[(y * n + x) * 4 + 3] ?? 0) > 0) {
        minX = Math.min(minX, x)
        maxX = Math.max(maxX, x)
        minY = Math.min(minY, y)
        maxY = Math.max(maxY, y)
      }
    }
  }
  let out = probe
  const opaque = minX === 0 && minY === 0 && maxX === n - 1 && maxY === n - 1
  if (!opaque && maxX >= minX) {
    const tw = maxX + 1 - minX
    const th = maxY + 1 - minY
    const s = n / Math.max(tw, th)
    out = document.createElement('canvas')
    out.width = n
    out.height = n
    out
      .getContext('2d')
      ?.drawImage(probe, minX, minY, tw, th, (n - tw * s) / 2, (n - th * s) / 2, tw * s, th * s)
  }
  return new Promise<Blob>((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error(''))), 'image/png'),
  )
}
