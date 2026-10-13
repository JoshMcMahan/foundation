import { useMemo } from 'react'
import { Autocomplete, Combobox, type ComboboxItems } from '../../components/Combobox'
import { FieldWrapper } from '../FieldWrapper'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
import { useChoiceField } from '../useChoiceField'
import { useDependentOptions } from '../utils/dependentOptions'
import { type FieldOption, toFieldItems } from '../utils/fieldItems'
import { getPlaceholder } from '../utils/getPlaceholder'

export interface IDropdownField extends BaseField {
  type: 'dropdown'
  dropdownType?: string
  options: FieldOption[] | Record<string, FieldOption[]>
  parentValue?: string
  autoselect?: boolean
  allowCustomValue?: boolean
  placeholder?: string
}

export default function DropdownField({
  field,
  label,
  labelPosition,
  missing,
  disabled,
  onChange,
  tooltipComponent,
  spaceCompact,
}: FieldComponentProps<IDropdownField>) {
  const { options } = useDependentOptions(field.options, field.depends_on)
  const items = useMemo(() => toFieldItems(options), [options])
  const [value, choose] = useChoiceField({
    // The form names every field before it renders one.
    name: field.name ?? '',
    items,
    autoselect: field.autoselect,
    // A dropdown sets one other field; a list of them names the first.
    secondaryField: Array.isArray(field.secondaryField)
      ? field.secondaryField[0]
      : field.secondaryField,
    onChange,
  })
  const placeholder = getPlaceholder(
    field.placeholder,
    typeof field.default === 'string' ? field.default : undefined,
  )

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
        <div className="grow min-w-0">
          {field.allowCustomValue ? (
            <Autocomplete
              id={id}
              aria-describedby={describedBy}
              aria-label={label}
              aria-invalid={missing}
              required={!field.optional}
              disabled={disabled}
              className="w-full"
              placeholder={placeholder}
              items={items as ComboboxItems<string>}
              value={value == null ? '' : String(value)}
              onValueChange={choose}
            />
          ) : (
            <Combobox<unknown>
              id={id}
              aria-describedby={describedBy}
              aria-label={label}
              aria-invalid={missing}
              required={!field.optional}
              disabled={disabled}
              className="w-full"
              placeholder={placeholder}
              items={items}
              value={value ?? null}
              onValueChange={choose}
            />
          )}
        </div>
      )}
    </FieldWrapper>
  )
}
