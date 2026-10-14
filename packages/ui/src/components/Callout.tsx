import { cx } from '../cx'
import { InfoIcon, WarningIcon } from '../icons'
import { toneIcon, toneSurface } from './tone'

type CalloutType = 'warning' | 'info' | 'error'

function CalloutIcon({ type }: { type: CalloutType }) {
  const Icon = type === 'info' ? InfoIcon : WarningIcon
  return <Icon aria-hidden="true" className={cx('mr-3 h-5 w-5 shrink-0', toneIcon[type])} />
}

export default function Callout({
  type,
  className = '',
  children,
}: {
  type: CalloutType
  className?: string
  children: React.ReactNode
}) {
  return (
    <div
      className={cx(toneSurface[type], 'my-4 rounded-xl border px-4 py-3', className)}
      role={type === 'info' ? 'note' : 'alert'}
    >
      <div className="flex text-sm">
        <CalloutIcon type={type} />
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
