import { useCallback, useState } from 'react'
import type { StepFieldConfig, WizardState } from './types'

interface UseWizardStateProps {
  /** Ordered list of step keys */
  stepOrder: string[]
  /** Step configurations keyed by step ID */
  steps: Record<string, StepFieldConfig>
  /** Function to validate current step */
  validateStep: (stepKey: string) => Promise<boolean>
  /** Initial step to start with (default: first step) */
  initialStep?: string
}

export function useWizardState({
  stepOrder,
  steps,
  validateStep,
  initialStep,
}: UseWizardStateProps) {
  const firstStep = initialStep || stepOrder[0] || ''
  const [currentStep, setCurrentStep] = useState(firstStep)
  const [visitedSteps, setVisitedSteps] = useState<Set<string>>(new Set([firstStep]))
  const [invalidSteps, setInvalidSteps] = useState<Set<string>>(new Set())

  const currentStepIndex = stepOrder.indexOf(currentStep)
  const isLastStep = currentStepIndex === stepOrder.length - 1
  const canGoBack = currentStepIndex > 0

  /**
   * Mark step as visited
   */
  const markStepVisited = useCallback((stepKey: string) => {
    setVisitedSteps((prev) => new Set([...prev, stepKey]))
  }, [])

  /**
   * Mark step as invalid
   */
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

    const stepConfig = steps[currentStep]

    // Check if step validation should be performed
    if (stepConfig?.validateOnNext !== false) {
      const isValid = await validateStep(currentStep)
      if (!isValid) {
        markStepInvalid(currentStep, true)
        return false
      }
    }

    // Mark current step as valid if it had errors
    markStepInvalid(currentStep, false)

    // Move to next step
    const nextStepKey = stepOrder[currentStepIndex + 1]
    setCurrentStep(nextStepKey ?? '')
    markStepVisited(nextStepKey ?? '')

    return true
  }, [
    currentStep,
    currentStepIndex,
    isLastStep,
    steps,
    stepOrder,
    validateStep,
    markStepInvalid,
    markStepVisited,
  ])

  const goToPrevious = useCallback(() => {
    if (!canGoBack) {
      return
    }
    const prevStepKey = stepOrder[currentStepIndex - 1]
    setCurrentStep(prevStepKey ?? '')
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

  /**
   * Reset wizard to initial state
   */
  const reset = useCallback(() => {
    setCurrentStep(firstStep)
    setVisitedSteps(new Set([firstStep]))
    setInvalidSteps(new Set())
  }, [firstStep])

  /**
   * Get current wizard state
   */
  const getState = useCallback((): WizardState => {
    return {
      currentStep,
      visitedSteps,
      invalidSteps,
      stepOrder,
      totalSteps: stepOrder.length,
      isLastStep,
      canProceedToNext: !isLastStep,
      canGoBack,
    }
  }, [currentStep, visitedSteps, invalidSteps, stepOrder, isLastStep, canGoBack])

  return {
    currentStep,
    visitedSteps,
    invalidSteps,
    isLastStep,
    canGoBack,
    currentStepIndex,
    totalSteps: stepOrder.length,
    goToNext,
    goToPrevious,
    jumpToStep,
    reset,
    markStepVisited,
    markStepInvalid,
    getState,
  }
}
