// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import type { StepFieldConfig } from './types'
import { useWizardState } from './useWizardState'

describe('useWizardState', () => {
  const mockSteps: Record<string, StepFieldConfig> = {
    step1: {
      type: 'step',
      title: 'Step 1',
      options: { field1: { type: 'string' } },
    },
    step2: {
      type: 'step',
      title: 'Step 2',
      options: { field2: { type: 'string' } },
    },
    step3: {
      type: 'step',
      title: 'Step 3',
      options: { field3: { type: 'string' } },
    },
  }

  const stepOrder = ['step1', 'step2', 'step3']
  const mockValidateStep = vi.fn().mockResolvedValue(true)

  describe('initialization', () => {
    it('should initialize with first step', () => {
      const { result } = renderHook(() =>
        useWizardState({
          stepOrder,
          steps: mockSteps,
          validateStep: mockValidateStep,
        }),
      )

      expect(result.current.currentStep).toBe('step1')
      expect(result.current.visitedSteps.has('step1')).toBe(true)
      expect(result.current.canGoBack).toBe(false)
      expect(result.current.isLastStep).toBe(false)
    })
  })

  describe('goToNext', () => {
    it('should advance to next step when validation passes', async () => {
      const { result } = renderHook(() =>
        useWizardState({
          stepOrder,
          steps: mockSteps,
          validateStep: mockValidateStep,
        }),
      )

      let success = false
      await act(async () => {
        success = await result.current.goToNext()
      })

      expect(success).toBe(true)
      expect(result.current.currentStep).toBe('step2')
      expect(result.current.visitedSteps.has('step2')).toBe(true)
    })

    it('should not advance when validation fails', async () => {
      const failingValidate = vi.fn().mockResolvedValue(false)
      const { result } = renderHook(() =>
        useWizardState({
          stepOrder,
          steps: mockSteps,
          validateStep: failingValidate,
        }),
      )

      let success = false
      await act(async () => {
        success = await result.current.goToNext()
      })

      expect(success).toBe(false)
      expect(result.current.currentStep).toBe('step1')
      expect(result.current.invalidSteps.has('step1')).toBe(true)
    })

    it('should not advance past last step', async () => {
      const { result } = renderHook(() =>
        useWizardState({
          stepOrder,
          steps: mockSteps,
          validateStep: mockValidateStep,
        }),
      )

      await act(async () => {
        await result.current.goToNext()
      })
      await act(async () => {
        await result.current.goToNext()
      })
      let success = true
      await act(async () => {
        success = await result.current.goToNext()
      })

      expect(success).toBe(false)
      expect(result.current.currentStep).toBe('step3')
    })

    it('should skip validation when validateOnNext is false', async () => {
      const stepsWithoutValidation: Record<string, StepFieldConfig> = {
        step1: {
          type: 'step',
          title: 'Step 1',
          validateOnNext: false,
          options: { field1: { type: 'string' } },
        },
        step2: {
          type: 'step',
          title: 'Step 2',
          options: { field2: { type: 'string' } },
        },
      }

      const failingValidate = vi.fn().mockResolvedValue(false)
      const { result } = renderHook(() =>
        useWizardState({
          stepOrder: ['step1', 'step2'],
          steps: stepsWithoutValidation,
          validateStep: failingValidate,
        }),
      )

      let success = false
      await act(async () => {
        success = await result.current.goToNext()
      })

      expect(success).toBe(true)
      expect(result.current.currentStep).toBe('step2')
      expect(failingValidate).not.toHaveBeenCalled()
    })
  })

  describe('goToPrevious', () => {
    it('should go back one step', async () => {
      const { result } = renderHook(() =>
        useWizardState({
          stepOrder,
          steps: mockSteps,
          validateStep: mockValidateStep,
        }),
      )

      // Go to step2
      await act(async () => {
        await result.current.goToNext()
      })

      // Go back to step1
      act(() => {
        result.current.goToPrevious()
      })

      expect(result.current.currentStep).toBe('step1')
    })

    it('should not go back before first step', () => {
      const { result } = renderHook(() =>
        useWizardState({
          stepOrder,
          steps: mockSteps,
          validateStep: mockValidateStep,
        }),
      )

      act(() => {
        result.current.goToPrevious()
      })

      expect(result.current.currentStep).toBe('step1')
    })
  })

  describe('jumpToStep', () => {
    it('should jump to visited step', async () => {
      const { result } = renderHook(() =>
        useWizardState({
          stepOrder,
          steps: mockSteps,
          validateStep: mockValidateStep,
        }),
      )

      // Visit step2 and step3
      await act(async () => {
        await result.current.goToNext()
        await result.current.goToNext()
      })

      // Jump back to step1
      act(() => {
        result.current.jumpToStep('step1')
      })

      expect(result.current.currentStep).toBe('step1')
    })

    it('should not jump to unvisited step', () => {
      const { result } = renderHook(() =>
        useWizardState({
          stepOrder,
          steps: mockSteps,
          validateStep: mockValidateStep,
        }),
      )

      const success = result.current.jumpToStep('step3')

      expect(success).toBe(false)
      expect(result.current.currentStep).toBe('step1')
    })

    it('should not jump to invalid step key', () => {
      const { result } = renderHook(() =>
        useWizardState({
          stepOrder,
          steps: mockSteps,
          validateStep: mockValidateStep,
        }),
      )

      const success = result.current.jumpToStep('invalid')

      expect(success).toBe(false)
    })
  })
})
