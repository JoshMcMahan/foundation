import { useState } from 'react'
import { Button } from '../../components/Button'
import { useStrings } from '../../components/Provider'
import { WarningIcon } from '../../icons'
import type { WizardNavigationProps } from './types'

export function WizardNavigation({
  isLastStep,
  canGoBack,
  isCurrentStepValid,
  nextLabel,
  prevLabel,
  submitLabel: submitLabelProp,
  onNext,
  onPrevious,
  onSubmit,
}: WizardNavigationProps) {
  const { form: t, common } = useStrings()
  const submitLabel = submitLabelProp ?? common.submit
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleNext = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const success = await onNext()
      if (!success) {
        setError(t.fixErrorsToContinue)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t.stepFailed)
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async () => {
    setIsLoading(true)
    setError(null)
    try {
      await onSubmit?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : t.stepFailed)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div>
      {error && (
        <p
          role="alert"
          className="mb-3 flex items-center gap-1.5 text-sm text-(--theme-error-text)"
        >
          <WarningIcon aria-hidden="true" className="size-4 shrink-0" />
          {error}
        </p>
      )}
      <div className="flex justify-between gap-3 pt-4">
        <Button
          variant="secondary"
          onClick={onPrevious}
          disabled={!canGoBack || isLoading}
          aria-label={t.previousStep}
        >
          {prevLabel || common.previous}
        </Button>
        {isLastStep && !onSubmit ? null : isLastStep ? (
          <Button
            variant="primary"
            onClick={handleSubmit}
            disabled={!isCurrentStepValid}
            loading={isLoading}
            aria-label={submitLabel}
          >
            {submitLabel}
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={handleNext}
            loading={isLoading}
            aria-label={t.nextStep}
          >
            {nextLabel || common.next}
          </Button>
        )}
      </div>
    </div>
  )
}
