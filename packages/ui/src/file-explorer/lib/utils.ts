import type { IFileExplorerClient } from './fileExplorer'
import type { TreeMap, TreeNode, TStorage, TStorageObject, UploadNode } from './types'

export function formatFileSize(bytes: number): string {
  if (bytes === 0) {
    return '0 B'
  }

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${Number.parseFloat((bytes / k ** i).toFixed(2))} ${sizes[i]}`
}

export function getFileExtension(filename: string): string | null {
  const match = filename.match(/\.([a-zA-Z0-9]+)$/)
  return match?.[1]?.toLowerCase() ?? null
}

export function getNodeName(node: TStorageObject): string {
  const path = node.path || ''

  const cleanPath = removeTrailingSlash(path)

  const parts = cleanPath.split('/')
  return parts[parts.length - 1] ?? ''
}

function toNode(
  entry: TStorageObject,
  storage: TStorage,
  storagePath: string,
  storageName: string,
): TreeNode {
  const relativePath = removeLeadingSlash(entry.path)
  const isDirectory = entry.type === 'directory'
  return {
    name: getNodeName(entry),
    path: isDirectory
      ? ensureTrailingSlash(`${storagePath}${removeTrailingSlash(relativePath)}`)
      : `${storagePath}${relativePath}`,
    relativePath: entry.key || (isDirectory ? entry.path : relativePath),
    type: entry.type,
    size: entry.size,
    created: entry.created,
    modified: entry.modified,
    contentType: entry.contentType,
    hash: entry.hash,
    storageClass: entry.storageClass,
    storageId: storage.id,
    storageName,
  }
}

// `localeCompare`, not an `Intl.Collator`: V8's ASCII fast path is 3x faster.
function compareNodes(a: TreeNode, b: TreeNode): number {
  if (a.type !== b.type) {
    return a.type === 'directory' ? -1 : 1
  }
  return (a.displayName || a.name).localeCompare(b.displayName || b.name)
}

/** Folders and files stay apart: an unsorted folder shows folders first, then
 *  files, each in arrival order. */
type TDirectoryNodes = {
  entries: readonly TStorageObject[]
  storageName: string
  directories: TreeNode[]
  files: TreeNode[]
  unsorted?: TreeNode[] | undefined
  sorted?: TreeNode[] | undefined
}

function extendsEntries(
  next: readonly TStorageObject[],
  previous: readonly TStorageObject[],
): boolean {
  return next.length >= previous.length && previous.every((entry, i) => next[i] === entry)
}

function childrenOf(dir: TDirectoryNodes, sorted: boolean): TreeNode[] {
  if (sorted) {
    dir.sorted ??= [...dir.directories, ...dir.files].sort(compareNodes)
    return dir.sorted
  }
  dir.unsorted ??= [...dir.directories, ...dir.files]
  return dir.unsorted
}

export type TTree = {
  treeMap: TreeMap
  parentToChildrenMap: Record<string, TreeNode[]>
  rootNodes: TreeNode[]
}

export type TTreeOptions = {
  listings: ReadonlyMap<string, { readonly entries: readonly TStorageObject[] }>
  forceUserHierarchy?: boolean
  unsortedParents?: ReadonlySet<string>
}

/** One accumulator per listed directory, so a landed page costs the page and not
 *  the tree. One builder per explorer instance. */
export function createTreeBuilder(): (storages: TStorage[], options: TTreeOptions) => TTree {
  const directories = new Map<string, TDirectoryNodes>()
  let last: {
    storages: TStorage[]
    options: TTreeOptions
    tree: TTree
  } | null = null

  function unchanged(storages: TStorage[], options: TTreeOptions): boolean {
    if (
      !last ||
      last.storages !== storages ||
      last.options.forceUserHierarchy !== options.forceUserHierarchy ||
      last.options.unsortedParents !== options.unsortedParents
    ) {
      return false
    }
    // Against the previous listings, not the accumulators: a listing under no
    // current storage never gets one, so the sizes would never agree again.
    const before = last.options.listings
    if (options.listings.size !== before.size) {
      return false
    }
    for (const [dirPath, listing] of options.listings) {
      if (before.get(dirPath)?.entries !== listing.entries) {
        return false
      }
    }
    return true
  }

  function nodesFor(
    dirPath: string,
    storage: TStorage,
    storagePath: string,
    storageName: string,
    entries: readonly TStorageObject[],
  ): TDirectoryNodes {
    const cached = directories.get(dirPath)
    const reusable = cached?.storageName === storageName ? cached : undefined
    if (reusable && reusable.entries === entries) {
      return reusable
    }
    let dir: TDirectoryNodes
    if (reusable && extendsEntries(entries, reusable.entries)) {
      dir = reusable
    } else {
      dir = { entries: [], storageName, directories: [], files: [] }
      directories.set(dirPath, dir)
    }
    for (const entry of entries.slice(dir.entries.length)) {
      const node = toNode(entry, storage, storagePath, storageName)
      // A bucket lists the folder's own marker object along with its children.
      if (node.path === dirPath) {
        continue
      }
      if (node.type === 'directory') {
        dir.directories.push(node)
      } else {
        dir.files.push(node)
      }
    }
    dir.entries = entries
    dir.unsorted = undefined
    dir.sorted = undefined
    return dir
  }

  function addStorage(
    storage: TStorage,
    storagePath: string,
    options: TTreeOptions,
    tree: TTree,
  ): TreeNode {
    // Tree paths and display are keyed on `storage.name` (the host's storage name).
    // `storageName` on each node holds the csp bucket identifier for API calls
    // (e.g. S3 Bucket parameter), falling back to `storage.name` when
    // `bucketName` isn't provided.
    const storageName = storage.bucketName || storage.name
    const root: TreeNode = {
      name: storage.name,
      displayName: storage.displayName,
      path: storagePath,
      relativePath: '',
      type: 'directory',
      created: storage.created,
      modified: storage.modified,
      storageId: storage.id,
      storageName,
      storageNodeIcon: storage.type,
      storageImageUrl: storage.imageUrl,
      storageType: storage.type,
      root: true,
    }
    tree.treeMap[storagePath] = root

    // Storage roots are always `user/name/`, so no root is a prefix of another.
    for (const [dirPath, listing] of options.listings) {
      if (!dirPath.startsWith(storagePath)) {
        continue
      }
      const children = childrenOf(
        nodesFor(dirPath, storage, storagePath, storageName, listing.entries),
        !options.unsortedParents?.has(dirPath),
      )
      if (children.length === 0) {
        continue
      }
      for (const node of children) {
        tree.treeMap[node.path] = node
      }
      tree.parentToChildrenMap[dirPath] = children
    }
    return root
  }

  return (storages, options) => {
    if (last && unchanged(storages, options)) {
      return last.tree
    }
    const tree: TTree = { treeMap: {}, parentToChildrenMap: {}, rootNodes: [] }

    const onlyStorage = storages.length === 1 ? storages[0] : undefined
    if (onlyStorage && !options.forceUserHierarchy) {
      const storagePath = ensureTrailingSlash(
        onlyStorage.user ? `${onlyStorage.user}/${onlyStorage.name}` : onlyStorage.name,
      )
      tree.rootNodes.push(addStorage(onlyStorage, storagePath, options, tree))
    } else {
      const userGroups: Record<string, TStorage[]> = {}
      for (const storage of storages) {
        const username = storage.user ?? ''
        if (!userGroups[username]) {
          userGroups[username] = []
        }
        userGroups[username].push(storage)
      }

      for (const username of Object.keys(userGroups)) {
        const userPath = ensureTrailingSlash(username)
        const userNode: TreeNode = {
          name: username,
          path: userPath,
          type: 'directory',
          displayName: username,
        }
        tree.treeMap[userPath] = userNode
        tree.rootNodes.push(userNode)
        const storageRoots = (userGroups[username] ?? []).map((storage) =>
          addStorage(
            storage,
            ensureTrailingSlash(`${userPath}${removeLeadingAndTrailingSlashes(storage.name)}`),
            options,
            tree,
          ),
        )
        tree.parentToChildrenMap[userPath] = storageRoots.sort(compareNodes)
      }
    }

    for (const dirPath of directories.keys()) {
      if (!options.listings.has(dirPath)) {
        directories.delete(dirPath)
      }
    }
    last = { storages, options, tree }
    return tree
  }
}

export function getNodeChildren(
  parentToChildrenMap: Record<string, TreeNode[]>,
  parentPath: string,
): TreeNode[] {
  const normalizedParentPath = parentPath.endsWith('/') ? parentPath : `${parentPath}/`

  return parentToChildrenMap[normalizedParentPath] || []
}

export function getParentPath(currentPath: string): string {
  const parentPath = ensureTrailingSlash(removeLastPathSegment(currentPath))
  return parentPath
}

export type DirectoryNameError = 'reserved' | 'separator' | 'exists'

export function getDirectoryNameError(
  name: string,
  siblings: TreeNode[],
): DirectoryNameError | null {
  if (name === '.' || name === '..') {
    return 'reserved'
  }
  if (name.includes('/') || name.includes('\\')) {
    return 'separator'
  }
  if (siblings.some((node) => node.name === name)) {
    return 'exists'
  }
  return null
}

export function getDirectoryObjectPath(parentNode: TreeNode, directoryName: string): string {
  const parentPath = parentNode.root
    ? ''
    : removeLeadingAndTrailingSlashes(parentNode.relativePath ?? '')
  return parentPath ? `${parentPath}/${directoryName}/` : `${directoryName}/`
}

export async function getUploadNodesFromDataTransferItems(
  items: DataTransferItemList,
): Promise<{ uploadNodes: UploadNode[]; totalSize: number }> {
  const uploadNodes: UploadNode[] = []
  let totalSize = 0

  async function traverse(entry: FileSystemEntry, path = ''): Promise<void> {
    return new Promise((resolve, reject) => {
      if (entry.isFile) {
        ;(entry as FileSystemFileEntry).file((file: File) => {
          uploadNodes.push({
            name: file.name,
            file,
            relativePath: path ? path + file.name : file.name,
          })
          totalSize += file.size
          resolve()
        }, reject)
      } else if (entry.isDirectory) {
        const dirReader = (entry as FileSystemDirectoryEntry).createReader()
        dirReader.readEntries(async (entries: FileSystemEntry[]) => {
          const newPath = path ? `${path + entry.name}/` : `${entry.name}/`
          if (entries.length === 0) {
            uploadNodes.push({
              name: entry.name,
              file: new Blob(),
              relativePath: newPath,
            })
          } else {
            for (const entry of entries) {
              await traverse(entry, newPath)
            }
          }
          resolve()
        }, reject)
      } else {
        resolve()
      }
    })
  }

  const entries: FileSystemEntry[] = []
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    const entry = item?.webkitGetAsEntry?.() as FileSystemEntry | undefined
    if (entry) {
      entries.push(entry)
    }
  }

  for (const entry of entries) {
    await traverse(entry)
  }

  return { uploadNodes, totalSize }
}

export function calculateUploadNodesTotalSize(uploadNodes: UploadNode[]): number {
  return uploadNodes.reduce((total, node) => {
    return total + (node.file?.size || 0)
  }, 0)
}

export function getObjectKeyFromNode(node: TreeNode): string {
  return node.relativePath || node.path.split('/').filter(Boolean).slice(1).join('/')
}

// A browser ignores an <a download> filename when the href is cross-origin, and
// every bucket URL is, so the name has to be signed into the URL instead.
// RFC 6266: quoted-string cannot hold non-ASCII, and filename* carries it.
export function attachmentDisposition(filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, '_')
  // encodeURIComponent leaves ' ( ) * alone, none of which are RFC 8187
  // attr-chars, and a bare ' is a third ext-value delimiter that makes the
  // browser discard filename* and fall back to the ASCII-only name.
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  )
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

// Without the trailing slash, `logs` also enumerates `logs-archive/`, so a
// delete would reach outside the folder the user picked.
export function getDirectoryPrefixFromNode(node: TreeNode): string {
  const key = getObjectKeyFromNode(node)
  if (!key) {
    throw new Error(`Cannot resolve an object prefix for ${node.path}`)
  }
  return ensureTrailingSlash(key)
}

export function pruneNodesInsideSelectedDirectories(nodes: TreeNode[]): TreeNode[] {
  const directoryPaths = nodes
    .filter((node) => node.type === 'directory')
    .map((node) => ensureTrailingSlash(node.path))

  return nodes.filter(
    (node) =>
      !directoryPaths.some(
        (directoryPath) => node.path !== directoryPath && node.path.startsWith(directoryPath),
      ),
  )
}

export async function collectObjectKeysToDelete(
  nodes: TreeNode[],
  listKeysUnderPrefix: (prefix: string) => Promise<string[]>,
): Promise<string[]> {
  const keys = new Set<string>()

  for (const node of nodes) {
    if (node.type !== 'directory') {
      keys.add(getObjectKeyFromNode(node))
      continue
    }
    const prefix = getDirectoryPrefixFromNode(node)
    const found = await listKeysUnderPrefix(prefix)
    // The directory marker is kept, unlike the CLI's listing filter: leaving it
    // behind makes the emptied folder reappear as a tree entry.
    for (const key of found.filter((key) => key.startsWith(prefix))) {
      keys.add(key)
    }
  }

  return Array.from(keys)
}

export function getUriScheme(uri: string): string {
  return uri.match(/^([a-z0-9+.-]+):\/\//i)?.[1] ?? ''
}

export function removeLeadingSlash(path: string): string {
  return path.replace(/^\/+/, '')
}

function removeTrailingSlash(path: string): string {
  return path.replace(/\/$/, '')
}

export function removeLeadingAndTrailingSlashes(path: string): string {
  return path.replace(/^\/+|\/+$/g, '')
}

function removeLastPathSegment(path: string): string {
  return path.replace(/\/[^/]+\/?$/, '')
}

export function ensureTrailingSlash(path: string): string {
  return path.endsWith('/') ? path : `${path}/`
}

export function isClientValid(client: IFileExplorerClient): boolean {
  if (!client?.getExpiresAt) {
    return false
  }
  const expiresAt = client.getExpiresAt()
  return expiresAt && expiresAt > new Date()
}

export function getUploadSessionETA(
  totalLoadedBytes: number,
  totalSizeBytes: number,
  lastProgressTime?: number,
  lastProgressBytes?: number,
): {
  estimatedSecondsLeft?: number
  lastProgressTime: number
  lastProgressBytes: number
  shouldUpdateETA: boolean
} {
  const now = Date.now()
  const MAX_ETA_SECONDS = 86400 // 24 hours

  if (!lastProgressTime || !lastProgressBytes) {
    return {
      lastProgressTime: now,
      lastProgressBytes: totalLoadedBytes,
      shouldUpdateETA: false,
    }
  }

  const timeDiff = now - lastProgressTime
  const bytesDiff = totalLoadedBytes - lastProgressBytes

  // Update every 1 second
  if (timeDiff < 1000) {
    return {
      lastProgressTime,
      lastProgressBytes,
      shouldUpdateETA: false,
    }
  }

  if (bytesDiff > 0 && timeDiff > 0) {
    const bytesPerSecond = (bytesDiff / timeDiff) * 1000
    const remainingBytes = totalSizeBytes - totalLoadedBytes

    if (remainingBytes <= 0) {
      return {
        estimatedSecondsLeft: 0,
        lastProgressTime: now,
        lastProgressBytes: totalLoadedBytes,
        shouldUpdateETA: true,
      }
    }

    let eta = Math.ceil(remainingBytes / bytesPerSecond)
    eta = Math.max(1, Math.min(eta, MAX_ETA_SECONDS))

    return {
      estimatedSecondsLeft: eta,
      lastProgressTime: now,
      lastProgressBytes: totalLoadedBytes,
      shouldUpdateETA: true,
    }
  }

  // No progress made, keep existing values
  return {
    lastProgressTime,
    lastProgressBytes,
    shouldUpdateETA: false,
  }
}

export function formatETA(seconds: number): string {
  if (seconds <= 0) {
    return 'Almost done'
  }
  if (seconds < 5) {
    return 'Few seconds'
  }
  if (seconds < 60) {
    return `~ ${seconds}s`
  }
  if (seconds < 3600) {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return secs > 0 ? `~ ${mins}m ${secs}s` : `~ ${mins}m`
  }

  const hours = Math.floor(seconds / 3600)
  const mins = Math.ceil((seconds % 3600) / 60)
  return `~ ${hours}h ${mins}m`
}
