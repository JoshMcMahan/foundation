import { getPlaceholder } from '../utils/getPlaceholder'
import FormikCustomDropdown from './FormikCustomDropdown'

export default function DropdownWrapper({
  options,
  onChange,
  fieldObj,
  setFormDirty,
  invalid = false,
  loading = false,
  disabled = undefined,
  allowCustomValue = undefined,
  currentValue,
  setFieldValue,
  setFieldTouched,
}: {
  options: React.ComponentProps<typeof FormikCustomDropdown>['options']
  onChange?: ((val: string) => void) | undefined
  fieldObj: {
    name?: string | undefined
    label?: string | undefined
    disabled?: boolean | string | undefined
    placeholder?: string | undefined
    default?: unknown
    parentValue?: unknown
    secondaryField?: string | string[] | undefined
    resetOnChange?: string | boolean | undefined
    value?: string | undefined
    autoselect?: boolean | string | Record<string, unknown> | undefined
    allowCustomValue?: boolean | undefined
    customValueLabel?: string | undefined
  }
  setFormDirty: React.ComponentProps<typeof FormikCustomDropdown>['setFormDirty']
  invalid?: boolean
  loading?: boolean
  disabled?: boolean | undefined
  allowCustomValue?: boolean
  currentValue: unknown
  setFieldValue: React.ComponentProps<typeof FormikCustomDropdown>['setFieldValue']
  setFieldTouched: React.ComponentProps<typeof FormikCustomDropdown>['setFieldTouched']
}) {
  return (
    <FormikCustomDropdown
      invalid={invalid}
      className="w-full"
      onChange={onChange}
      loading={loading}
      setFormDirty={setFormDirty}
      options={options}
      disabled={disabled ?? Boolean(fieldObj.disabled)}
      placeholder={getPlaceholder(
        fieldObj.placeholder,
        typeof fieldObj.default === 'string' ? fieldObj.default : undefined,
      )}
      name={fieldObj.name ?? ''}
      ariaLabel={fieldObj.label}
      parentValue={fieldObj.parentValue}
      secondaryField={fieldObj.secondaryField}
      resetOnChange={fieldObj.resetOnChange}
      value={fieldObj.value}
      autoselect={fieldObj.autoselect === undefined ? undefined : Boolean(fieldObj.autoselect)}
      allowCustomValue={allowCustomValue ?? fieldObj.allowCustomValue}
      customValueLabel={fieldObj.customValueLabel}
      currentValue={currentValue}
      setFieldValue={setFieldValue}
      setFieldTouched={setFieldTouched}
    />
  )
}
