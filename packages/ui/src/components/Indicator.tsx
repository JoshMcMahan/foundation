import type { RunStatus } from '../engine'
import { CancelIcon, FailIcon, NotRunningIcon, RunningIcon, SkipIcon, SuccessIcon } from '../icons'

export function Indicator({ status }: { status: RunStatus }) {
  return (
    <div className="h-2 flex items-center text-(--theme-panel-bg)">
      {status === 'started' || status === 'running' ? (
        <RunningIcon
          className="rounded-full text-[#FFCF00] animate-spin"
          data-testid="running-indicator"
        />
      ) : status === 'completed' ? (
        <SuccessIcon
          className="text-[#6FBF5A]"
          style={{ transform: 'scale(1.25)' }}
          data-testid="completed-indicator"
        />
      ) : status === 'failed' || status === 'error' ? (
        <FailIcon
          className="text-red-500"
          style={{ transform: 'scale(1.25)' }}
          data-testid="failed-indicator"
        />
      ) : status === 'skipped' || status === 'skipped-failed' ? (
        <SkipIcon
          className="text-gray-400"
          style={{ transform: 'scale(1.25)' }}
          data-testid="skipped-indicator"
        />
      ) : status === 'canceled' ? (
        <CancelIcon
          className="text-[#3B82F6]"
          style={{ transform: 'scale(1.5)' }}
          data-testid="canceled-indicator"
        />
      ) : status === 'faulted' ? (
        <RunningIcon
          className="rounded-full text-[#EF4444] animate-spin"
          data-testid="faulted-indicator"
        />
      ) : status === 'canceling' ? (
        <RunningIcon
          className="rounded-full text-[#3B82F6] animate-spin"
          data-testid="canceling-indicator"
        />
      ) : (
        <NotRunningIcon
          className="rounded-full text-[#AAAAAA]"
          data-testid="not-running-indicator"
        />
      )}
    </div>
  )
}
