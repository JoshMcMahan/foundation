import cx from 'classnames'
import { useMemo, useState } from 'react'
import { type UIStrings, useStrings } from '../components/Provider'
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
import { formatETA, formatFileSize } from './lib/utils'

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
        shortTitle: strings.completeShort,
        bgColor: 'bg-green-100',
      }
    case 'failed':
      return {
        icon: <AlertIcon className="w-5 h-5 text-red-600" />,
        title: strings.failedTitle,
        shortTitle: strings.failedShort,
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

interface FileProgressBarProps {
  fileProgress: UploadFileProgress
  fileName: string
  progressBarColorScheme: {
    uploading: string
    completed: string
    failed: string
    cancelled: string
  }
  onCancelFile?: () => void
}

function FileProgressBar({
  fileProgress,
  fileName,
  progressBarColorScheme,
  onCancelFile,
}: FileProgressBarProps) {
  const strings = useStrings().fileExplorer.upload
  const [isHovered, setIsHovered] = useState(false)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const percentage = fileProgress?.percentage || 0
  const loadedBytes = fileProgress?.loadedBytes || 0
  const totalBytes = fileProgress.fileSizeBytes || fileProgress?.totalBytes || 0

  const isCompleted = percentage === 100 || fileProgress.status === 'completed'
  const isCancelled = fileProgress.status === 'cancelled'
  const isFailed = fileProgress.status === 'failed'
  const isUploading =
    fileProgress.status === 'uploading' || (!isCompleted && !isCancelled && !isFailed)

  const canCancel =
    isUploading && fileProgress.abortController && !isCompleted && !isCancelled && !isFailed

  const barColor = isCompleted
    ? progressBarColorScheme.completed
    : isCancelled
      ? progressBarColorScheme.cancelled
      : isFailed
        ? progressBarColorScheme.failed
        : progressBarColorScheme.uploading

  const handleCancelClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowCancelConfirm(true)
  }

  const handleConfirmCancel = (e: React.MouseEvent) => {
    e.stopPropagation()
    onCancelFile?.()
    setShowCancelConfirm(false)
  }

  const handleKeepUploading = (e: React.MouseEvent) => {
    e.stopPropagation()
    setShowCancelConfirm(false)
  }

  return (
    <div className="space-y-1">
      {/* File Name and Percentage Row */}
      <div className="flex items-center justify-between text-xs">
        <div className="text-xs theme-muted-text text-wrap max-w-[75%]">{fileName}</div>
        <div className="text-xs theme-muted-text text-right self-end">
          {isCancelled && strings.cancelled}
          {isCompleted && strings.completed}
          {isFailed && strings.failed}
          {isUploading && `${percentage.toFixed(2)}%`}
        </div>
      </div>

      <div className="flex items-center gap-1">
        {/* Progress Bar */}
        <div
          role="none"
          className="relative flex-1"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div
            className={cx(
              'w-full bg-(--theme-border) rounded-full overflow-hidden transition-all duration-300 ease-in-out flex items-center',
              isHovered && !isCompleted ? 'h-6' : 'h-2',
            )}
          >
            {/* Progress Bar Fill */}
            <div
              className={cx(
                'h-full transition-all duration-300 relative flex items-center justify-center',
                barColor,
                isHovered && 'opacity-80',
              )}
              style={{ width: `${percentage}%` }}
            />

            {isHovered && !isCompleted && totalBytes > 0 && (
              <>
                <div
                  className="absolute inset-0 flex items-center justify-center text-xs whitespace-nowrap p-0.5 z-10"
                  style={{
                    WebkitClipPath: `inset(0 ${100 - percentage}% 0 0)`, // clip left part
                    color: 'white',
                  }}
                >
                  {formatFileSize(loadedBytes)} / {formatFileSize(totalBytes)}
                </div>

                <div
                  className="absolute inset-0 flex items-center justify-center text-xs whitespace-nowrap p-0.5 z-10"
                  style={{
                    WebkitClipPath: `inset(0 0 0 ${percentage}%)`, // clip right part
                    color: 'black',
                  }}
                >
                  {formatFileSize(loadedBytes)} / {formatFileSize(totalBytes)}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Cancel Button */}
        {!showCancelConfirm && canCancel && (
          <button
            type="button"
            aria-label={`Cancel ${fileName}`}
            className="p-1 rounded-full hover:bg-red-100 relative cursor-pointer"
            onClick={handleCancelClick}
            title={`Cancel ${fileName}`}
          >
            <CloseIcon className="w-4 h-4 text-red-500 hover:text-red-700" />
          </button>
        )}

        {showCancelConfirm && canCancel && (
          <div className="flex items-center gap-1">
            <span className="text-xs theme-muted-text whitespace-nowrap">Cancel?</span>
            <button
              type="button"
              className="px-1.5 py-0.5 text-xs bg-(--theme-border) theme-muted-text rounded hover:theme-hover"
              onClick={handleKeepUploading}
            >
              No
            </button>
            <button
              type="button"
              className="!px-1.5 !py-0.5 text-xs btn btn-destructive cursor-pointer"
              onClick={handleConfirmCancel}
            >
              Yes
            </button>
          </div>
        )}
      </div>
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
  const strings = useStrings().fileExplorer.upload
  const [isToastExpanded, setIsToastExpanded] = useState(false)
  const [isFileListExpanded, setIsExpanded] = useState(session.uploadNodes.length <= 3)
  const [showCancelConfirm, setShowCancelConfirm] = useState(false)

  const statusInfo = useMemo(
    () => getSessionStatusInfo(session, queueLength, strings),
    [session, queueLength, strings],
  )

  const targetPath = `${session.targetPath}/`

  const isQueued = session.status === 'queued'
  const isCompleted = session.status === 'completed'
  const isCancelled = session.status === 'cancelled'
  const isFailed = session.status === 'failed'
  const isUploading = session.status === 'uploading' || (!isCompleted && !isCancelled && !isFailed)

  const totalProgress = session.progress?.overallProgress || 0
  const totalSize = session.progress?.totalSizeBytes || 0

  const progressBarColorScheme = {
    uploading: 'theme-element',
    completed: 'bg-green-600',
    failed: 'bg-red-600',
    cancelled: 'bg-(--theme-muted-text-color)',
  }
  const barColor = isCompleted
    ? progressBarColorScheme.completed
    : isCancelled
      ? progressBarColorScheme.cancelled
      : isFailed
        ? progressBarColorScheme.failed
        : progressBarColorScheme.uploading

  const allFiles = session.progress?.allFiles ? Array.from(session.progress.allFiles.values()) : []
  const singleFile = allFiles[0]
  const singleNode = session.uploadNodes.length === 1 ? session.uploadNodes[0] : undefined

  const uploadingFiles = session.progress?.allFiles
    ? Array.from(session.progress.allFiles.values()).filter(
        (file) => file.percentage && file.percentage >= 0 && file.percentage < 100,
      )
    : []

  const shouldShowSessionCancelButton =
    !showCancelConfirm && (isUploading || isQueued) && session.uploadNodes.length > 1

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
                  {session.progress?.completedFiles || 0} / {session.progress?.totalFiles || 0}{' '}
                  files done
                </div>
                <div className="text-xs theme-muted-text mt-0.5">
                  {showETA && formatETA(estimatedSecondsLeft)}
                </div>
              </div>

              {/* Progress Bar */}
              <div className="mt-1 flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-(--theme-border) rounded-full overflow-hidden">
                  <div
                    className={cx('h-full transition-all duration-300', barColor)}
                    style={{ width: `${totalProgress}%` }}
                  />
                </div>
              </div>
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
                    {uploadingFiles.length > 0 && `${uploadingFiles.length} uploading `}(
                    {session.progress?.completedFiles || 0} / {session.progress?.totalFiles || 0}{' '}
                    done)
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
                  <span>{formatFileSize(totalSize)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{strings.eta}</span>
                  {showETA ? formatETA(estimatedSecondsLeft) : strings.calculating}
                </div>
              </div>
            </div>

            {/* Warning for active uploads */}
            {isUploading && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <div className="flex gap-2">
                  <AlertIcon className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-800">
                    Please don&apos;t refresh this page during upload to prevent any data loss.
                  </p>
                </div>
              </div>
            )}

            {/* Overall Progress Bar */}
            {session.uploadNodes.length > 1 && (isUploading || isQueued) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs theme-muted-text">
                  <span>{strings.overallProgress}</span>
                  <span>{totalProgress.toFixed(1)}%</span>
                </div>
                <div className="h-2 w-full bg-(--theme-border) rounded-full overflow-hidden">
                  <div
                    className={cx('h-full transition-all duration-300', barColor)}
                    style={{ width: `${totalProgress}%` }}
                  />
                </div>
              </div>
            )}

            {/* File List Toggle */}
            {session.uploadNodes.length > 1 && (
              <div className="flex flex-col bg-(--theme-muted-panel-bg) rounded py-2 px-3 space-y-2 transition-all duration-300">
                <button
                  type="button"
                  className="flex items-center justify-between text-xs theme-muted-text hover:theme-text cursor-pointer"
                  onClick={() => setIsExpanded(!isFileListExpanded)}
                >
                  <span>{session.uploadNodes.length} files</span>
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
                            progressBarColorScheme={progressBarColorScheme}
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
                progressBarColorScheme={progressBarColorScheme}
                onCancelFile={() => onCancelFile?.(singleNode.relativePath)}
              />
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-end">
              {shouldShowSessionCancelButton && (
                <button
                  type="button"
                  className="!px-2 !py-1 text-xs btn btn-destructive cursor-pointer transition-colors"
                  onClick={handleCancelClick}
                >
                  Cancel
                </button>
              )}

              {showCancelConfirm && (
                <div className="flex items-center space-x-2">
                  <span className="text-xs theme-muted-text">Cancel all uploading files?</span>
                  <button
                    type="button"
                    className="!px-2 !py-1 text-xs bg-(--theme-border) theme-muted-text rounded hover:theme-hover"
                    onClick={handleKeepUploading}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    className="!px-2 !py-1 text-xs btn btn-destructive cursor-pointer"
                    onClick={handleConfirmCancel}
                  >
                    Yes
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
