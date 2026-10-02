import type { TListPageRequest } from './paging'
import type { TreeNode, TStorage, TStorageObject } from './types'

// The contract is deliberately opaque about per-CSP request/response shapes:
// inputs are built by a provider's own input hooks and handed straight back to
// that same provider's client, and list output goes straight back into the
// provider's converters, so nothing in between ever inspects the values. The
// two shapes the explorer UI does inspect are named below; every provider
// satisfies them structurally.

/** Every provider resolves get-file as a [url, error] tuple. */
export type FileExplorerGetFileResult = [string | null, Error | null]

/** The UI only checks Errors?.length; each provider's richer error entries
 *  satisfy this structurally. */
export interface FileExplorerDeleteFilesResult {
  Errors?: unknown[] | undefined
}

export interface IFileExplorerClient {
  getStorageName(): string
  getExpiresAt(): Date
  // Method syntax: bivariant params let each provider's client take its own
  // concrete input type while remaining assignable under strictFunctionTypes.
  getFile(input: unknown): Promise<FileExplorerGetFileResult>
  listDirectory(input: unknown): Promise<unknown>
  deleteFiles(input: unknown): Promise<FileExplorerDeleteFilesResult>
  uploadFile(
    input: unknown,
    onProgress?: (progress: {
      loadedBytes: number
      totalBytes: number
      percentage: number
    }) => void,
    abortController?: AbortController,
  ): Promise<unknown>
}

export interface IFileExplorerProvider {
  createClient:
    | ((
        organization: string,
        username: string,
        name: string,
      ) => Promise<IFileExplorerClient | null>)
    | null
  // Method syntax: bivariant params let each provider's own-output converter assign under strictFunctionTypes.
  convertDataToStorageObjects?(data: unknown): TStorageObject[]
  /** Absent ⇒ the explorer treats one page as the whole directory. Method syntax for
   *  the same bivariance reason as the two above. */
  nextPageCursor?(data: unknown): string | undefined
  // Property syntax: only the return type varies per provider, and returns are
  // covariant, so this keeps the parameters checked strictly.
  listDirectoryInput?:
    | ((storage: TStorage, dir_path?: string, page?: TListPageRequest) => unknown)
    | null
  /** `downloadFilename` asks for a URL that saves under that name. Omit it for a
   *  link the user keeps, or for a read the app parses itself. */
  getFileInput?:
    | ((
        storageName: string,
        node: TreeNode,
        presignedUrlExpiresIn?: number,
        downloadFilename?: string,
      ) => unknown)
    | null
  deleteFilesInput?: ((storageName: string, nodes: TreeNode[]) => unknown) | null
  uploadFileInput?: ((storageName: string, objectPath: string, file: File | Blob) => unknown) | null
}
