import { InfoTip } from '../../components/InfoTip'
import { useStrings } from '../../components/Provider'
import { toneSurface } from '../../components/tone'
import { cx } from '../../cx'
import { LockIcon } from '../../icons'

export function StreamedBadge() {
  const t = useStrings().fileExplorer
  return (
    <InfoTip
      text={t.preview.streamedTooltip}
      className={cx(
        'shrink-0 gap-1 rounded-full border px-2 py-0.5 text-[11px]',
        toneSurface.success,
      )}
    >
      <LockIcon className="h-2.5 w-2.5" />
      {t.preview.streamed}
    </InfoTip>
  )
}
