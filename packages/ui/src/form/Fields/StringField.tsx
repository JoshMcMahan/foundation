import { memo } from 'react'
import { FieldWrapper } from '../FieldWrapper'
import { FormikCustomInput } from '../SpecialTypes'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
import { getPlaceholder } from '../utils/getPlaceholder'

export interface IStringField extends BaseField {
  type: 'string' | 'password'
  default?: string
  placeholder?: string
  lowercase?: boolean
  minLength?: number
  maxLength?: number
  min?: number
  max?: number
  step?: number
  sanitize?: string // regex pattern for sanitization
  prefillDefault?: boolean // if true, prefill the default value
}

export default memo(function StringField(props: FieldComponentProps<IStringField, string>) {
  const {
    field,
    label,
    labelPosition,
    missing,
    disabled,
    onChange,
    tooltipComponent,
    spaceCompact,
    currentValue,
  } = props

  // Form-level DynamicDefaultsSync writes resolved defaults into Formik state.
  // For non-prefillDefault strings, fall through to FormikCustomInput's defaultValue/placeholder.
  const value = field.prefillDefault ? currentValue : undefined

  return (
    <FieldWrapper
      optional={field.optional}
      label={label}
      tooltipComponent={tooltipComponent}
      description={field.description}
      labelPosition={labelPosition}
      spaceCompact={spaceCompact}
    >
      <FormikCustomInput
        invalid={missing}
        key={field.name}
        name={field.name!}
        type={field.type}
        lowercase={field.lowercase}
        placeholder={
          field.type === 'password' && field.placeholder === undefined
            ? '•'.repeat((field.default ?? '').toString().length > 0 ? 16 : 0)
            : getPlaceholder(field.placeholder, field.default)
        }
        disabled={disabled}
        step={field.step}
        min={field.min}
        max={field.max}
        minLength={field.minLength}
        maxLength={field.maxLength}
        sanitize={field.sanitize}
        defaultValue={field.default}
        value={value}
        {...(onChange && { onChange })}
      />
    </FieldWrapper>
  )
})
