import { Field } from '../components/Field'
import { fieldFrame } from '../form/fieldFrame'
import type { FieldComponentProps } from '../form/types/fieldComponentTypes'
import type { BaseField } from '../form/types/fieldTypes'
import { useFieldValue } from '../form/useFieldValue'
import { Editor } from './Editor'

export interface IEditorField extends BaseField {
  type: 'editor'
  default?: string
  options?: {
    language?: string
  }
}

/** A form field that edits its value as code, in the language its `options` name (shell by default). */
export function EditorField(props: FieldComponentProps<IEditorField>) {
  const { field, disabled, onChange } = props
  // The form names every field before it renders one.
  const [value, change] = useFieldValue<string | undefined>(field.name ?? '')

  return (
    <Field {...fieldFrame(props)}>
      <Editor
        height="200px"
        // The editor keeps the cursor where it is when the form hands back the text it just sent,
        // and takes a reset or another field's change as it comes.
        value={value ?? ''}
        disabled={disabled}
        onChange={(text) => {
          onChange?.(text)
          change(text)
        }}
        language={field.options?.language || 'shell'}
      />
    </Field>
  )
}
