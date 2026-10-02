import cx from 'classnames'

interface DragOverlayProps {
  className?: string
}

export default function DragOverlay({ className }: DragOverlayProps) {
  return (
    <div
      className={cx(
        'absolute inset-0 z-50 flex items-center justify-center bg-blue-500/10 border-2 border-dashed border-blue-500 backdrop-blur-sm pointer-events-none',
        className,
      )}
    >
      <div className="text-center">
        <p className="text-lg font-medium text-blue-600">Drop files here</p>
        <p className="text-sm text-blue-500/80">Release to upload</p>
      </div>
    </div>
  )
}
