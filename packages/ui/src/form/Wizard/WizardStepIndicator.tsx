import { clsx as cx } from 'clsx'
import { useEffect, useRef, useState } from 'react'
import { useStrings } from '../../components/Provider'
import type { WizardStepIndicatorProps } from './types'
import { stepText } from './utils'

export function WizardStepIndicator({
  stepOrder,
  currentStep,
  steps,
  visitedSteps,
  invalidSteps,
  onStepClick,
  allowJump = false,
  hideStepNumbers = false,
}: WizardStepIndicatorProps) {
  const { form: strings } = useStrings()
  const currentIndex = stepOrder.indexOf(currentStep)
  // Many pages, as a repeated page's copies make, scroll in this row instead of widening the form, and
  // the current one is brought into view within it without moving the page.
  const row = useRef<HTMLOListElement>(null)
  // A row that scrolls takes focus, so a keyboard can scroll it when none of its dots can be focused.
  const [scrolls, setScrolls] = useState(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: more steps can overflow a row whose own size stays.
  useEffect(() => {
    const el = row.current
    if (!el) {
      return
    }
    const measure = () => setScrolls(el.scrollWidth > el.clientWidth)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    // Its steps too: a title that resolves to a longer word widens one without resizing the row.
    const observer = new ResizeObserver(measure)
    for (const box of [el, ...el.children]) {
      observer.observe(box)
    }
    return () => observer.disconnect()
  }, [stepOrder.length])
  useEffect(() => {
    const el = row.current
    const step = el?.children[currentIndex]
    if (!el || !step || el.scrollWidth <= el.clientWidth) {
      return
    }
    const box = el.getBoundingClientRect()
    const at = step.getBoundingClientRect()
    if (at.left < box.left || at.right > box.right) {
      el.scrollLeft += at.left - box.left - (box.width - at.width) / 2
    }
  }, [currentIndex])

  const getStepStatus = (stepKey: string, index: number) => {
    if (stepKey === currentStep) {
      return 'active'
    }
    if (index < currentIndex) {
      return 'completed'
    }
    return 'upcoming'
  }

  return (
    <ol
      ref={row}
      aria-label={strings.steps}
      tabIndex={scrolls ? 0 : undefined}
      className="flex items-start justify-between w-full mb-2 gap-4 py-2 overflow-x-auto"
    >
      {stepOrder.map((stepKey, index) => {
        const stepConfig = steps[stepKey]
        const status = getStepStatus(stepKey, index)
        const isInvalid = invalidSteps.has(stepKey)
        const isClickable = allowJump && visitedSteps.has(stepKey) && stepKey !== currentStep

        const isDotActive = status === 'active'
        const isDotCompleted = status === 'completed'
        const isDotUpcoming = status === 'upcoming'

        return (
          <li key={stepKey} className="flex flex-col items-center flex-1 relative">
            {/* Step dot */}
            <button
              type="button"
              onClick={() => onStepClick(stepKey)}
              disabled={!isClickable}
              aria-current={isDotActive ? 'step' : undefined}
              className={cx(
                'w-12 h-12 rounded-full border-3 flex items-center justify-center font-bold text-base transition-all duration-300 flex-shrink-0 relative',
                {
                  'cursor-pointer': isClickable,
                  'cursor-not-allowed': !isClickable,
                },
                {
                  // Active state uses theme colors
                  'text-white': isDotActive,
                  // Completed state
                  'bg-green-500 border-green-600 text-white shadow-md':
                    isDotCompleted && !isInvalid,
                  // Upcoming state
                  'bg-(--theme-border) theme-border theme-muted-text shadow-sm':
                    isDotUpcoming && !isInvalid,
                  // Invalid state
                  'bg-red-50 border-red-500 text-red-600 shadow-sm':
                    isInvalid && status !== 'active',
                },
              )}
              style={
                isDotActive
                  ? {
                      backgroundColor: 'var(--theme-element)',
                      borderColor: 'var(--theme-element)',
                      color: 'var(--theme-element-text)',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
                      zIndex: 10,
                    }
                  : { zIndex: 10 }
              }
              aria-label={`Step ${index + 1}: ${stepText(stepConfig?.title)}`}
              title={stepText(stepConfig?.title)}
            >
              {!hideStepNumbers && (
                <span className={cx({ hidden: status === 'completed' })}>{index + 1}</span>
              )}
              {status === 'completed' && (
                <svg
                  aria-hidden="true"
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </button>

            {/* Connecting line to next step */}
            {index < stepOrder.length - 1 && (
              <div
                className={cx('absolute h-1 transition-all duration-300', {
                  'bg-green-500': index < currentIndex,
                  'bg-(--theme-border)': index >= currentIndex,
                  'opacity-25': index >= currentIndex,
                })}
                style={{
                  top: '24px',
                  left: 'calc(50% + 24px)',
                  right: '-50%',
                  boxShadow: index < currentIndex ? '0 1px 2px rgba(34, 197, 94, 0.2)' : 'none',
                }}
                aria-hidden="true"
              />
            )}

            {/* Step label and description */}
            <div className="mt-2 text-center">
              <div
                className={cx('text-sm text-center transition-colors duration-300 max-w-30', {
                  'font-bold text-green-600': isDotCompleted && !isInvalid,
                  'font-bold text-red-600': isInvalid && status !== 'active',
                  'font-semibold theme-muted-text': !isDotActive && !isDotCompleted && !isInvalid,
                  'font-bold text-white': isDotActive,
                })}
                style={isDotActive ? { color: 'var(--theme-element)' } : {}}
              >
                {stepText(stepConfig?.title)}
              </div>
              {stepConfig?.description && (
                <div className="text-xs theme-muted-text mt-1 text-center max-w-30">
                  {stepText(stepConfig.description)}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
