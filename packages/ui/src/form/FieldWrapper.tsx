import cx from 'classnames'
import type React from 'react'
import { useId, useMemo } from 'react'
import { RequiredMark } from '../components/RequiredMark'
import { FieldProvider } from './fieldContext'
import { resolvedFlag } from './lib'
import type { FieldFlag } from './types/fieldTypes'

export interface FieldLabelBinding {
  id: string
  labelId: string
  describedBy: string | undefined
}

export function FieldWrapper({
  label,
  tooltipComponent,
  description,
  labelPosition = 'left',
  spaceCompact = false,
  optional = false,
  children,
}: {
  label: string
  tooltipComponent?: React.ReactNode
  description?: string | undefined
  labelPosition?: 'left' | 'top' | undefined
  spaceCompact?: boolean | undefined
  optional?: FieldFlag | undefined
  children: React.ReactNode | ((binding: FieldLabelBinding) => React.ReactNode)
}) {
  const isOptional = Boolean(resolvedFlag(optional))
  const uid = useId()
  const id = `${uid}control`
  const labelId = `${uid}label`
  const descriptionId = description ? `${uid}description` : undefined

  const field = useMemo(
    () => ({ required: !isOptional, id, labelId, descriptionId }),
    [isOptional, id, labelId, descriptionId],
  )

  return (
    <div
      className={cx(
        'flex w-full',
        labelPosition === 'left' ? 'items-start' : 'items-left flex-col',
      )}
    >
      <label
        htmlFor={id}
        id={labelId}
        className={cx(
          'relative',
          labelPosition === 'left' ? 'form-label' : 'form-label-top',
          spaceCompact && 'form-label-compact',
        )}
      >
        {label}
        {!isOptional && <RequiredMark />}
        {tooltipComponent}
      </label>
      <div className="w-full">
        <FieldProvider value={field}>
          {typeof children === 'function'
            ? children({ id, labelId, describedBy: descriptionId })
            : children}
        </FieldProvider>
        {description && (
          <div id={descriptionId} className="text-xs theme-muted-text mt-1 leading-relaxed">
            {description}
          </div>
        )}
      </div>
    </div>
  )
}
