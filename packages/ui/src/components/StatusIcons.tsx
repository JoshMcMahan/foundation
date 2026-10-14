import { cx } from '../cx'
import { ErrorIcon, SuccessIcon } from '../icons'

interface IBaseCheckmarkProps {
  className?: string
  colored?: boolean
}

export function SuccessCheckmark({ className, colored = true }: IBaseCheckmarkProps) {
  return <SuccessIcon className={cx(colored && 'text-(--theme-success)', className)} />
}

export function ErrorCheckmark({ className, colored = true }: IBaseCheckmarkProps) {
  return <ErrorIcon className={cx(colored && 'text-(--theme-error)', className)} />
}
