import cx from 'classnames'
import { useField, useFormikContext } from 'formik'
import { useMemo, useRef } from 'react'
import { FieldWrapper } from '../form/FieldWrapper'
import type { FieldComponentProps } from '../form/types/fieldComponentTypes'
import type { BaseField } from '../form/types/fieldTypes'
import Editor from './Editor'

export interface IEditorField extends BaseField {
  type: 'editor'
  default?: string
  options?: {
    language?: string
  }
}

interface IResetKeys {
  editorKeyPostfix: string
}

function hasResetKeys(obj: unknown): obj is IResetKeys {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'editorKeyPostfix' in obj &&
    typeof obj.editorKeyPostfix === 'string'
  )
}

export default function EditorField(props: FieldComponentProps<IEditorField>) {
  const {
    field,
    label,
    labelPosition,
    disabled,
    onChange,
    tooltipComponent,
    spaceCompact,
    setFormDirty,
  } = props
  // The form names every field before it renders one.
  const fieldName = field.name ?? ''

  const [fieldState] = useField<string>(fieldName)
  const { setFieldValue, setFieldTouched, values } = useFormikContext()

  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  // Track whether user has edited — once true, stop passing value to Monaco
  // so Formik re-renders don't call model.setValue() and reset the cursor.
  const touchedRef = useRef(false)

  const handleChange = (val: string) => {
    touchedRef.current = true
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
    }
    debounceRef.current = setTimeout(() => {
      onChange?.(val)
      setFieldTouched(fieldName, true)
      setFieldValue(fieldName, val)
      setFormDirty(true)
    }, 500)
  }

  // We're using `values.editorKeyPostfix` to force re-render the editor when the key changes
  let editorKeyPostfix = ''
  if (hasResetKeys(values)) {
    editorKeyPostfix = values.editorKeyPostfix
  }

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
        {...(touchedRef.current ? {} : { value: fieldState.value })}
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
