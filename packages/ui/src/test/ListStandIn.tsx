import { useMemo } from 'react'
import { useWatch } from 'react-hook-form'
import { FieldsFromOptions } from '../form/Form'
import type { FieldComponentProps } from '../form/types/fieldComponentTypes'
import type { BaseField } from '../form/types/fieldTypes'

// The ui draws no list of its own; this one draws each row the way a host's list does.
export default function ListStandIn({ field }: FieldComponentProps<BaseField>) {
  const name = field.name ?? ''
  // Only the number of rows decides what this draws; each row's fields follow their own values.
  const count = useWatch({
    name,
    compute: (rows: unknown) => (Array.isArray(rows) ? rows.length : 0),
  })
  const options = field.options as Record<string, unknown>
  const rows = useMemo(
    () =>
      Array.from({ length: count }, (_, index) => ({
        fieldNamePrefix: `${name}[${index}].`,
        arrayIndex: index,
      })),
    [count, name],
  )
  return (
    <div>
      {rows.map((parentInfo) => (
        <FieldsFromOptions
          key={parentInfo.fieldNamePrefix}
          options={options}
          parentInfo={parentInfo}
        />
      ))}
    </div>
  )
}
