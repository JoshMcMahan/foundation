import { useMemo } from 'react'
import { FieldsFromOptions, type ParentInfo } from '../Form'
import { EditingScope, useFormEditing } from '../formEditing'
import type { WizardStepContentProps } from './types'
import { stepText } from './utils'

export function WizardStepContent({
  currentStep,
  stepConfig,
  flatten = true,
  fieldNamePrefix = '',
  copy,
  ...fieldsProps
}: WizardStepContentProps & {
  flatten?: boolean | undefined
}) {
  const editing = useFormEditing()
  // A repeated page's copy keeps its fields in its row of the page's list, and every copy edits them,
  // as every row of a list edits its template.
  const parentInfo = useMemo<ParentInfo | undefined>(
    () =>
      copy !== undefined
        ? { fieldNamePrefix: `${fieldNamePrefix}${currentStep}[${copy}].`, arrayIndex: copy }
        : flatten === false
          ? { fieldNamePrefix: `${fieldNamePrefix}${currentStep}.` }
          : fieldNamePrefix
            ? { fieldNamePrefix }
            : undefined,
    [copy, flatten, fieldNamePrefix, currentStep],
  )
  if (!stepConfig.options) {
    return null
  }
  const path = editing ? [...editing.parent, currentStep] : null

  const content = (
    <div className="mb-4 w-full">
      {stepText(stepConfig.title) && (
        <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--theme-app)' }}>
          {stepText(stepConfig.title)}
        </h2>
      )}
      {stepText(stepConfig.description) && (
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--theme-muted-text-color)' }}>
          {stepText(stepConfig.description)}
        </p>
      )}
      <EditingScope editing={editing} path={path}>
        <FieldsFromOptions
          key={copy === undefined ? currentStep : `${currentStep}[${copy}]`}
          options={stepConfig.options}
          {...(parentInfo ? { parentInfo } : {})}
          {...fieldsProps}
        />
      </EditingScope>
    </div>
  )
  const instance = `${fieldNamePrefix}${currentStep}${copy === undefined ? '' : `[${copy}]`}`
  return editing && path ? (
    <editing.Row path={path} instance={instance}>
      {content}
    </editing.Row>
  ) : (
    content
  )
}
