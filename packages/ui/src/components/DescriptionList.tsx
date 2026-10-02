import cx from 'classnames'
import React from 'react'
import { TooltipInfo } from './Tooltip'

interface IDescriptionListItemProps {
  label: string
  children: React.ReactNode
  tooltip?: string
  className?: string
}

export function DescriptionListItem({
  label,
  children,
  tooltip,
  className,
  ...props
}: IDescriptionListItemProps & React.ComponentPropsWithoutRef<'dd'>) {
  return (
    <>
      <dt className={cx('text-[13px] leading-6 col-span-1 font-normal flex gap-1', className)}>
        <span className="min-w-0 truncate">{label}</span>
        {tooltip && <TooltipInfo className="pr-2" text={tooltip} />}
      </dt>
      <dd
        {...props}
        className="flex text-[13px] leading-6 col-span-4 font-light items-center overflow-auto"
      >
        {children}
      </dd>
    </>
  )
}

export default function DescriptionList({
  children,
  title,
  separators = true,
  subtitle,
  className,
  wrapperClassName,
  vertical = false,
}: {
  children: React.ReactNode
  className?: string
  wrapperClassName?: string
  title?: string | React.ReactNode
  separators?: boolean
  subtitle?: string | React.ReactNode
  vertical?: boolean
}) {
  return (
    <div className={cx('w-full', wrapperClassName)}>
      {title && <h2 className="text-sm font-semibold w-full mb-1">{title}</h2>}
      {subtitle && <div className="max-w-2xl text-sm/6 w-full">{subtitle}</div>}
      <dl
        className={cx(
          'grid',
          separators && '*:not-last-of-type:border-b-1',
          vertical ? 'grid-cols-1' : 'grid-cols-5 gap-x-4 gap-y-0.5 *:pb-0.5',
          className,
        )}
      >
        {Array.isArray(children) ? React.Children.toArray(children) : children}
      </dl>
    </div>
  )
}
