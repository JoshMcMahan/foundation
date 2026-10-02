import cx from 'classnames'
import { AlertIcon, InfoIcon } from '../icons'

type CalloutType = 'warning' | 'info' | 'error'

function CalloutIcon({ type }: { type: CalloutType }) {
  if (type === 'warning' || type === 'error') {
    return <AlertIcon className="h-6 w-6 mr-4 text-lg" />
  } else {
    return <InfoIcon className="h-6 w-6 mr-4 text-lg" />
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
      className={cx(
        className,
        type === 'warning' && 'bg-orange-100 border-orange-500 text-orange-700',
        type === 'error' && 'bg-red-100 border-red-500 text-red-700',
        type === 'info' && 'bg-blue-100 border-blue-500 text-blue-700',
        'border-t-4 rounded-b px-4 py-3 shadow-md my-4',
      )}
      role="alert"
    >
      <div className="flex">
        <div className="py-1">
          <CalloutIcon type={type} />
        </div>
        <div>{children}</div>
      </div>
    </div>
  )
}
