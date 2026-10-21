import { cx } from '../cx'
import { FailFilledIcon, SuccessFilledIcon } from '../icons'

interface IBaseCheckmarkProps {
  className?: string
  colored?: boolean
}

/** Something done: a solid disc in the success tone with a check cut out of it. */
export function SuccessCheckmark({ className, colored = true }: IBaseCheckmarkProps) {
  return <SuccessFilledIcon className={cx(colored && 'text-(--theme-success)', className)} />
}

/** Something failed: a solid disc in the error tone with an x cut out of it. */
export function ErrorCheckmark({ className, colored = true }: IBaseCheckmarkProps) {
  return <FailFilledIcon className={cx(colored && 'text-(--theme-error)', className)} />
}
