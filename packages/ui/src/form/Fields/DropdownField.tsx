import { useMemo } from 'react'
import { Autocomplete, Combobox, type ComboboxItems } from '../../components/Combobox'
import { Field } from '../../components/Field'
import { fieldFrame } from '../fieldFrame'
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

export default function DropdownField(props: FieldComponentProps<IDropdownField>) {
  const { field, disabled, onChange } = props
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
    <Field {...fieldFrame(props)}>
      {(control) =>
        field.allowCustomValue ? (
          <Autocomplete
            {...control}
            disabled={disabled}
            placeholder={placeholder}
            items={items as ComboboxItems<string>}
            value={value == null ? '' : String(value)}
            onValueChange={choose}
          />
        ) : (
          <Combobox<unknown>
            {...control}
            disabled={disabled}
            placeholder={placeholder}
            items={items}
            value={value ?? null}
            onValueChange={choose}
          />
        )
      }
    </Field>
  )
}
