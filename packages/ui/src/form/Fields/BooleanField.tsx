import { useField, useFormikContext } from 'formik'
import Switch from '../../components/SwitchToggle'
import { FieldWrapper } from '../FieldWrapper'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
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
    setFormDirty,
  } = props
  // The form names every field before it renders one.
  const fieldName = field.name ?? ''

  const [fieldState] = useField<boolean | string>(fieldName)
  const { setFieldValue, setFieldTouched } = useFormikContext()

  const handleChange = (val: string | boolean) => {
    if (disabled) {
      return
    }
    onChange?.(val)
    setFieldTouched(fieldName, true)
    setFieldValue(fieldName, val)
    setFormDirty(true)
  }

  const value = fieldState.value

  // Convert options to expected format
  const options = field.options
    ? {
        onOption: String(field.options.onOption ?? true),
        offOption: String(field.options.offOption ?? false),
      }
    : undefined

  // Option strings like "YES" are stored values (e.g. a config file's Default=YES) and
  // can't be reworded; only their display is title-cased to match other toggles.
  const displayLabel = (option: string) =>
    option.charAt(0).toUpperCase() + option.slice(1).toLowerCase()

  return (
    <FieldWrapper
      // We always mark this as optional, since a boolean field is either true or false
      optional
      label={label}
      tooltipComponent={<div>{tooltipComponent}</div>}
      description={field.description}
      labelPosition={labelPosition}
      spaceCompact={spaceCompact}
    >
      {({ id, describedBy }) =>
        options ? (
          <Switch
            id={id}
            aria-describedby={describedBy}
            onChange={(on) => handleChange(on ? options.onOption : options.offOption)}
            value={value === true || value === options.onOption}
            yesLabel={displayLabel(options.onOption)}
            noLabel={displayLabel(options.offOption)}
            disabled={disabled}
            invalid={missing}
          />
        ) : (
          <Switch
            id={id}
            aria-describedby={describedBy}
            datatip={field.disabled_message}
            onChange={handleChange}
            value={value === true || value === 'true'}
            disabled={disabled}
            invalid={missing}
          />
        )
      }
    </FieldWrapper>
  )
}
