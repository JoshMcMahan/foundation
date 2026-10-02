import { FieldWrapper } from '../FieldWrapper'
import { FormikCustomDropdown } from '../SpecialTypes'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
import { getPlaceholder } from '../utils/getPlaceholder'

export interface IDropdownField extends BaseField {
  type: 'dropdown'
  dropdownType?: string
  options:
    | Array<{
        label: string
        value: string
        secondaryLabel?: string
        description?: string
      }>
    | Record<
        string,
        Array<{
          label: string
          value: string
          secondaryLabel?: string
          description?: string
        }>
      >
  parentValue?: string
  resetOnChange?: boolean
  autoselect?: boolean
  allowCustomValue?: boolean
  customValueLabel?: string
  placeholder?: string
}

export default function DropdownField(props: FieldComponentProps<IDropdownField, string>) {
  const {
    field,
    label,
    labelPosition,
    missing,
    disabled,
    onChange,
    tooltipComponent,
    spaceCompact,
    setFieldValue,
    setFieldTouched,
    currentValue,
  } = props
  let parentValue = field.parentValue
  let options = (Array.isArray(field.options) && field.options) || []
  if (field.depends_on) {
    parentValue = field.depends_on
    if (!Array.isArray(field.options)) {
      options = field.options[parentValue] ?? []
    }
  }

  // Handle secondaryField - if it's an array, join with comma or pass first one
  const secondaryField = Array.isArray(field.secondaryField)
    ? field.secondaryField[0]
    : field.secondaryField

  return (
    <FieldWrapper
      optional={field.optional}
      label={label}
      tooltipComponent={tooltipComponent}
      description={field.description}
      labelPosition={labelPosition}
      spaceCompact={spaceCompact}
    >
      <div className="grow min-w-0">
        <FormikCustomDropdown
          invalid={missing}
          className="w-full"
          key={field.name}
          name={field.name!}
          ariaLabel={label}
          options={options}
          setFormDirty={props.setFormDirty}
          parentValue={parentValue}
          onChange={onChange}
          secondaryField={secondaryField}
          disabled={disabled}
          resetOnChange={field.resetOnChange ? field.name! : ''}
          loading={false}
          autoselect={field.autoselect}
          allowCustomValue={field.allowCustomValue}
          customValueLabel={field.customValueLabel}
          placeholder={getPlaceholder(
            field.placeholder,
            typeof field.default === 'string' ? field.default : undefined,
          )}
          currentValue={currentValue}
          setFieldValue={setFieldValue!}
          setFieldTouched={setFieldTouched!}
        />
      </div>
    </FieldWrapper>
  )
}
