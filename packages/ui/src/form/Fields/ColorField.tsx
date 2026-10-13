import { Field } from '../../components/Field'
import { fieldBox } from '../../components/fieldBox'
import { cx } from '../../cx'
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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.value)
    change(e.target.value)
  }

  return (
    <Field {...fieldFrame(props)}>
      {(control) => (
        <input
          {...control}
          // The swatch fills the box, so only its frame is the field's.
          className={cx(fieldBox(), 'w-18 cursor-pointer p-1')}
          name={field.name}
          value={value || '#fbbf24'}
          type="color"
          disabled={disabled}
          onChange={handleChange}
        />
      )}
    </Field>
  )
}
