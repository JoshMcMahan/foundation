import { Button } from '../../components/Button'
import { Popover, useClosePopover } from '../../components/Popover'
import { useStrings } from '../../components/Provider'
import { cx } from '../../cx'
import { CheckIcon, WarningIcon } from '../../icons'
import type { WizardStepIndicatorProps } from './types'
import { stepText } from './utils'

type Status = 'done' | 'current' | 'upcoming' | 'invalid'

/** Where a wizard is: "Step 3 of 10", a bar with a segment per page, and the list of every page,
 *  from which a person jumps to one they may. It keeps one size from three pages to a hundred,
 *  as a repeated page's copies can make, and at any width. */
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
  const statusOf = (key: string, index: number): Status =>
    key === currentStep
      ? 'current'
      : invalidSteps.has(key)
        ? 'invalid'
        : index < currentIndex
          ? 'done'
          : 'upcoming'

  return (
    <nav aria-label={strings.steps} className="mb-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-(--theme-muted-text-color)">
          {strings.stepOf(currentIndex + 1, stepOrder.length)}
        </p>
        <Popover
          trigger={
            <Button size="xs" variant="ghost">
              {strings.allSteps}
            </Button>
          }
          title={strings.steps}
          align="end"
          className="w-72"
        >
          <ol className="-mx-1 flex max-h-80 flex-col gap-0.5 overflow-y-auto">
            {stepOrder.map((key, index) => (
              <StepItem
                key={key}
                number={hideStepNumbers ? undefined : index + 1}
                title={stepText(steps[key]?.title)}
                description={steps[key]?.description && stepText(steps[key].description)}
                status={statusOf(key, index)}
                // A person jumps back to a page they've seen, never ahead past one they haven't.
                onJump={
                  allowJump && visitedSteps.has(key) && key !== currentStep
                    ? () => onStepClick(key)
                    : undefined
                }
              />
            ))}
          </ol>
        </Popover>
      </div>
      {/* The bar shows at a glance what the line above says, and the list names. */}
      <div aria-hidden="true" className="mt-2 flex gap-1">
        {stepOrder.map((key, index) => (
          <span
            key={key}
            className={cx(
              'h-1 min-w-0.5 flex-1 rounded-full',
              segmentClasses[statusOf(key, index)],
            )}
          />
        ))}
      </div>
    </nav>
  )
}

const segmentClasses: Record<Status, string> = {
  done: 'bg-(--theme-accent)',
  current: 'bg-(--theme-accent)',
  upcoming: 'bg-(--theme-border)',
  invalid: 'bg-(--theme-error)',
}

function StepItem({
  number,
  title,
  description,
  status,
  onJump,
}: {
  number: number | undefined
  title: string
  description: string | undefined
  status: Status
  onJump: (() => void) | undefined
}) {
  const { form: strings } = useStrings()
  const close = useClosePopover()
  const marker = (
    <span
      aria-hidden="true"
      className={cx(
        'flex size-5 shrink-0 items-center justify-center rounded-full text-[0.6875rem] font-semibold tabular-nums',
        status === 'current' && 'bg-(--theme-accent) text-(--theme-accent-text)',
        status === 'done' && 'bg-(--theme-muted-panel-bg) text-(--theme-accent)',
        status === 'upcoming' && 'border border-(--theme-border) text-(--theme-muted-text-color)',
        status === 'invalid' && 'bg-(--theme-muted-panel-bg) text-(--theme-error)',
      )}
    >
      {status === 'done' ? (
        <CheckIcon className="size-2.5" />
      ) : status === 'invalid' ? (
        <WarningIcon className="size-3" />
      ) : (
        number
      )}
    </span>
  )
  const text = (
    <span className="flex min-w-0 flex-col">
      <span className={cx('truncate', status === 'current' && 'font-semibold')}>
        {number === undefined ? (
          title
        ) : (
          // Read with its number, which the marker shows.
          <>
            <span className="sr-only">{strings.stepLabel(number, title)}</span>
            <span aria-hidden="true">{title}</span>
          </>
        )}
      </span>
      {status === 'done' && <span className="sr-only">{strings.stepDone}</span>}
      {status === 'invalid' && (
        <span className="text-xs text-(--theme-error-text)">{strings.stepNeedsAttention}</span>
      )}
      {description && (
        <span className="text-xs text-(--theme-muted-text-color)">{description}</span>
      )}
    </span>
  )
  const row = 'flex w-full items-start gap-2 rounded-md px-1 py-1.5 text-left text-sm'
  return (
    <li aria-current={status === 'current' ? 'step' : undefined}>
      {onJump ? (
        <button
          type="button"
          className={cx(row, 'cursor-pointer hover:bg-(--theme-muted-panel-bg)')}
          onClick={() => {
            onJump()
            close()
          }}
        >
          {marker}
          {text}
        </button>
      ) : (
        <div className={cx(row, status === 'upcoming' && 'text-(--theme-muted-text-color)')}>
          {marker}
          {text}
        </div>
      )}
    </li>
  )
}
