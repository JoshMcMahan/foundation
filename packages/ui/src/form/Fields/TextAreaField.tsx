import { Field } from '../../components/Field'
import { Textarea } from '../../components/Input'
import { fieldFrame } from '../fieldFrame'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
import { useFieldValue } from '../useFieldValue'
import { getPlaceholder } from '../utils/getPlaceholder'

export interface ITextAreaField extends BaseField {
  type: 'textarea'
  default?: string
  placeholder?: string
}

export default function TextAreaField(props: FieldComponentProps<ITextAreaField>) {
  const { field, disabled, onChange } = props
  // The form names every field before it renders one.
  const [value, change] = useFieldValue<string | undefined>(field.name ?? '')

  return (
    <Field {...fieldFrame(props)}>
      {(control) => (
        <Textarea
          {...control}
          className="h-20 min-h-20"
          name={field.name}
          value={value ?? ''}
          placeholder={getPlaceholder(field.placeholder, field.default)}
          disabled={disabled}
          onChange={(e) => {
            onChange?.(e.target.value)
            change(e.target.value)
          }}
        />
      )}
    </Field>
  )
}
