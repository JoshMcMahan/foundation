import { cx } from '../../cx'
import { useChatConfig } from '../core/config'

interface DragOverlayProps {
  className?: string
}

export default function DragOverlay({ className }: DragOverlayProps) {
  const t = useChatConfig().strings.attachmentUpload
  return (
    <div
      className={cx(
        'absolute inset-0 z-50 flex items-center justify-center bg-blue-500/10 border-2 border-dashed border-blue-500 backdrop-blur-sm pointer-events-none',
        className,
      )}
    >
      <div className="text-center">
        <p className="text-lg font-medium text-blue-600">{t.dropFilesHere}</p>
        <p className="text-sm text-blue-500/80">{t.releaseToUpload}</p>
      </div>
    </div>
  )
}
