import { useFormikContext } from 'formik'
import { FieldsFromOptions } from '../form/Form'
import type { FieldComponentProps } from '../form/types/fieldComponentTypes'
import type { BaseField } from '../form/types/fieldTypes'
import { getValueUsingPath } from '../form/utils/getValueUsingPath'

// The ui draws no list of its own; this one draws each row the way a host's list does.
export default function ListStandIn({ field, setFormDirty }: FieldComponentProps<BaseField>) {
  const { values, setFieldValue, setFieldTouched } = useFormikContext<Record<string, unknown>>()
  const name = field.name ?? ''
  const rows = getValueUsingPath(values, name)
  const options = field.options as Record<string, unknown>
  return (
    <div>
      {(Array.isArray(rows) ? rows : []).map((_, index) => {
        const prefix = `${name}[${index}].`
        return (
          <FieldsFromOptions
            key={prefix}
            options={options}
            values={values}
            setFormDirty={setFormDirty}
            setFieldValue={setFieldValue}
            setFieldTouched={setFieldTouched}
            parentInfo={{ parentName: name, fieldNamePrefix: prefix, arrayIndex: index }}
          />
        )
      })}
    </div>
  )
}
