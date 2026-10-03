import { createContext, use, useRef } from 'react'
import { keyedByContent } from '../components/keys'
import { useNotify, useStrings } from '../components/Provider'
import type { IFileExplorerClient, IFileExplorerProvider } from './lib/fileExplorer'
import type { TreeNode, UploadFileProgress, UploadNode, UploadSession } from './lib/types'
import { getUploadSessionETA, removeLeadingSlash } from './lib/utils'
import { UploadSessionToast } from './toasts'

interface IFileExplorerContextValue {
  // Upload session management
  uploadSessionMap: Map<string, UploadSession>
  uploadQueue: string[]

  // Upload session methods
  addUploadSession: (
    storageName: string,
    targetPath: string,
    uploadNodes: UploadNode[],
    client: IFileExplorerClient,
    provider: IFileExplorerProvider,
    targetNode: TreeNode,
    refreshTargetNode: (targetNode: TreeNode) => Promise<unknown>,
  ) => string
  getUploadSessionById: (sessionId: string) => UploadSession | undefined
  getUploadQueueIndex: (sessionId: string) => number
  startUploadSession: (sessionId: string) => Promise<void>

  // Progress tracking
  updateFileUploadProgress?: (
    sessionId: string,
    fileKey: string,
    progress: UploadFileProgress,
  ) => void
}

const FileExplorerContext = createContext<IFileExplorerContextValue | undefined>(undefined)

// "status code 403" catches axios errors rewrapped as plain Errors (google.ts chunked uploads)
const permissionMessagePattern = /not authorized|access denied|status code 403/i

// Azure RestError carries statusCode, axios (GCS) carries status, AWS SDK v3 nests it in $metadata
function isPermissionDenied(reason: unknown): boolean {
  if (!(reason instanceof Error)) {
    return false
  }
  if ('statusCode' in reason && reason.statusCode === 403) {
    return true
  }
  if ('status' in reason && reason.status === 403) {
    return true
  }
  if (
    '$metadata' in reason &&
    typeof reason.$metadata === 'object' &&
    reason.$metadata !== null &&
    'httpStatusCode' in reason.$metadata &&
    reason.$metadata.httpStatusCode === 403
  ) {
    return true
  }
  return permissionMessagePattern.test(reason.message)
}

interface IFileExplorerProviderProps {
  children: React.ReactNode
}

export function FileExplorerProvider({ children }: IFileExplorerProviderProps) {
  const notify = useNotify()
  const t = useStrings().fileExplorer
  const uploadSessionMapRef = useRef<Map<string, UploadSession>>(new Map())
  const uploadQueueRef = useRef<string[]>([])

  // Track if any upload session is currently being processed
  const isProcessingRef = useRef<boolean>(false)

  const uploadSessionIdCounter = useRef(0)
  const uploadSessionIdPrefix = 'upload-session'

  const generateUploadSessionId = () => {
    return `${uploadSessionIdPrefix}-${Date.now()}-${uploadSessionIdCounter.current++}`
  }

  const calculateWeightedProgress = (session: UploadSession): number => {
    if (!session.progress?.allFiles || session.progress.allFiles.size === 0) {
      return 0
    }

    let totalWeightedProgress = 0
    let totalWeight = 0

    // Calculate weighted progress based on file sizes
    session.progress.allFiles.forEach((fileProgress) => {
      const fileSize = fileProgress.fileSizeBytes || 0
      const filePercentage = fileProgress?.percentage || 0

      totalWeightedProgress += (filePercentage / 100) * fileSize
      totalWeight += fileSize
    })

    return totalWeight > 0 ? (totalWeightedProgress / totalWeight) * 100 : 0
  }

  const calculateOverallLoadedBytes = (
    session: UploadSession,
  ): { loaded: number; total: number } => {
    if (!session.progress?.allFiles) {
      return { loaded: 0, total: session.progress?.totalSizeBytes || 0 }
    }

    let totalLoaded = 0
    let totalSize = 0

    session.progress.allFiles.forEach((fileProgress) => {
      totalLoaded += fileProgress.loadedBytes || 0
      totalSize += fileProgress.fileSizeBytes || 0
    })

    return { loaded: totalLoaded, total: totalSize }
  }

  const updateFileProgressInUploadSession = (
    session: UploadSession,
    relativePath: string,
    updates: Partial<UploadFileProgress>,
  ) => {
    if (!session.progress?.allFiles) {
      return
    }

    const fileProgress = session.progress.allFiles.get(relativePath)
    if (!fileProgress) {
      return
    }
    const updatedFileProgress = { ...fileProgress, ...updates }

    session.progress.allFiles.set(relativePath, updatedFileProgress)
  }

  const addUploadSession = (
    storageName: string,
    targetPath: string,
    uploadNodes: UploadNode[],
    client: IFileExplorerClient,
    provider: IFileExplorerProvider,
    targetNode: TreeNode,
    refreshTargetNode: (targetNode: TreeNode) => Promise<unknown>,
  ) => {
    const sessionId = generateUploadSessionId()
    const newSession: UploadSession = {
      id: sessionId,
      storageName,
      targetPath,
      uploadNodes: uploadNodes,
      status: 'queued',
      queueIndex: uploadQueueRef.current.length,
      client,
      provider,
      progress: {
        completedFiles: 0,
        totalFiles: uploadNodes.length,
        totalSizeBytes: uploadNodes.reduce((sum, node) => sum + (node.file?.size || 0), 0),
        allFiles: new Map(
          uploadNodes.map((file) => [
            file.relativePath,
            {
              fileKey: file.relativePath,
              fileSizeBytes: file.file?.size || 0,
              abortController: new AbortController(),
              status: 'pending',
              percentage: 0,
            },
          ]),
        ),
      },
      toastId: sessionId,
      abortController: new AbortController(), // Session-level abort controller
      targetNode,
      refreshTargetNode,
    }

    uploadSessionMapRef.current.set(sessionId, newSession)
    uploadQueueRef.current.push(sessionId)
    notify.loading(
      <UploadSessionToast session={newSession} queueLength={uploadQueueRef.current.length} />,
      {
        toastId: sessionId,
        icon: false,
        closeButton: false,
      },
    )

    processNextUploadSessionInQueue()

    return sessionId
  }

  const getUploadSessionById = (sessionId: string): UploadSession | undefined => {
    return uploadSessionMapRef.current.get(sessionId)
  }

  const getUploadQueueIndex = (sessionId: string): number => {
    return uploadQueueRef.current.indexOf(sessionId)
  }

  const cancelFileInSession = (sessionId: string, relativePath: string) => {
    const session = getUploadSessionById(sessionId)
    if (!session?.progress?.allFiles) {
      return
    }

    const fileProgress = session.progress.allFiles.get(relativePath)
    if (
      fileProgress?.abortController &&
      (fileProgress.status === 'pending' || fileProgress.status === 'uploading')
    ) {
      fileProgress.abortController.abort()

      updateFileProgressInUploadSession(session, relativePath, {
        status: 'cancelled',
      })
    }
  }

  const handleSessionCancel = (session: UploadSession) => {
    if (session.progress?.allFiles) {
      session.progress.allFiles.forEach((fileProgress, relativePath) => {
        if (
          fileProgress.abortController &&
          (fileProgress.status === 'pending' || fileProgress.status === 'uploading')
        ) {
          fileProgress.abortController.abort()
          session.progress?.allFiles?.set(relativePath, {
            ...fileProgress,
            status: 'cancelled',
          })
        }
      })
    }
    session.abortController?.abort()
    session.status = 'cancelled'
  }

  const startUploadSession = async (sessionId: string): Promise<void> => {
    const session = getUploadSessionById(sessionId)
    if (!session) {
      notify.update(sessionId, {
        render: t.messages.uploadInitFailed,
        type: 'error',
        isLoading: false,
        closeButton: null,
      })
      return
    }

    if (session.status !== 'queued') {
      notify.update(sessionId, {
        render: t.upload.sessionNotQueued(sessionId, session.status),
        type: 'error',
        isLoading: false,
        closeButton: null,
      })
      return
    }

    session.status = 'uploading'
    isProcessingRef.current = true

    try {
      notify.update(sessionId, {
        render: (
          <UploadSessionToast
            session={session}
            queueLength={uploadQueueRef.current.length}
            onCancel={() => handleSessionCancel(session)}
            onCancelFile={(path) => cancelFileInSession(sessionId, path)}
          />
        ),
        icon: false,
        isLoading: false,
        closeButton: false,
        autoClose: false,
      })

      const results = await Promise.allSettled(
        session.uploadNodes.map(async (node) => {
          if (node?.file) {
            const fileProgress = session.progress?.allFiles?.get(node.relativePath)
            if (!fileProgress) {
              return
            }
            if (fileProgress.status === 'cancelled') {
              return { reason: 'Upload cancelled by user', status: 'rejected' }
            }

            updateFileProgressInUploadSession(session, node.relativePath, {
              status: 'uploading',
              loadedBytes: 0,
              totalBytes: node.file.size,
              percentage: 0,
            })

            const objectPath = session.targetPath
              ? `${session.targetPath}/${removeLeadingSlash(node.relativePath)}`
              : removeLeadingSlash(node.relativePath)

            const uploadFileInput = session.provider.uploadFileInput
            if (!uploadFileInput) {
              return {
                reason: 'Upload is not supported for this storage provider',
                status: 'rejected',
              }
            }

            const input = uploadFileInput(session.storageName, objectPath, node.file)

            const onProgress = (progress: {
              loadedBytes: number
              totalBytes: number
              percentage: number
            }) => {
              if (session.status === 'cancelled') {
                return
              }

              // Update file progress in session
              if (session.progress?.allFiles) {
                const currentFileProgress = session.progress.allFiles.get(node.relativePath)
                if (!currentFileProgress) {
                  return
                }
                if (
                  ['failed', 'cancelled', 'complete'].includes(currentFileProgress.status ?? '')
                ) {
                  return
                }

                // Used to avoid duplicate counting of completed files
                const wasCompleted = currentFileProgress.percentage === 100

                updateFileProgressInUploadSession(session, node.relativePath, {
                  loadedBytes: progress.loadedBytes,
                  totalBytes: progress.totalBytes,
                  percentage: progress.percentage,
                  status: progress.percentage === 100 ? 'completed' : 'uploading',
                })

                if (progress.percentage === 100 && !wasCompleted) {
                  session.progress.completedFiles += 1
                }

                const overallProgress = calculateWeightedProgress(session)
                const { loaded: totalLoadedBytes } = calculateOverallLoadedBytes(session)

                session.progress.overallProgress = overallProgress
                session.progress.totalLoadedBytes = totalLoadedBytes

                const {
                  estimatedSecondsLeft,
                  lastProgressTime,
                  lastProgressBytes,
                  shouldUpdateETA,
                } = getUploadSessionETA(
                  totalLoadedBytes,
                  session.progress.totalSizeBytes,
                  session.progress.lastProgressTime,
                  session.progress.lastProgressBytes,
                )
                session.progress.lastProgressTime = lastProgressTime
                session.progress.lastProgressBytes = lastProgressBytes

                if (shouldUpdateETA) {
                  session.progress.estimatedSecondsLeft = estimatedSecondsLeft
                }

                notify.update(sessionId, {
                  render: (
                    <UploadSessionToast
                      session={session}
                      queueLength={uploadQueueRef.current.length}
                      onCancel={() => handleSessionCancel(session)}
                      onCancelFile={(path) => cancelFileInSession(sessionId, path)}
                    />
                  ),
                  icon: false,
                  isLoading: false,
                  closeButton: false,
                  autoClose: false,
                })
              }
            }

            try {
              await session.client.uploadFile(input, onProgress, fileProgress.abortController)
              updateFileProgressInUploadSession(session, node.relativePath, {
                status: 'completed',
              })
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error ?? '')
              const isCancelled =
                errorMessage.toLowerCase().includes('abort') ||
                errorMessage.toLowerCase().includes('cancel')

              updateFileProgressInUploadSession(session, node.relativePath, {
                status: isCancelled ? 'cancelled' : 'failed',
              })

              notify.update(sessionId, {
                render: (
                  <UploadSessionToast
                    session={{
                      ...session,
                      progress: {
                        completedFiles: 0,
                        totalFiles: 0,
                        totalSizeBytes: 0,
                        ...session.progress,
                      },
                    }}
                    queueLength={uploadQueueRef.current.length}
                    onCancel={() => handleSessionCancel(session)}
                    onCancelFile={(path) => cancelFileInSession(sessionId, path)}
                  />
                ),
                icon: false,
                isLoading: false,
                closeButton: session.status === 'failed' || session.status === 'cancelled',
                autoClose: false,
              })

              // Re-throw the error for Promise.allSettled to process the overall toast
              throw error
            }
          }
          return
        }),
      )

      try {
        await session.refreshTargetNode(session.targetNode)
      } catch (err) {
        notify.error(
          t.upload.refreshFailed(
            session.storageName,
            err instanceof Error ? err.message : t.upload.unknownError,
          ),
        )
      }

      const failedResults = results.filter((r) => r.status === 'rejected')
      // Filter out aborted uploads from failed results
      const actualFailedResults = failedResults.filter((result) => {
        if (result.status === 'rejected') {
          const reason = result.reason?.message || result.reason?.toString() || ''

          return !reason.toLowerCase().includes('abort') && !reason.toLowerCase().includes('cancel')
        }
        return false
      })

      const abortedCount = failedResults?.length - actualFailedResults?.length

      const failedFileNames = actualFailedResults
        .map((result) => {
          // Map back to correct file names
          const originalIndex = results.indexOf(result)
          return session.uploadNodes[originalIndex]?.name || `File #${originalIndex + 1}`
        })
        .filter(Boolean)

      const successfulCount = results?.length - failedResults?.length
      if (actualFailedResults?.length > 0) {
        notify.update(sessionId, {
          render: (
            <div className="text-md">
              <div className="font-medium mb-2">
                {t.upload.failedSummary(actualFailedResults.length, results.length)}
              </div>
              <ul className="text-sm space-y-1 max-h-32 overflow-y-auto">
                {keyedByContent(failedFileNames, (n) => n).map(({ key, item: name }, i) => (
                  <li key={key}>
                    • {name}
                    {actualFailedResults[i]?.reason ? `: ${actualFailedResults[i].reason}` : ''}
                  </li>
                ))}
              </ul>
              <div className="mt-2 text-sm">
                {actualFailedResults.every((result) => isPermissionDenied(result.reason))
                  ? t.messages.noWriteAccess
                  : t.upload.failReasonGeneric}
              </div>
            </div>
          ),
          type: 'error',
          icon: null,
          isLoading: false,
          closeButton: null,
        })
      } else if (abortedCount > 0 && successfulCount > 0) {
        notify.update(sessionId, {
          render: (
            <div className="w-full flex flex-col gap-1">
              <div>{t.upload.someUploaded(successfulCount)}</div>
              <div>{t.upload.someCancelled(abortedCount)}</div>
            </div>
          ),
          type: 'success',
          icon: null,
          isLoading: false,
          closeButton: null,
          autoClose: null,
        })
      } else if (abortedCount > 0 && successfulCount === 0) {
        notify.update(sessionId, {
          render: t.upload.allCancelled(abortedCount),
          type: 'info',
          icon: null,
          isLoading: false,
          closeButton: null,
          autoClose: null,
        })
      } else {
        notify.update(sessionId, {
          render: t.upload.allUploaded,
          type: 'success',
          icon: null,
          isLoading: false,
          closeButton: null,
          autoClose: null,
        })
      }

      session.status = actualFailedResults.length > 0 ? 'failed' : 'completed'

      const queueIndex = getUploadQueueIndex(sessionId)
      if (queueIndex !== -1) {
        uploadQueueRef.current.splice(queueIndex, 1)
      }
      uploadSessionMapRef.current.delete(sessionId)

      setTimeout(() => {
        processNextUploadSessionInQueue()
      }, 1000)
    } finally {
      isProcessingRef.current = false
    }
  }

  const processNextUploadSessionInQueue = async () => {
    const nextSessionId = uploadQueueRef.current[0]
    if (isProcessingRef.current || nextSessionId === undefined) {
      return
    }

    await startUploadSession(nextSessionId)
  }

  const contextValue: IFileExplorerContextValue = {
    uploadSessionMap: uploadSessionMapRef.current,
    uploadQueue: uploadQueueRef.current,
    addUploadSession,
    getUploadSessionById,
    getUploadQueueIndex,
    startUploadSession,
  }

  return (
    <FileExplorerContext.Provider value={contextValue}>{children}</FileExplorerContext.Provider>
  )
}

export function useFileExplorer() {
  const context = use(FileExplorerContext)
  if (!context) {
    throw new Error('useFileExplorer must be used within a FileExplorerProvider')
  }
  return context
}
