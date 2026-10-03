import { useCallback, useState } from 'react'
import type { StepFieldConfig } from './types'

interface UseWizardStateProps {
  /** Ordered list of step keys */
  stepOrder: string[]
  /** Step configurations keyed by step ID */
  steps: Record<string, StepFieldConfig>
  /** Function to validate current step */
  validateStep: (stepKey: string) => Promise<boolean>
}

export function useWizardState({ stepOrder, steps, validateStep }: UseWizardStateProps) {
  const firstStep = stepOrder[0] ?? ''
  const [currentStep, setCurrentStep] = useState(firstStep)
  const [visitedSteps, setVisitedSteps] = useState<Set<string>>(new Set([firstStep]))
  const [invalidSteps, setInvalidSteps] = useState<Set<string>>(new Set())

  const currentStepIndex = stepOrder.indexOf(currentStep)
  const isLastStep = currentStepIndex === stepOrder.length - 1
  const canGoBack = currentStepIndex > 0

  const markStepInvalid = useCallback((stepKey: string, invalid: boolean) => {
    setInvalidSteps((prev) => {
      const next = new Set(prev)
      if (invalid) {
        next.add(stepKey)
      } else {
        next.delete(stepKey)
      }
      return next
    })
  }, [])

  const goToNext = useCallback(async (): Promise<boolean> => {
    if (isLastStep) {
      return false
    }

    if (steps[currentStep]?.validateOnNext !== false) {
      const isValid = await validateStep(currentStep)
      if (!isValid) {
        markStepInvalid(currentStep, true)
        return false
      }
    }

    // Mark current step as valid if it had errors
    markStepInvalid(currentStep, false)

    const nextStepKey = stepOrder[currentStepIndex + 1] ?? ''
    setCurrentStep(nextStepKey)
    setVisitedSteps((prev) => new Set([...prev, nextStepKey]))

    return true
  }, [currentStep, currentStepIndex, isLastStep, steps, stepOrder, validateStep, markStepInvalid])

  const goToPrevious = useCallback(() => {
    if (!canGoBack) {
      return
    }
    setCurrentStep(stepOrder[currentStepIndex - 1] ?? '')
  }, [canGoBack, currentStepIndex, stepOrder])

  const jumpToStep = useCallback(
    (stepKey: string): boolean => {
      if (!stepOrder.includes(stepKey)) {
        return false
      }

      // Can only jump to completed/visited steps
      if (!visitedSteps.has(stepKey) && stepKey !== currentStep) {
        return false
      }

      setCurrentStep(stepKey)
      return true
    },
    [stepOrder, visitedSteps, currentStep],
  )

  return {
    currentStep,
    visitedSteps,
    invalidSteps,
    isLastStep,
    canGoBack,
    goToNext,
    goToPrevious,
    jumpToStep,
  }
}
