import { useMemo } from 'react'
import { InfoTip } from '../../components/InfoTip'
import { Section } from '../../components/Section'
import { FieldsFromOptions, resolveMetaOverrides, sectionSpacing } from '../Form'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField, DynamicFormSchema } from '../types/fieldTypes'

export interface IObjectField extends BaseField {
  type: 'object'
  options: DynamicFormSchema
}

export default function ObjectField({
  field,
  label,
  help,
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
      description={field.description}
      // A section has no control to read its help with, so its ? keeps its Tab stop.
      beside={help && <InfoTip text={help} />}
      collapsible={!field.noCollapse}
      defaultOpen={!field.collapsed}
      spacing={sectionSpacing(meta.labelPosition)}
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
