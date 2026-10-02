import type React from 'react'
import { createContext, Suspense, useContext } from 'react'
import { useSlots } from '../components/Provider'
import BooleanField from './Fields/BooleanField'
import CheckboxGroupField from './Fields/CheckboxGroupField'
import ColorField from './Fields/ColorField'
import DropdownField from './Fields/DropdownField'
import DurationField from './Fields/DurationField'
import LabelField from './Fields/LabelField'
import MultiDropdownField from './Fields/MultiDropdownField'
import NumberField from './Fields/NumberField'
import ObjectField from './Fields/ObjectField'
import RadioField from './Fields/RadioField'
import RangeField from './Fields/RangeField'
import StepField from './Fields/StepField'
import StringField from './Fields/StringField'
import TextAreaField from './Fields/TextAreaField'
import type { FieldComponentProps } from './types/fieldComponentTypes'

// biome-ignore lint/suspicious/noExplicitAny: Field type discrimination happens at runtime
export type FieldComponent = React.ComponentType<FieldComponentProps<any, any>>

// Fields with no data-fetching or host coupling; everything else is supplied
// by the host through the DynamicForm `fields` prop.
const CORE_FIELD_COMPONENTS: Record<string, FieldComponent> = {
  string: StringField,
  password: StringField,
  number: NumberField,
  boolean: BooleanField,
  dropdown: DropdownField,
  textarea: TextAreaField,
  range: RangeField,
  duration: DurationField,
  radio: RadioField,
  label: LabelField,
  color: ColorField,
  'multi-dropdown': MultiDropdownField,
  'checkbox-group': CheckboxGroupField,
  object: ObjectField,
  step: StepField,
}

export const FieldRegistryContext = createContext<Record<string, FieldComponent>>({})

/** Returns null for field types no registry knows. Per-form `fields` win over
 * the provider's `slots.formFields`, which win over the core registry. */
// biome-ignore lint/suspicious/noExplicitAny: Runtime type discrimination
export function Registry(props: FieldComponentProps<any>) {
  const injected = useContext(FieldRegistryContext)
  const { formFields } = useSlots()
  const Component =
    injected[props.field.type] ??
    formFields?.[props.field.type] ??
    CORE_FIELD_COMPONENTS[props.field.type]
  if (!Component) {
    return null
  }
  return (
    <Suspense fallback={null}>
      <Component {...props} />
    </Suspense>
  )
}
