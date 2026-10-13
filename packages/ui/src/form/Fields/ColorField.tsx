import { FieldWrapper } from '../FieldWrapper'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
import { useFieldValue } from '../useFieldValue'

export interface IColorField extends BaseField {
  type: 'color'
  default?: string
}

export default function ColorField(props: FieldComponentProps<IColorField>) {
  const { field, label, labelPosition, onChange, tooltipComponent, spaceCompact } = props
  // The form names every field before it renders one.
  const [value, change] = useFieldValue<string | undefined>(field.name ?? '')

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange?.(e.target.value)
    change(e.target.value)
  }

  return (
    <FieldWrapper
      optional={field.optional}
      label={label}
      tooltipComponent={tooltipComponent}
      labelPosition={labelPosition}
      spaceCompact={spaceCompact}
    >
      {({ id }) => (
        <input
          className="theme-input h-8 w-18 rounded border border-neutral-400 placeholder:text-xs"
          id={id}
          name={field.name}
          value={value || '#fbbf24'}
          type="color"
          onChange={handleChange}
        />
      )}
    </FieldWrapper>
  )
}
