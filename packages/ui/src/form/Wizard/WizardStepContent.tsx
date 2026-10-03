import type { TSetFormDirty } from '../Form'
import { FieldsFromOptions } from '../Form'
import type { WizardStepContentProps } from './types'

export function WizardStepContent({
  currentStep,
  stepConfig,
  flatten = true,
  values,
  setFormDirty,
  setFieldValue,
  setFieldTouched,
  ...fieldsProps
}: WizardStepContentProps & {
  setFormDirty: TSetFormDirty
  setFieldValue: (field: string, value: unknown, shouldValidate?: boolean) => void
  setFieldTouched: (field: string, touched?: boolean, shouldValidate?: boolean) => void
  flatten?: boolean | undefined
}) {
  if (!stepConfig.options) {
    return null
  }

  return (
    <div className="mb-4 w-full">
      {stepConfig.title && (
        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--theme-app)' }}>
          {stepConfig.title}
        </h2>
      )}
      {stepConfig.description && (
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--theme-muted-text-color)' }}>
          {stepConfig.description}
        </p>
      )}
      <FieldsFromOptions
        key={currentStep}
        options={stepConfig.options}
        values={values}
        setFormDirty={setFormDirty}
        setFieldValue={setFieldValue}
        setFieldTouched={setFieldTouched}
        {...(flatten === false
          ? {
              parentInfo: {
                parentName: currentStep,
                fieldNamePrefix: `${currentStep}.`,
              },
            }
          : {})}
        {...fieldsProps}
      />
    </div>
  )
}
