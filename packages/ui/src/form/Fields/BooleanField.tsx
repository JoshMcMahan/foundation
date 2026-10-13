import { Switch } from '../../components/Switch'
import { Tooltip } from '../../components/Tooltip'
import { FieldWrapper } from '../FieldWrapper'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
import { useFieldValue } from '../useFieldValue'
export interface IBooleanField extends BaseField {
  type: 'boolean'
  default?: boolean
  options?: {
    onOption?: boolean | string
    offOption?: boolean | string
  }
  disabled_message?: string
}

export default function BooleanField(props: FieldComponentProps<IBooleanField>) {
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
  // The form names every field before it renders one.
  const [value, change] = useFieldValue<boolean | string>(field.name ?? '')

  const handleChange = (val: string | boolean) => {
    if (disabled) {
      return
    }
    onChange?.(val)
    change(val)
  }

  // Custom options store strings such as "YES"; the switch maps them to on and off.
  const onOption = field.options ? String(field.options.onOption ?? true) : true
  const offOption = field.options ? String(field.options.offOption ?? false) : false
  const checked = value === true || value === 'true' || value === onOption

  return (
    <FieldWrapper
      // A boolean is always set, so the field is never missing a value.
      optional
      label={label}
      tooltipComponent={tooltipComponent}
      description={field.description}
      labelPosition={labelPosition}
      spaceCompact={spaceCompact}
    >
      {({ id, describedBy }) => (
        <Tooltip content={field.disabled_message} disabled={!disabled}>
          <Switch
            id={id}
            nativeButton
            render={<button type="button" />}
            checked={checked}
            onCheckedChange={(on) => handleChange(on ? onOption : offOption)}
            disabled={disabled}
            aria-describedby={describedBy}
            aria-invalid={missing || undefined}
          />
        </Tooltip>
      )}
    </FieldWrapper>
  )
}
