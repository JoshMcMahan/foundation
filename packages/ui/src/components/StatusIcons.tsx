import { cx } from '../cx'
import { ErrorIcon, SuccessIcon } from '../icons'

interface IBaseCheckmarkProps {
  className?: string
  colored?: boolean
}

export function SuccessCheckmark({ className, colored = true }: IBaseCheckmarkProps) {
  return <SuccessIcon className={cx(colored && 'text-green-500', className)} />
}

export function ErrorCheckmark({ className, colored = true }: IBaseCheckmarkProps) {
  return <ErrorIcon className={cx(colored && 'text-red-400', className)} />
}
