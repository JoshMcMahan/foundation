import cx from 'classnames'
import { Field } from 'formik'
import { FieldWrapper } from '../FieldWrapper'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
import { getPlaceholder } from '../utils/getPlaceholder'

export interface ITextAreaField extends BaseField {
  type: 'textarea'
  default?: string
  placeholder?: string
}

export default function TextAreaField(props: FieldComponentProps<ITextAreaField>) {
  const {
    field,
    label,
    labelPosition,
    missing,
    disabled,
    onChange,
    tooltipComponent,
    spaceCompact,
  } = props

  return (
    <FieldWrapper
      optional={field.optional}
      label={label}
      tooltipComponent={tooltipComponent}
      description={field.description}
      labelPosition={labelPosition}
      spaceCompact={spaceCompact}
    >
      {({ id, describedBy }) => (
        <Field
          className={cx(
            'theme-input h-[82px] w-full rounded leading-4 overflow-y-scroll',
            disabled && 'disabled',
            missing && 'border-red-600 focus:border-red-600 focus:ring-red-500',
          )}
          as="textarea"
          id={id}
          aria-describedby={describedBy}
          aria-required={field.optional ? undefined : true}
          key={field.name}
          name={field.name!}
          type="search"
          placeholder={getPlaceholder(field.placeholder, field.default)}
          disabled={disabled}
          {...(onChange && { onChange })}
        />
      )}
    </FieldWrapper>
  )
}
