import { useMemo } from 'react'
import { Section } from '../../components/Section'
import { FieldsFromOptions, resolveMetaOverrides } from '../Form'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField, DynamicFormSchema } from '../types/fieldTypes'

export interface IObjectField extends BaseField {
  type: 'object'
  options: DynamicFormSchema
}

export default function ObjectField({
  field,
  label,
  tooltipComponent,
  labelPosition,
  spaceCompact,
}: FieldComponentProps<IObjectField>) {
  // The form names every field before it renders one.
  const fieldName = field.name ?? ''
  const meta = resolveMetaOverrides(field.options, labelPosition, spaceCompact ?? false)
  const parentInfo = useMemo(() => ({ fieldNamePrefix: `${fieldName}.` }), [fieldName])

  return (
    <Section
      title={field.label || label}
      beside={tooltipComponent}
      collapsible={!field.noCollapse}
      defaultOpen={!field.collapsed}
    >
      <FieldsFromOptions
        options={field.options}
        labelPosition={meta.labelPosition}
        spaceCompact={meta.spaceCompact}
        parentInfo={parentInfo}
      />
    </Section>
  )
}
