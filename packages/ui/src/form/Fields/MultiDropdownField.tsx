import { useEffect, useMemo } from 'react'
import { Combobox } from '../../components/Combobox'
import { Field } from '../../components/Field'
import { fieldFrame } from '../fieldFrame'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
import { useFieldValue } from '../useFieldValue'
import { usePrevious } from '../usePrevious'
import { useDependentOptions } from '../utils/dependentOptions'
import { type FieldOption, toFieldItems } from '../utils/fieldItems'

type MultiDropdownValue = string | boolean | number
type MultiDropdownOption = FieldOption<MultiDropdownValue>

export interface IMultiDropdownField extends BaseField {
  type: 'multi-dropdown'
  options: MultiDropdownOption[] | Record<string, MultiDropdownOption[]>
  parentValue?: string | boolean | number
}

export default function MultiDropdownField(props: FieldComponentProps<IMultiDropdownField>) {
  const { field, disabled, onChange } = props
  // The form names every field before it renders one.
  const [value, change] = useFieldValue<MultiDropdownValue[] | undefined>(field.name ?? '')
  const dependent = useDependentOptions(field.options, field.depends_on)
  const items = useMemo(() => toFieldItems(dependent.options), [dependent.options])

  // A change of the value the options depend on clears the selection.
  const parentValue = field.depends_on ? dependent.parentValue : field.parentValue
  const previousParent = usePrevious(parentValue)
  useEffect(() => {
    if (previousParent !== undefined && previousParent !== parentValue) {
      change([])
    }
  }, [previousParent, parentValue, change])

  return (
    <Field {...fieldFrame(props)}>
      {(control) => (
        <Combobox<MultiDropdownValue>
          {...control}
          multiple
          items={items}
          value={value ?? []}
          onValueChange={(next) => {
            change(next)
            onChange?.(next)
          }}
          disabled={disabled}
        />
      )}
    </Field>
  )
}
