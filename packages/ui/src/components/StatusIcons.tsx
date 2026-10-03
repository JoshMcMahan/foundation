import cx from 'classnames'
import type { IconBaseProps } from 'react-icons'
import { FaCircleNotch } from 'react-icons/fa'
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

export function LoaderIcon({ className, ...props }: IconBaseProps & { className?: string }) {
  return <FaCircleNotch className={cx('animate-spin', className)} {...props} />
}
