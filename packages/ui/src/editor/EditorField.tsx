import { clsx as cx } from 'clsx'
import { useMemo, useRef } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'
import { FieldWrapper } from '../form/FieldWrapper'
import type { FieldComponentProps } from '../form/types/fieldComponentTypes'
import type { BaseField } from '../form/types/fieldTypes'
import { useFieldValue } from '../form/useFieldValue'
import Editor from './Editor'

export interface IEditorField extends BaseField {
  type: 'editor'
  default?: string
  options?: {
    language?: string
  }
}

export default function EditorField(props: FieldComponentProps<IEditorField>) {
  const { field, label, labelPosition, disabled, onChange, tooltipComponent, spaceCompact } = props
  // The form names every field before it renders one.
  const fieldName = field.name ?? ''

  const [value, change] = useFieldValue<string | undefined>(fieldName)
  // Once the person edits, Monaco owns the text: handing it back each render would set the model's
  // value and move the cursor.
  const touchedRef = useRef(false)

  const handleChange = (val: string) => {
    touchedRef.current = true
    onChange?.(val)
    change(val)
  }

  // A host remounts the editor with fresh text by setting `editorKeyPostfix` among the form's values.
  const { control } = useFormContext()
  const resetKey = useWatch({ control, name: 'editorKeyPostfix' })
  const editorKeyPostfix = typeof resetKey === 'string' ? resetKey : ''

  const postfixKey = useMemo(() => {
    const randomKey = Math.random().toString(36).substring(7)
    return editorKeyPostfix || randomKey
  }, [editorKeyPostfix])

  return (
    <FieldWrapper
      optional={field.optional}
      label={label}
      tooltipComponent={tooltipComponent}
      labelPosition={labelPosition}
      spaceCompact={spaceCompact}
    >
      <Editor
        key={fieldName + postfixKey}
        ariaLabel={label}
        height="200px"
        path={fieldName}
        {...(touchedRef.current || value === undefined ? {} : { value })}
        className={cx(
          'bg-(--theme-input-bg) w-11 border focus:border rounded text-[10px] leading-4 pl-[6px]',
          disabled && 'opacity-75',
        )}
        readOnly={disabled}
        onChange={handleChange}
        language={field.options?.language || 'shell'}
      />
    </FieldWrapper>
  )
}
