import type { IFileExplorerClient, IFileExplorerProvider } from './fileExplorer'

/** Above these a file is not fetched for preview; the pane offers a download instead. */
export type PreviewLimits = {
  codeBytes: number
  codeLines: number
  tabularBytes: number
  tabularRows: number
  imageBytes: number
  pdfBytes: number
  notebookBytes: number
}

export type TStorage = {
  id: string
  name: string
  bucketName?: string
  user: string
  displayName?: string
  type?: string
  created?: string
  modified?: string
  csp?: string
  imageUrl?: string
  canWrite?: boolean | undefined
  canUpload?: boolean | undefined
  // Storage capabilities. Undefined means capable (the cloud-bucket default);
  // only storages that lack a capability (e.g. workspace files) set it false.
  canShare?: boolean | undefined
  canManageAccess?: boolean | undefined
  previewLimits?: Partial<PreviewLimits> | undefined
}

/** A file the host is asked to name or download: its storage, key and name. */
export interface ExplorerObject {
  storage: TStorage
  key: string
  name: string
}

export type TStorageObject = {
  path: string
  type: 'file' | 'directory'
  key?: string // Directory may not have a key
  size?: number | undefined
  created?: string | undefined
  modified?: string | undefined
  contentType?: string | undefined
  hash?: string | undefined
  storageClass?: string | undefined
}

export type TreeNode = {
  name: string
  displayName?: string | undefined
  path: string
  relativePath?: string | undefined // Relative path is the same as TStorageObject.key for files or empty directories
  type: 'file' | 'directory'
  size?: number | undefined
  created?: string | undefined
  modified?: string | undefined
  contentType?: string | undefined
  hash?: string | undefined
  storageClass?: string | undefined
  storageId?: string | undefined
  storageName?: string | undefined
  storageNodeIcon?: string | undefined // Only for storage nodes ("aws-bucket", "google-bucket", "azure-bucket")
  storageImageUrl?: string | undefined // Image URL for the storage node if available
  storageType?: string | undefined
  root?: boolean | undefined // True only for the storage root node
}

export type TreeMap = {
  [path: string]: TreeNode
}

export type UploadNode = {
  name: string
  file: File | Blob
  relativePath: string
}

export interface UploadFileProgress {
  fileKey: string
  fileSizeBytes: number
  loadedBytes?: number
  totalBytes?: number
  percentage?: number
  abortController?: AbortController
  status?: 'pending' | 'uploading' | 'completed' | 'failed' | 'cancelled'
}

export interface UploadSession {
  id: string
  storageName: string
  targetPath: string
  uploadNodes: UploadNode[]
  status: 'queued' | 'uploading' | 'completed' | 'failed' | 'cancelled'
  queueIndex: number
  client: IFileExplorerClient
  provider: IFileExplorerProvider
  progress?: {
    completedFiles: number
    totalFiles: number
    totalSizeBytes: number
    allFiles?: Map<string, UploadFileProgress>
    overallProgress?: number // Overall progress percentage
    totalLoadedBytes?: number // Total loaded bytes across all files
    // ETA tracking
    lastProgressTime?: number
    lastProgressBytes?: number
    estimatedSecondsLeft?: number | undefined
  }
  toastId: string
  abortController?: AbortController
  targetNode: TreeNode
  refreshTargetNode: (targetNode: TreeNode) => Promise<unknown>
}
