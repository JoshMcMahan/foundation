import { useFormikContext } from 'formik'
import { useState } from 'react'
import { ControlledCollapsiblePanel } from '../../components/CollapsiblePanel'
import { FieldsFromOptions, GroupHeader, resolveMetaOverrides } from '../Form'
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
  missingFields,
  setFormDirty,
  workflowForm,
  labelPosition,
  spaceCompact,
}: FieldComponentProps<IObjectField>) {
  // The form names every field before it renders one.
  const fieldName = field.name ?? ''
  const [open, setOpen] = useState(field.collapsed !== undefined ? !field.collapsed : true)
  const { values, setFieldValue, setFieldTouched } = useFormikContext<Record<string, unknown>>()
  const meta = resolveMetaOverrides(field.options, labelPosition, spaceCompact ?? false)

  const body = (
    <div className="w-full">
      <FieldsFromOptions
        options={field.options}
        values={values}
        setFormDirty={setFormDirty}
        setFieldValue={setFieldValue}
        setFieldTouched={setFieldTouched}
        missingFields={missingFields}
        workflowForm={workflowForm}
        labelPosition={meta.labelPosition}
        spaceCompact={meta.spaceCompact}
        parentInfo={{
          parentName: fieldName,
          fieldNamePrefix: `${fieldName}.`,
        }}
      />
    </div>
  )

  return (
    <div className="flex flex-col w-full">
      {field.noCollapse && (
        <div className="flex items-center w-full mb-[15px]">
          <h3 className="flex items-center gap-1 text-md font-bold">
            {label} {tooltipComponent}
          </h3>
        </div>
      )}
      {field.noCollapse ? (
        body
      ) : (
        <ControlledCollapsiblePanel
          open={open}
          setOpen={setOpen}
          title={<GroupHeader open={open} setOpen={setOpen} title={field.label || label} />}
        >
          {body}
        </ControlledCollapsiblePanel>
      )}
    </div>
  )
}
