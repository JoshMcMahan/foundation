import { useField, useFormikContext } from 'formik'
import type { ICategory, IOptions } from '../../components/dropdownUtils'
import MultiSelectDropdown from '../../components/MultiSelect'
import type { TSetFormDirty } from '../Form'
import { useFieldLabelledByProps, useFieldRequired } from '../fieldContext'

export default function FormikMultiSelectDropdown<T>({
  name,
  options,
  setFormDirty,
  onChange,
  disabled = false,
  loading = false,
  invalid = false,
  placeholder,
  compareBy,
}: {
  name: string
  options: (ICategory<T> | IOptions<T>)[]
  setFormDirty: TSetFormDirty
  onChange?: ((val: T[]) => void) | undefined
  disabled?: boolean
  loading?: boolean
  invalid?: boolean
  placeholder?: string
  compareBy?: (a: T, b: T) => boolean
}) {
  const [field] = useField<T[]>(name)
  const required = useFieldRequired()
  const labelledByProps = useFieldLabelledByProps()
  const { setFieldValue, setFieldTouched } = useFormikContext()

  const handleChange = (next: T[]) => {
    setFieldValue(name, next)
    setFieldTouched(name, true)
    setFormDirty(true)
    onChange?.(next)
  }

  return (
    <MultiSelectDropdown<T>
      {...labelledByProps}
      textBoxClassName={invalid ? 'invalid' : undefined}
      options={options}
      required={required}
      value={Array.isArray(field.value) ? field.value : []}
      onChange={handleChange}
      disabled={disabled}
      loading={loading}
      placeholder={placeholder}
      compareBy={compareBy}
    />
  )
}
