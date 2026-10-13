import { InfoTip } from '../../components/InfoTip'
import { useStrings } from '../../components/Provider'
import { LockIcon } from '../../icons'

export function StreamedBadge() {
  const t = useStrings().fileExplorer
  return (
    <InfoTip
      text={t.preview.streamedTooltip}
      className="shrink-0 gap-1 rounded-full border border-green-500/40 bg-green-500/15 px-2 py-0.5 text-[11px] text-green-600"
    >
      <LockIcon className="h-2.5 w-2.5" />
      {t.preview.streamed}
    </InfoTip>
  )
}
