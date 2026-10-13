import { useState } from 'react'
import { Button } from '../components/Button'
import { IconButton } from '../components/IconButton'
import { type BarTone, ProgressBar } from '../components/Meter'
import { type UIStrings, useStrings } from '../components/Provider'
import { cx } from '../cx'
import { formatBytes, formatTimeLeft } from '../format'
import {
  AlertIcon,
  AngleDownIcon,
  AngleUpIcon,
  CloseIcon,
  CloudUploadIcon,
  ExpandVerticalIcon,
  MinimizeIcon,
  SuccessIcon,
} from '../icons'
import type { UploadFileProgress, UploadSession } from './lib/types'

type UploadStrings = UIStrings['fileExplorer']['upload']

function getSessionStatusInfo(session: UploadSession, queueLength: number, strings: UploadStrings) {
  switch (session.status) {
    case 'queued':
      return {
        icon: <CloudUploadIcon className="w-5 h-5 text-blue-600" />,
        title: strings.inQueue(session.queueIndex + 1, queueLength),
        shortTitle: strings.queuedShort(session.queueIndex + 1, queueLength),
        bgColor: 'bg-blue-100',
      }
    case 'uploading':
      return {
        icon: <CloudUploadIcon className="w-5 h-5 text-blue-600" />,
        title: strings.uploading,
        shortTitle: strings.uploading,
        bgColor: 'bg-blue-100',
      }
    case 'completed':
      return {
        icon: <SuccessIcon className="w-5 h-5 text-green-600" />,
        title: strings.completeTitle,
        shortTitle: strings.completed,
        bgColor: 'bg-green-100',
      }
    case 'failed':
      return {
        icon: <AlertIcon className="w-5 h-5 text-red-600" />,
        title: strings.failedTitle,
        shortTitle: strings.failed,
        bgColor: 'bg-red-100',
      }
    default:
      return {
        icon: <CloudUploadIcon className="w-5 h-5 theme-muted-text" />,
        title: strings.unknownTitle,
        shortTitle: strings.unknownShort,
        bgColor: 'bg-(--theme-muted-panel-bg)',
      }
  }
}

function barTone({
  isCompleted,
  isCancelled,
  isFailed,
}: {
  isCompleted: boolean
  isCancelled: boolean
  isFailed: boolean
}): BarTone {
  if (isCompleted) {
    return 'success'
  }
  if (isCancelled) {
    return 'muted'
  }
  return isFailed ? 'error' : 'accent'
}

interface FileProgressBarProps {
  fileProgress: UploadFileProgress
  fileName: string
  onCancelFile?: () => void
}

function FileProgressBar({ fileProgress, fileName, onCancelFile }: FileProgressBarProps) {
  const { common, fileExplorer } = useStrings()
  const strings = fileExplorer.upload
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const percentage = fileProgress.percentage || 0
  const loadedBytes = fileProgress.loadedBytes || 0
  const totalBytes = fileProgress.fileSizeBytes || fileProgress.totalBytes || 0

  const isCompleted = percentage === 100 || fileProgress.status === 'completed'
  const isCancelled = fileProgress.status === 'cancelled'
  const isFailed = fileProgress.status === 'failed'
  const isSettled = isCompleted || isCancelled || isFailed
  const canCancel = !!fileProgress.abortController && !isSettled

  const stop = (e: React.MouseEvent, then: () => void) => {
    e.stopPropagation()
    then()
  }

  return (
    <div className="flex items-end gap-1">
      <ProgressBar
        className="flex-1"
        value={percentage}
        tone={barTone({ isCompleted, isCancelled, isFailed })}
        label={fileName}
        status={
          isCancelled
            ? strings.cancelled
            : isCompleted
              ? strings.completed
              : isFailed
                ? strings.failed
                : undefined
        }
        detail={
          !isSettled && totalBytes > 0
            ? `${formatBytes(loadedBytes)} / ${formatBytes(totalBytes)}`
            : undefined
        }
      />

      {!showCancelConfirm && canCancel && (
        <IconButton
          size="xs"
          label={strings.cancelFile(fileName)}
          icon={<CloseIcon />}
          onClick={(e) => stop(e, () => setShowCancelConfirm(true))}
        />
      )}

      {showCancelConfirm && canCancel && (
        <div className="flex items-center gap-1">
          <span className="text-xs theme-muted-text whitespace-nowrap">
            {strings.confirmCancelFile}
          </span>
          <Button
            variant="secondary"
            size="xs"
            onClick={(e) => stop(e, () => setShowCancelConfirm(false))}
          >
            {common.no}
          </Button>
          <Button
            variant="danger"
            size="xs"
            onClick={(e) =>
              stop(e, () => {
                onCancelFile?.()
                setShowCancelConfirm(false)
              })
            }
          >
            {common.yes}
          </Button>
        </div>
      )}
    </div>
  )
}

interface UploadSessionToastProps {
  session: UploadSession
  queueLength: number
  onCancel?: () => void
  onCancelFile?: (relativePath: string) => void
}

export function UploadSessionToast({
  session,
  queueLength,
  onCancel,
  onCancelFile,
}: UploadSessionToastProps) {
  const { common, fileExplorer } = useStrings()
  const strings = fileExplorer.upload
  const [isToastExpanded, setIsToastExpanded] = useState(false)
  const [isFileListExpanded, setIsExpanded] = useState(session.uploadNodes.length <= 3)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  // Not memoized: the session is mutated in place, so its identity says nothing
  // about whether the status changed.
  const statusInfo = getSessionStatusInfo(session, queueLength, strings)

  const targetPath = `${session.targetPath}/`

  const isCompleted = session.status === 'completed'
  const isCancelled = session.status === 'cancelled'
  const isFailed = session.status === 'failed'
  // Includes `queued`: a queued session shows the same progress and cancel controls.
  const isUploading = !isCompleted && !isCancelled && !isFailed

  const totalProgress = session.progress?.overallProgress || 0
  const totalSize = session.progress?.totalSizeBytes || 0

  const sessionTone = barTone({ isCompleted, isCancelled, isFailed })

  const allFiles = session.progress?.allFiles ? Array.from(session.progress.allFiles.values()) : []
  const singleFile = allFiles[0]
  const singleNode = session.uploadNodes.length === 1 ? session.uploadNodes[0] : undefined

  const uploadingFiles = allFiles.filter(
    (file) => (file.percentage ?? 0) > 0 && (file.percentage ?? 0) < 100,
  )

  const shouldShowSessionCancelButton =
    !showCancelConfirm && isUploading && session.uploadNodes.length > 1

  const estimatedSecondsLeft = session.progress?.estimatedSecondsLeft
  const showETA = isUploading && estimatedSecondsLeft && estimatedSecondsLeft > 0

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsToastExpanded(!isToastExpanded)
  }

  const handleCancelClick = () => {
    setShowCancelConfirm(true)
  }

  const handleConfirmCancel = () => {
    onCancel?.()
    setShowCancelConfirm(false)
  }

  const handleKeepUploading = () => {
    setShowCancelConfirm(false)
  }

  return (
    <div className="flex flex-col w-full transition-all duration-300 ease-in-out overflow-hidden">
      <div className="flex flex-col w-full space-y-3">
        {/* Compact Toast View */}
        {!isToastExpanded && (
          <div className="flex items-center gap-3 flex-1">
            <div
              className={cx(
                'w-10 h-10 rounded-full flex items-center justify-center',
                statusInfo.bgColor,
              )}
            >
              {statusInfo.icon}
            </div>
            <div role="none" className="flex-1 cursor-pointer" onClick={handleExpandClick}>
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium theme-text truncate">{statusInfo.shortTitle}</h3>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs theme-muted-text ml-2">{totalProgress.toFixed(1)}%</div>
                  {/* Expand Toast Button */}
                  <button
                    type="button"
                    aria-label={strings.expandDetails}
                    className="flex items-center justify-between text-xs theme-muted-text hover:theme-text cursor-pointer"
                    onClick={handleExpandClick}
                    title={strings.expandDetails}
                  >
                    <ExpandVerticalIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-xs theme-muted-text mt-0.5">
                  {strings.filesDone(
                    session.progress?.completedFiles || 0,
                    session.progress?.totalFiles || 0,
                  )}
                </div>
                <div className="text-xs theme-muted-text mt-0.5">
                  {showETA && (formatTimeLeft(estimatedSecondsLeft) ?? strings.almostDone)}
                </div>
              </div>

              {/* Progress Bar */}
              <ProgressBar
                className="mt-1"
                value={totalProgress}
                tone={sessionTone}
                aria-label={strings.overallProgress}
              />
            </div>
          </div>
        )}

        {/* Expanded Toast View */}
        {isToastExpanded && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div
                  className={cx(
                    'w-10 h-10 rounded-full flex items-center justify-center',
                    statusInfo.bgColor,
                  )}
                >
                  {statusInfo.icon}
                </div>
                <div>
                  <h3 className="text-sm font-semibold theme-text">{statusInfo.title}</h3>
                  <p className="text-xs theme-muted-text">
                    {strings.progress(
                      uploadingFiles.length,
                      session.progress?.completedFiles || 0,
                      session.progress?.totalFiles || 0,
                    )}
                  </p>
                </div>
              </div>
              {/* Minimize Toast Button */}
              <button
                type="button"
                aria-label={strings.minimizeDetails}
                className="flex items-center justify-between text-xs theme-muted-text hover:theme-text cursor-pointer mr-2"
                onClick={handleExpandClick}
                title={strings.minimizeDetails}
              >
                <MinimizeIcon className="w-4 h-4" />
              </button>
            </div>

            {/* Target Path */}
            <div className="mb-4 p-3 bg-(--theme-muted-panel-bg) rounded-lg">
              <div className="text-xs theme-muted-text space-y-1">
                <div className="flex justify-between">
                  <span>{strings.destination}</span>
                  <span className="font-medium truncate">{targetPath}</span>
                </div>
                <div className="flex justify-between">
                  <span>{session.uploadNodes.length > 1 ? strings.totalSize : strings.size}</span>
                  <span>{formatBytes(totalSize)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{strings.eta}</span>
                  {showETA
                    ? (formatTimeLeft(estimatedSecondsLeft) ?? strings.almostDone)
                    : strings.calculating}
                </div>
              </div>
            </div>

            {/* Warning for active uploads */}
            {isUploading && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex gap-2">
                  <AlertIcon className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">{strings.keepPageOpen}</p>
                </div>
              </div>
            )}

            {/* Overall Progress Bar */}
            {session.uploadNodes.length > 1 && isUploading && (
              <ProgressBar
                value={totalProgress}
                tone={sessionTone}
                size="lg"
                label={strings.overallProgress}
              />
            )}

            {/* File List Toggle */}
            {session.uploadNodes.length > 1 && (
              <div className="flex flex-col bg-(--theme-muted-panel-bg) rounded py-2 px-3 space-y-2 transition-all duration-300">
                <button
                  type="button"
                  className="flex items-center justify-between text-xs theme-muted-text hover:theme-text cursor-pointer"
                  onClick={() => setIsExpanded(!isFileListExpanded)}
                >
                  <span>{strings.fileCount(session.uploadNodes.length)}</span>
                  {isFileListExpanded ? (
                    <AngleUpIcon className="w-4 h-4" />
                  ) : (
                    <AngleDownIcon className="w-4 h-4" />
                  )}
                </button>

                {/* Expanded File List */}
                {isFileListExpanded && (
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {session.uploadNodes.map((node) => {
                      const fileProgress = session.progress?.allFiles?.get(node.relativePath)
                      if (!fileProgress) {
                        return null
                      }

                      return (
                        <div key={node.relativePath}>
                          <FileProgressBar
                            fileProgress={fileProgress}
                            fileName={node.name}
                            onCancelFile={() => onCancelFile?.(node.relativePath)}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Single File Progress */}
            {singleNode && singleFile && (
              <FileProgressBar
                fileProgress={singleFile}
                fileName={singleNode.name}
                onCancelFile={() => onCancelFile?.(singleNode.relativePath)}
              />
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end">
              {shouldShowSessionCancelButton && (
                <Button variant="danger" size="xs" onClick={handleCancelClick}>
                  {common.cancel}
                </Button>
              )}

              {showCancelConfirm && (
                <div className="flex items-center space-x-2">
                  <span className="text-xs theme-muted-text">{strings.confirmCancelAll}</span>
                  <Button variant="secondary" size="xs" onClick={handleKeepUploading}>
                    {common.no}
                  </Button>
                  <Button variant="danger" size="xs" onClick={handleConfirmCancel}>
                    {common.yes}
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
