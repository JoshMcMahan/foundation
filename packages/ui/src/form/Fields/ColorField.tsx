import { ColorInput } from '../../components/ColorInput'
import { Field } from '../../components/Field'
import { fieldFrame } from '../fieldFrame'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
import { useFieldValue } from '../useFieldValue'

export interface IColorField extends BaseField {
  type: 'color'
  default?: string
}

export default function ColorField(props: FieldComponentProps<IColorField>) {
  const { field, disabled, onChange } = props
  // The form names every field before it renders one.
  const [value, change] = useFieldValue<string | undefined>(field.name ?? '')

  return (
    <Field {...fieldFrame(props)}>
      {(control) => (
        <ColorInput
          {...control}
          name={field.name}
          value={value || '#fbbf24'}
          disabled={disabled}
          onValueChange={(color) => {
            onChange?.(color)
            change(color)
          }}
        />
      )}
    </Field>
  )
}
