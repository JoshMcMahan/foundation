import { cx } from '../cx'
import { AlertIcon, InfoIcon } from '../icons'
import { toneSurface } from './tone'

type CalloutType = 'warning' | 'info' | 'error'

function CalloutIcon({ type }: { type: CalloutType }) {
  if (type === 'warning' || type === 'error') {
    return <AlertIcon aria-hidden="true" className="mr-3 h-5 w-5 shrink-0" />
  } else {
    return <InfoIcon aria-hidden="true" className="mr-3 h-5 w-5 shrink-0" />
  }
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
