import { Field } from '../../components/Field'
import { Switch } from '../../components/Switch'
import { Tooltip } from '../../components/Tooltip'
import { fieldFrame } from '../fieldFrame'
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
  const { field, disabled, onChange } = props
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
  // Named options name the state beside the switch, in sentence case: "YES" reads "Yes".
  const stateName = (option: string | boolean) =>
    typeof option === 'string'
      ? option.charAt(0).toUpperCase() + option.slice(1).toLowerCase()
      : undefined

  return (
    // A boolean is always set, so the field never needs a value.
    <Field {...fieldFrame(props)} required={false}>
      {(control) => (
        <Tooltip content={field.disabled_message} disabled={!disabled}>
          <Switch
            {...control}
            nativeButton
            render={<button type="button" />}
            checked={checked}
            onCheckedChange={(on) => handleChange(on ? onOption : offOption)}
            onLabel={stateName(onOption)}
            offLabel={stateName(offOption)}
            disabled={disabled}
          />
        </Tooltip>
      )}
    </Field>
  )
}
