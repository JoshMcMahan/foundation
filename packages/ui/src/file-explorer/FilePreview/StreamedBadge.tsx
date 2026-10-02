import { useStrings } from '../../components/Provider'
import { TOOLTIP_ID } from '../../components/Tooltip'
import { LockIcon } from '../../icons'

export function StreamedBadge() {
  const t = useStrings().fileExplorer
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-green-500/40 bg-green-500/15 px-2 py-0.5 text-[11px] text-green-600"
      data-tooltip-id={TOOLTIP_ID}
      data-tooltip-content={t.preview.streamedTooltip}
    >
      <LockIcon className="h-2.5 w-2.5" />
      {t.preview.streamed}
    </span>
  )
}
