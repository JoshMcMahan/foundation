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
        'absolute inset-0 z-50 flex items-center justify-center bg-(--theme-accent)/10 border-2 border-dashed border-(--theme-accent) backdrop-blur-sm pointer-events-none',
        className,
      )}
    >
      <div className="text-center">
        <p className="text-lg font-medium theme-text">{t.dropFilesHere}</p>
        <p className="text-sm theme-muted-text">{t.releaseToUpload}</p>
      </div>
    </div>
  )
}
