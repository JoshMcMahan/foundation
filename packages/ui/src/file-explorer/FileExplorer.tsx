import { Menu, MenuButton, MenuItem, MenuItems, MenuSeparator } from '@headlessui/react'
import cx from 'classnames'
import { DateTime } from 'luxon'
import { Resizable } from 're-resizable'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useEffectEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { ConfirmModal } from '../components/ConfirmModal'
import CopyToClipboard, { CopyCodeBlock } from '../components/CopyToClipboard'
import { CreateModal } from '../components/CreateModal'
import { keyedByContent } from '../components/keys'
import Loader from '../components/Loader'
import { useNotify, useSlots, useStrings } from '../components/Provider'
import { StatusBadge } from '../components/StatusBadge'
import { Table } from '../components/Table'
import { TOOLTIP_ID, TooltipInfo } from '../components/Tooltip'
import {
  AccessIcon,
  AlertIcon,
  AngleDownIcon,
  ChevronRightIcon,
  ClipboardIcon,
  CollapseIcon,
  DownloadFileIcon,
  EyeIcon,
  FileIcon,
  FileTextIcon,
  FolderIcon,
  LinkIcon,
  RefreshIcon,
  ShareIcon,
  TrashIcon,
  UploadIcon,
} from '../icons'
import {
  assembleRowMenu,
  ListActionsHeader,
  ListSkeleton,
  listTableFixedProps,
  listTableProps,
  type RowAction,
  type RowMenuItem,
  useCopySubmenu,
  useRowMenu,
} from '../list/index'
import { useFileExplorer } from './FileExplorerContext'
import { FilePreview } from './FilePreview'
import { FilePreviewInline } from './FilePreview/Inline'
import { clearPreviewCache } from './FilePreview/previewCache'
import { canPreview, PREVIEW_URL_EXPIRES_IN } from './FilePreview/previewType'
import { UserRow } from './FileRow'
import { FileTable } from './FileTable'
import { FileTableHeaders } from './FileTableHeaders'
import {
  DragDropZone,
  getNodeIcon,
  NoDataAvailablePreview,
  NoFileSelectedPreview,
  NotFoundPreview,
  renderUploadNodes,
  ShareFileButton,
  SIDEBAR_WIDTH_DEFAULT,
  SIDEBAR_WIDTH_STORAGE_KEY,
} from './helpers'
import { CorsError } from './lib/errors'
import type { IFileExplorerClient, IFileExplorerProvider } from './lib/fileExplorer'
import {
  advanceListing,
  beginLoadingMore,
  canAutoLoadMore,
  clearListingError,
  clearListingsUnder,
  hasMore,
  incompletePaths,
  isListed,
  isLoadingMore,
  loadMoreError,
  nextHydrationStep,
  recordListingError,
  replaceListing,
  type TListings,
} from './lib/paging'
import type { ExplorerObject, TreeNode, TStorage, UploadNode } from './lib/types'
import {
  calculateUploadNodesTotalSize,
  createTreeBuilder,
  formatFileSize,
  getDirectoryNameError,
  getDirectoryObjectPath,
  getNodeChildren,
  getObjectKeyFromNode,
  getParentPath,
  getUploadNodesFromDataTransferItems,
  getUriScheme,
  pruneNodesInsideSelectedDirectories,
  removeLeadingAndTrailingSlashes,
} from './lib/utils'
import { TreeView } from './TreeView'

function UriCard({ value }: { value: string }) {
  const t = useStrings().fileExplorer
  const scheme = getUriScheme(value)
  return (
    <CopyToClipboard
      text={value}
      showIcon={false}
      className="group flex items-stretch rounded-lg border theme-border bg-(--theme-input-bg) overflow-hidden cursor-copy hover:border-(--theme-link)/50 transition-colors duration-150"
    >
      {scheme && (
        <span className="shrink-0 inline-flex items-center px-3 bg-(--theme-muted-panel-bg) border-r theme-border font-mono text-[11px] font-semibold uppercase tracking-widest theme-muted-text">
          {scheme}
        </span>
      )}
      <span className="flex-1 min-w-0 inline-flex items-center px-3 py-2 font-mono text-[12.5px] leading-snug break-all text-(--theme-input)">
        {value}
      </span>
      <span
        className="shrink-0 inline-flex items-center justify-center px-3 border-l theme-border theme-muted-text group-hover:text-(--theme-link) group-hover:bg-(--theme-link)/5 transition-colors duration-150"
        title={t.chrome.copyToClipboard}
      >
        <ClipboardIcon className="h-3.5 w-3.5" />
      </span>
    </CopyToClipboard>
  )
}

interface IFileExplorerProps {
  storages: TStorage[]
  /** Resolves the storage's injected provider pair; the host owns caching. */
  getProviderAndClient: (storage: TStorage) => Promise<{
    provider: IFileExplorerProvider | null
    client: IFileExplorerClient | null
  }>
  onRefresh?: () => void
  /** Handles activating a file instead of previewing it. Lets a host embed the
   * explorer as a file picker (the notebook editor opens .ipynb this way);
   * return false to fall through to the built-in preview. */
  onOpenFile?: ((node: TreeNode, storage: TStorage | undefined) => boolean) | undefined
  showUserHierarchy?: boolean
  groups?: { name: string; id?: string | undefined }[] | undefined
  groupsLoading?: boolean
  selectedPath: string
  onPathChange: (path: string) => void
  /** Renders only the tree, for a host that embeds it as a navigator and owns
   * the pane beside it (the notebooks page puts its editor there). The host
   * also owns the width, so the tree fills its container instead of carrying
   * its own resize handle. */
  treeOnly?: boolean
  /** Changes when the host has written into the selected folder outside the
   * explorer's own upload flow, so the folder is re-listed and shows the file. */
  refreshKey?: unknown
  /** Seeds the expanded folders on mount, so a host can restore the tree's open
   * state across reloads. Read once; the explorer owns the set from then on. */
  initialExpandedPaths?: readonly string[]
  /** Fires whenever the expanded folders change, for the host to persist. */
  onExpandedPathsChange?: (paths: string[]) => void
  /** URIs that name an object, shown on its details and offered under Copy;
   * the first is what Copy URI copies. None hides them. */
  objectUris?: ((storage: TStorage, key: string) => string[]) | undefined
  /** A shell command that downloads files, offered beside the browser
   * download. An empty command hides it for that selection. */
  downloadCommand?: { label: string; build: (objects: ExplorerObject[]) => string } | undefined
}

function isStorageDirectory(
  node: TreeNode | null,
): node is TreeNode & { storageId: string; type: 'directory' } {
  return node?.type === 'directory' && !!node.storageId
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** Directory paths from the storage root down to `path`. */
function getAncestorDirPaths(path: string): string[] {
  const isDir = path.endsWith('/')
  const normalized = isDir ? path.slice(0, -1) : path
  const segments = normalized.split('/').filter(Boolean)
  const dirSegmentCount = isDir ? segments.length : segments.length - 1
  const ancestors: string[] = []
  for (let i = 1; i <= dirSegmentCount; i++) {
    ancestors.push(segments.slice(0, i).join('/') + '/')
  }
  return ancestors
}

/** The tree's width is the host's when the tree is embedded on its own, and this
 * component's when it is showing the details pane beside it. */
function TreeFrame({
  treeOnly,
  sidebarWidth,
  onWidthChange,
  children,
}: {
  treeOnly: boolean
  sidebarWidth: number
  onWidthChange: (next: (prev: number) => number) => void
  children: ReactNode
}) {
  if (treeOnly) {
    return <div className="h-full w-full min-w-0">{children}</div>
  }
  return (
    <Resizable
      size={{ width: sidebarWidth, height: '100%' }}
      minWidth={200}
      maxWidth={800}
      enable={{
        top: false,
        right: true,
        bottom: false,
        left: false,
        topRight: false,
        bottomRight: false,
        bottomLeft: false,
        topLeft: false,
      }}
      onResizeStop={(_e, _direction, _ref, d) => {
        onWidthChange((prev) => prev + d.width)
      }}
    >
      {children}
    </Resizable>
  )
}

// This won't have references because it's lazily loaded
export default function FileExplorer({
  storages,
  onRefresh,
  refreshKey,
  onOpenFile,
  showUserHierarchy = false,
  groups = [],
  groupsLoading = false,
  selectedPath,
  onPathChange,
  getProviderAndClient,
  treeOnly = false,
  initialExpandedPaths,
  onExpandedPathsChange,
  objectUris,
  downloadCommand,
}: IFileExplorerProps) {
  const copySubmenu = useCopySubmenu()
  const t = useStrings().fileExplorer
  const notify = useNotify()
  const slots = useSlots()

  const fileExplorerContext = useFileExplorer()

  // A path with a record was tried; `isListed` says whether a page landed.
  const [listings, setListings] = useState<TListings>(() => new Map())
  // Claimed synchronously, so the hydration walk and the sentinels can tell
  // "in flight" from "already tried and failed". Holds the newest request per
  // path, which is the only one allowed to write the path's record.
  const fetchesInFlightRef = useRef(new Map<string, object>())
  // Held stable while the contents hold: treeMap depends on this, and flipping
  // loadingMore leaves the cursor set identical.
  const incompleteDirsRef = useRef<Set<string>>(new Set())
  const incompleteDirs = useMemo(() => {
    const next = incompletePaths(listings)
    const previous = incompleteDirsRef.current
    if (previous.size === next.size && [...next].every((p) => previous.has(p))) {
      return previous
    }
    incompleteDirsRef.current = next
    return next
  }, [listings])

  const [buildTree] = useState(createTreeBuilder)
  const { treeMap, parentToChildrenMap, rootNodes } = useMemo(
    () =>
      buildTree(storages, {
        listings,
        forceUserHierarchy: showUserHierarchy,
        unsortedParents: incompleteDirs,
      }),
    [buildTree, storages, listings, showUserHierarchy, incompleteDirs],
  )

  const [loadingPaths, setLoadingPaths] = useState<Set<string>>(new Set())

  // The router may strip trailing slashes on directory paths; tree keys
  // carry them for dirs. Prefer the dir form when both the raw value and
  // a directory counterpart exist, so selection stays consistent.
  const normalizedSelectedPath = useMemo(() => {
    if (!selectedPath) {
      return ''
    }
    if (selectedPath.endsWith('/')) {
      return selectedPath
    }
    if (treeMap[selectedPath]) {
      return selectedPath
    }
    return `${selectedPath}/`
  }, [selectedPath, treeMap])
  const setSelectedPath = onPathChange

  // A Set, not an array: membership is tested once per tree row, so an array scan
  // made expansion O(rows x expanded).
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(
    () => new Set(['', ...(initialExpandedPaths ?? [])]),
  )
  const onExpandedPathsChangeRef = useRef(onExpandedPathsChange)
  onExpandedPathsChangeRef.current = onExpandedPathsChange
  useEffect(() => {
    onExpandedPathsChangeRef.current?.([...expandedPaths])
  }, [expandedPaths])
  const selectedNode = useMemo<TreeNode | null>(
    () => (normalizedSelectedPath ? (treeMap[normalizedSelectedPath] ?? null) : null),
    [normalizedSelectedPath, treeMap],
  )
  const seenRefreshKey = useRef(refreshKey)
  useEffect(() => {
    if (refreshKey === seenRefreshKey.current) {
      return
    }
    seenRefreshKey.current = refreshKey
    if (selectedNode?.type === 'directory' && selectedNode.storageId) {
      void fetchNodeChildren(selectedNode, { replace: true })
    }
  }, [refreshKey, selectedNode])
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set())
  // The path is a prop the router owns, so back and forward move it with none of
  // the handlers here running. Compared against the raw prop, not the normalized
  // one, which also recomputes when the tree fills in.
  const [checkedItemsPath, setCheckedItemsPath] = useState(selectedPath)
  if (checkedItemsPath !== selectedPath) {
    setCheckedItemsPath(selectedPath)
    setCheckedItems(new Set())
  }
  const selectedNodeChildren = useMemo(
    () => (selectedNode ? getNodeChildren(parentToChildrenMap, selectedNode.path) : []),
    [parentToChildrenMap, selectedNode],
  )
  const storageCanWrite = (storageId?: string) =>
    storages.find((s) => s.id === storageId)?.canWrite === true
  const storageCanUpload = (storageId?: string) =>
    storages.find((s) => s.id === storageId)?.canUpload !== false
  const selectedStorage = storages.find((s) => s.id === selectedNode?.storageId)
  const selectedNodeCanWrite = selectedStorage?.canWrite === true
  const selectedNodeCanUpload = selectedStorage?.canUpload !== false
  const selectedNodeCanShare = selectedStorage?.canShare !== false
  const selectedNodeCanManageAccess = selectedStorage?.canManageAccess !== false
  const [accessDrawerOpen, setAccessDrawerOpen] = useState(false)
  const [connectionIssuesMessage, updateConnectionIssuesMessage] = useState<
    Map<string, string | null>
  >(new Map())
  const [hasCorsIssue, setHasCorsIssue] = useState<Map<string, boolean>>(new Map())

  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [createFolderTarget, setCreateFolderTarget] = useState<TreeNode | null>(null)
  const [pendingUpload, setPendingUpload] = useState<{
    targetPath: string
    uploadNodes: UploadNode[]
    totalSize: number
  } | null>(null)
  const [waitForUpload, setWaitForUpload] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)

  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<TreeNode[] | null>(null)

  const [previewNode, setPreviewNode] = useState<TreeNode | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [detailTab, setDetailTab] = useState<'details' | 'preview'>('details')

  useEffect(() => clearPreviewCache, [])
  const { openMenu, contextMenu } = useRowMenu()

  const [sidebarWidth, setSidebarWidth] = useLocalStorage(
    SIDEBAR_WIDTH_STORAGE_KEY,
    SIDEBAR_WIDTH_DEFAULT,
  )

  const MAX_UPLOAD_SIZE = 80 * 1024 * 1024 * 1024 // 80 GB
  const isUploadSizeExceeded = (size: number) => {
    return size > MAX_UPLOAD_SIZE
  }

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev)
      if (!next.delete(path)) {
        next.add(path)
      }
      return next
    })
  }, [])

  const collapseAll = useCallback(() => {
    setExpandedPaths(new Set(['']))
  }, [])

  const getStorageProviderAndClient = async (storageId: string | undefined) => {
    const storage = storages.find((s) => s.id === storageId)
    if (!storage) {
      notify.error(t.messages.storageUnavailable)
      return
    }
    const { provider, client } = await getProviderAndClient(storage).catch(() => ({
      provider: null,
      client: null,
    }))
    if (!provider || !client) {
      const message = t.messages.connectFailed
      updateConnectionIssuesMessage((prev) => new Map(prev).set(storage.id, message))
      return null
    }

    updateConnectionIssuesMessage((prev) => {
      const next = new Map(prev)
      next.delete(storage.id)
      return next
    })
    return { storage, provider, client }
  }

  // useEffectEvent: a fresh identity every render would loop the effects calling it.
  const fetchNodeChildren = useEffectEvent(
    async (
      node: TreeNode,
      options?: {
        replace?: boolean
        silent?: boolean | undefined
        more?: boolean
      },
    ): Promise<{ corsError: boolean }> => {
      const more = options?.more ?? false
      // `silent` cannot apply to a load-more: it skips the bookkeeping below, which
      // would leave the sentinel spinning on a page that already landed.
      const silent = !more && (options?.silent ?? false)
      const nodeStorageId = node.storageId ?? ''

      // A ref, not state: state lags a render, so two observer fires in one tick would
      // append the same page. A refresh is the user asking again, so it is not dropped.
      if (!options?.replace && fetchesInFlightRef.current.has(node.path)) {
        return { corsError: false }
      }
      // A silent probe writes nothing, so it never takes the path over from a
      // request that does.
      const request = silent ? undefined : {}
      if (request) {
        fetchesInFlightRef.current.set(node.path, request)
      }
      const owns = () =>
        request !== undefined && fetchesInFlightRef.current.get(node.path) === request

      if (more) {
        setListings((prev) => beginLoadingMore(prev, node.path))
      } else if (request) {
        setLoadingPaths((prev) => new Set(prev).add(node.path))
      }

      const cursor = more ? listings.get(node.path)?.cursor : undefined

      try {
        const factory = await getStorageProviderAndClient(node.storageId)
        if (!factory) {
          // Thrown, not returned: loadingMore is already set and only the catch below
          // clears it, so returning wedged the folder on a spinning sentinel.
          throw new Error('Failed to connect to storage provider.')
        }
        const { storage, provider, client } = factory

        if (provider?.listDirectoryInput && provider?.convertDataToStorageObjects) {
          const dir_path = node.root ? '' : (node.relativePath ?? '')
          const input = provider.listDirectoryInput(storage, dir_path, cursor ? { cursor } : {})
          const objects = await client.listDirectory(input)
          const entries = provider.convertDataToStorageObjects(objects)
          const nextCursor = provider.nextPageCursor?.(objects)

          if (owns()) {
            const page = { entries, cursor: nextCursor }
            setListings((prev) =>
              options?.replace
                ? replaceListing(prev, node.path, page)
                : advanceListing(prev, node.path, page),
            )
          }
        }
        if (owns()) {
          setHasCorsIssue((prev) => {
            if (!prev.has(nodeStorageId)) {
              return prev
            }
            const next = new Map(prev)
            next.delete(nodeStorageId)
            return next
          })
        }
        return { corsError: false }
      } catch (error) {
        const isCorsError = error instanceof CorsError
        const errorMessage = isCorsError
          ? error.message || 'CORS error'
          : error instanceof Error
            ? error.message
            : 'Unknown error'
        // Every owned failure, not just a page: the storage-level banner only
        // renders on an empty folder, and this is what re-runs the hydration walk.
        // A failed re-list drops the old rows so the banner has that empty folder.
        if (owns()) {
          setListings((prev) =>
            recordListingError(
              options?.replace ? clearListingsUnder(prev, node.path) : prev,
              node.path,
              errorMessage,
            ),
          )
          updateConnectionIssuesMessage((prev) =>
            new Map(prev).set(
              nodeStorageId,
              `Failed to load contents for ${node?.displayName || node?.name}: ${errorMessage}`,
            ),
          )
          if (isCorsError) {
            setHasCorsIssue((prev) => new Map(prev).set(nodeStorageId, true))
          }
        }
        return { corsError: isCorsError }
      } finally {
        if (owns()) {
          fetchesInFlightRef.current.delete(node.path)
          if (!more) {
            setLoadingPaths((prev) => {
              const next = new Set(prev)
              next.delete(node.path)
              return next
            })
          }
        }
      }
    },
  )

  const handleSelectTreeItem = async (path: string, node: TreeNode) => {
    if (normalizedSelectedPath !== path) {
      setCheckedItems(new Set())
      setDetailTab('details')
    }
    setSelectedPath(path)
    if (node.type === 'directory' && node?.storageId && !isListed(listings, path)) {
      await fetchNodeChildren(node)
    }
  }

  useEffect(() => {
    if (!normalizedSelectedPath) {
      return
    }
    const ancestors = getAncestorDirPaths(normalizedSelectedPath)
    if (ancestors.length === 0) {
      return
    }
    setExpandedPaths((prev) => {
      if (ancestors.every((p) => prev.has(p))) {
        return prev
      }
      const next = new Set(prev)
      for (const p of ancestors) {
        next.add(p)
      }
      return next
    })
  }, [normalizedSelectedPath])

  // One request per run, each settling into an update that re-triggers this effect
  // until the chain resolves or reports itself stuck. useLayoutEffect so
  // setLoadingPaths commits before paint, or a deep-linked directory flashes "No
  // files". Keyed by target, so selecting anything else reads as un-stuck without
  // a reset effect.
  const [stuck, setStuck] = useState<{
    target: string
    deepest: string
  } | null>(null)
  const hydrationStuck = stuck?.target === normalizedSelectedPath
  const hydrationPagesRef = useRef({ path: '', pages: 0 })
  useLayoutEffect(() => {
    if (!normalizedSelectedPath) {
      return
    }
    if (hydrationPagesRef.current.path !== normalizedSelectedPath) {
      hydrationPagesRef.current = { path: normalizedSelectedPath, pages: 0 }
    }
    const step = nextHydrationStep({
      targetResolved: !!treeMap[normalizedSelectedPath],
      ancestors: getAncestorDirPaths(normalizedSelectedPath),
      isListableDir: (path: string) => {
        const node = treeMap[path]
        return !!node && node.type === 'directory' && !!node.storageId
      },
      listings,
      inFlight: fetchesInFlightRef.current,
      pagesPulled: hydrationPagesRef.current.pages,
    })
    if (step.kind === 'stuck') {
      setStuck({ target: normalizedSelectedPath, deepest: step.path })
      return
    }
    if (step.kind === 'done') {
      return
    }
    const node = treeMap[step.path]
    if (!node) {
      return
    }
    if (step.kind === 'fetch') {
      fetchNodeChildren(node)
      return
    }
    hydrationPagesRef.current.pages += 1
    fetchNodeChildren(node, { more: true })
  }, [normalizedSelectedPath, treeMap, listings])

  // ArrowRight and a spring-loaded drag only flip expandedPaths, unlike selecting a
  // folder, so expanding has to guarantee a listing on its own.
  useEffect(() => {
    for (const path of expandedPaths) {
      const node = treeMap[path]
      if (
        node?.type === 'directory' &&
        node.storageId &&
        !listings.has(path) &&
        !fetchesInFlightRef.current.has(path)
      ) {
        fetchNodeChildren(node)
        return
      }
    }
  }, [expandedPaths, treeMap, listings])

  // Derived from the counts, never the checkbox's own `checked`: while pages remain
  // the box renders indeterminate-but-unchecked, so every click reports `checked`.
  const handleBatchCheckbox = () => {
    if (selectedNode?.type !== 'directory') {
      return
    }
    const selectAll = selectedInFolderCount < selectedNodeChildren.length
    const newCheckedItems = new Set(checkedItems)
    for (const item of selectedNodeChildren) {
      if (selectAll) {
        newCheckedItems.add(item.path)
      } else {
        newCheckedItems.delete(item.path)
      }
    }
    setCheckedItems(newCheckedItems)
  }

  const handleItemCheckbox = (node: TreeNode, isChecked: boolean) => {
    setCheckedItems((prev) => {
      const newCheckedItems = new Set(prev)
      if (isChecked) {
        newCheckedItems.add(node.path)
      } else {
        newCheckedItems.delete(node.path)
      }
      return newCheckedItems
    })
  }

  // Counted per state change, not per render: an inline .every() would walk every
  // row of the folder on each FileExplorer render.
  const selectedInFolderCount = useMemo(
    () =>
      selectedNodeChildren.reduce(
        (count, item) => (checkedItems.has(item.path) ? count + 1 : count),
        0,
      ),
    [selectedNodeChildren, checkedItems],
  )
  const folderHasMore = selectedNode ? hasMore(listings, selectedNode.path) : false
  // Never fully checked while pages are missing: the Delete and download paths read
  // this, and "everything" over page 1 of 200 deletes less than the user agreed to.
  const allItemsSelected =
    selectedNodeChildren.length > 0 &&
    selectedInFolderCount === selectedNodeChildren.length &&
    !folderHasMore
  const loadMoreProps =
    selectedNode && folderHasMore
      ? {
          loading: isLoadingMore(listings, selectedNode.path),
          error: loadMoreError(listings, selectedNode.path),
          auto: canAutoLoadMore(listings, selectedNode.path),
          onLoadMore: () => {
            fetchNodeChildren(selectedNode, { more: true })
          },
        }
      : undefined

  const treePaging = {
    incompletePaths: incompleteDirs,
    isLoading: (path: string) => isLoadingMore(listings, path),
    hasFailed: (path: string) => !!loadMoreError(listings, path),
    onLoadMore: (node: TreeNode) => {
      fetchNodeChildren(node, { more: true })
    },
  }

  const onDropFiles = async (targetPath: string, files: FileList | DataTransferItemList) => {
    const targetStorageId = treeMap[targetPath]?.storageId
    if (!storageCanWrite(targetStorageId)) {
      notify.error(t.messages.noWriteAccess)
      return
    }
    if (!storageCanUpload(targetStorageId)) {
      notify.error(t.messages.uploadsUnsupported)
      return
    }

    let uploadNodes: UploadNode[] = []
    let totalSize = 0

    if (waitForUpload) {
      notify.warning(t.messages.waitForCurrentUpload)
      return
    }

    setWaitForUpload(true)

    const isDirectoryUploadSupported =
      files instanceof DataTransferItemList &&
      files.length &&
      files[0] &&
      typeof (files[0] as DataTransferItem).webkitGetAsEntry === 'function'

    if (isDirectoryUploadSupported) {
      const prepareData = await getUploadNodesFromDataTransferItems(files as DataTransferItemList)
      uploadNodes = prepareData.uploadNodes
      totalSize = prepareData.totalSize
    } else {
      uploadNodes = Array.from(files as FileList).map((file) => ({
        name: file.name,
        file,
        relativePath: file.name,
      }))
      totalSize = calculateUploadNodesTotalSize(uploadNodes)
    }

    setPendingUpload({
      targetPath,
      uploadNodes,
      totalSize,
    })
    setUploadModalOpen(true)
    setWaitForUpload(false)
  }

  const hasFolderSelected = (): boolean => {
    if (checkedItems.size > 0) {
      return Array.from(checkedItems)
        .map((path) => treeMap[path])
        .some((node) => node && node.type === 'directory')
    }
    if (selectedNode && selectedNode.type === 'directory') {
      return true
    }
    return false
  }

  const handleDownload = async () => {
    let filesToDownload: TreeNode[] = []
    if (checkedItems.size > 0) {
      filesToDownload = Array.from(checkedItems)
        .map((path) => treeMap[path])
        .filter((node): node is TreeNode => !!node && node.type === 'file')
    } else if (selectedNode && selectedNode.type === 'file') {
      filesToDownload = [selectedNode]
    }

    if (filesToDownload.length === 0) {
      notify.error(t.messages.noFilesForDownload)
      return
    }

    const factory = await getStorageProviderAndClient(filesToDownload[0]!.storageId)
    if (!factory) {
      return
    }
    const { provider, client } = factory

    if (!provider?.getFileInput) {
      notify.error(t.messages.downloadUnsupported)
      return
    }

    for (const [index, node] of filesToDownload.entries()) {
      const input = provider.getFileInput(node.storageName ?? '', node, undefined, node.name)
      const [presignedUrl, error] = await client.getFile(input)

      if (error || !presignedUrl) {
        notify.error(error?.message ?? t.messages.downloadLinkFailed)
        continue
      }

      triggerBrowserDownload(presignedUrl, node.name)

      if (index < filesToDownload.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 150))
      }
    }
  }

  const onShareFileButtonClick = async (node: TreeNode) => {
    const factory = await getStorageProviderAndClient(node.storageId)
    if (!factory) {
      return
    }

    const { provider, client } = factory

    if (!provider?.getFileInput) {
      notify.error(t.messages.sharingUnsupported)
      return
    }

    const input = provider.getFileInput(node.storageName ?? '', node)
    const [presignedUrl, error] = await client.getFile(input)

    if (error || !presignedUrl) {
      notify.error(error?.message ?? t.messages.fileLinkFailed)
      return
    }

    await navigator.clipboard.writeText(presignedUrl)
    notify.info(t.messages.fileLinkCopied)
  }

  const triggerBrowserDownload = (url: string, filename: string) => {
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    setTimeout(() => {
      document.body.removeChild(a)
    }, 300)
  }

  const getPresignedUrl = async (
    node: TreeNode,
    downloadFilename?: string,
  ): Promise<[string | null, Error | null]> => {
    const factory = await getStorageProviderAndClient(node.storageId)
    if (!factory) {
      return [null, new Error('Failed to connect to storage provider.')]
    }
    const { provider, client } = factory
    if (!provider?.getFileInput) {
      return [null, new Error('Preview is not supported for this storage.')]
    }
    const input = provider.getFileInput(
      node.storageName ?? '',
      node,
      PREVIEW_URL_EXPIRES_IN,
      downloadFilename,
    )
    return client.getFile(input)
  }

  const previewSiblings = useMemo(
    () =>
      previewNode
        ? getNodeChildren(parentToChildrenMap, getParentPath(previewNode.path)).filter(
            (n) => n.type === 'file',
          )
        : [],
    [previewNode, parentToChildrenMap],
  )

  const openPreview = (node: TreeNode) => {
    if (node.type !== 'file') {
      return
    }
    if (
      onOpenFile?.(
        node,
        storages.find((s) => s.id === node.storageId),
      )
    ) {
      return
    }
    setPreviewNode(node)
    setPreviewOpen(true)
  }

  const closePreview = () => {
    setPreviewOpen(false)
  }

  const openUserNode = (node: TreeNode) => {
    handleSelectTreeItem(node.path, node)
    if (!expandedPaths.has(node.path)) {
      handleToggleExpand(node.path)
    }
  }

  const getNodeUris = (node: TreeNode): string[] => {
    const storage = storages.find((s) => s.id === node.storageId)
    if (!storage || !objectUris) {
      return []
    }
    return objectUris(storage, getObjectKeyFromNode(node))
  }

  const copyNodeUri = async (node: TreeNode) => {
    const uri = getNodeUris(node)[0]
    if (!uri) {
      notify.error(t.messages.noUri)
      return
    }
    try {
      await navigator.clipboard.writeText(uri)
      notify.info(t.messages.uriCopied)
    } catch {
      notify.error(t.messages.uriCopyFailed)
    }
  }

  const downloadNode = async (node: TreeNode) => {
    const [presignedUrl, error] = await getPresignedUrl(node, node.name)
    if (error || !presignedUrl) {
      notify.error(error?.message ?? t.messages.downloadLinkFailed)
      return
    }
    triggerBrowserDownload(presignedUrl, node.name)
  }

  const deleteNode = (node: TreeNode) => {
    const storage = storages.find((s) => s.id === node.storageId)
    if (storage?.canWrite !== true) {
      notify.error(t.messages.noWriteAccess)
      return
    }
    setPendingDelete([node])
    setDeleteModalOpen(true)
  }

  const openCreateFolder = async (node: TreeNode) => {
    if (!isStorageDirectory(node)) {
      return
    }
    if (!isListed(listings, node.path)) {
      await fetchNodeChildren(node)
    }
    setCreateFolderTarget(node)
  }

  const getCreateFolderActions = (node: TreeNode, storage?: TStorage): RowAction[] => {
    if (node.type !== 'directory' || storage?.canWrite !== true || storage.canUpload === false) {
      return []
    }
    return [
      {
        key: 'create-folder',
        label: t.createFolder.action,
        icon: <FolderIcon />,
        onSelect: () => openCreateFolder(node),
      },
    ]
  }

  // Order: lead → actions → Copy → delete last.
  const buildRowMenu = (node: TreeNode): RowMenuItem[] => {
    const storage = storages.find((s) => s.id === node.storageId)
    const nodeCanWrite = storage?.canWrite === true
    const nodeCanShare = storage?.canShare !== false
    const isFile = node.type === 'file'
    const uris = getNodeUris(node)

    const actions: RowAction[] = []
    if (isFile && canPreview(node)) {
      actions.push({
        key: 'preview',
        label: t.preview.preview,
        icon: <EyeIcon />,
        onSelect: () => openPreview(node),
      })
    }
    if (isFile) {
      actions.push({
        key: 'download',
        label: t.preview.download,
        icon: <DownloadFileIcon />,
        onSelect: () => downloadNode(node),
      })
      if (nodeCanShare) {
        actions.push({
          key: 'share',
          label: t.preview.shareFile,
          icon: <ShareIcon />,
          onSelect: () => onShareFileButtonClick(node),
        })
      }
    }
    actions.push(...getCreateFolderActions(node, storage))
    // The storage root has no tree parent to refresh after a delete, and
    // deleting the whole storage is not a file-explorer operation — omit it.
    if (nodeCanWrite && !node.root) {
      actions.push({
        key: 'delete',
        label: t.preview.delete,
        icon: <TrashIcon />,
        destructive: true,
        onSelect: () => deleteNode(node),
      })
    }

    const lead: RowMenuItem[] = [
      {
        kind: 'action',
        label: isFile ? t.preview.viewDetails : t.preview.openFolder,
        icon: isFile ? <FileTextIcon /> : <FolderIcon />,
        onSelect: () => handleSelectTreeItem(node.path, node),
      },
    ]

    const uriExtras = uris.map((value) => ({
      label: `${getUriScheme(value).toUpperCase()} URI`,
      value,
      icon: <LinkIcon />,
    }))

    return assembleRowMenu({
      lead,
      actions,
      copy:
        uriExtras.length > 0
          ? copySubmenu({
              name: isFile ? node.name : undefined,
              extra: uriExtras,
            })
          : undefined,
    })
  }

  const openNodeContextMenu = (e: React.MouseEvent, node: TreeNode) => {
    const items = buildRowMenu(node)
    if (items.length === 0) {
      return
    }
    e.preventDefault()
    e.stopPropagation()
    openMenu(e.clientX, e.clientY, items)
  }

  // Folder path from the storage root down to the current node; segments before
  // the last navigate back up the tree.
  const renderBreadcrumb = () => {
    const chain: TreeNode[] = []
    let cur: TreeNode | undefined = selectedNode ?? undefined
    const seen = new Set<string>()
    while (cur && !seen.has(cur.path)) {
      seen.add(cur.path)
      chain.unshift(cur)
      if (cur.root) {
        break
      }
      cur = treeMap[getParentPath(cur.path)]
    }
    if (chain.length === 0) {
      return null
    }
    return (
      <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-[13px]">
        {chain.map((node, i) => {
          const isLast = i === chain.length - 1
          const label = node.displayName || node.name
          return (
            <span key={node.path} className="flex min-w-0 items-center gap-1">
              {i > 0 && (
                <ChevronRightIcon className="h-3 w-3 shrink-0 text-(--theme-muted-text-color)" />
              )}
              {isLast ? (
                <span className="truncate font-semibold text-(--theme-app)">{label}</span>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSelectTreeItem(node.path, node)}
                  className="max-w-[16rem] shrink-0 cursor-pointer truncate text-(--theme-muted-text-color) transition-colors hover:text-(--theme-app)"
                >
                  {label}
                </button>
              )}
            </span>
          )
        })}
      </nav>
    )
  }

  const generateDownloadCommand = (): string => {
    let filesToDownload: TreeNode[] = []

    if (checkedItems.size > 0) {
      filesToDownload = Array.from(checkedItems)
        .map((path) => treeMap[path])
        .filter((node): node is TreeNode => !!node && node.type === 'file')
    } else if (selectedNode && selectedNode.type === 'file') {
      filesToDownload = [selectedNode]
    }

    if (filesToDownload.length === 0) {
      return ''
    }

    if (!downloadCommand) {
      return ''
    }
    const objects = filesToDownload.flatMap((node) => {
      const storage = storages.find((s) => s.id === node.storageId)
      return storage ? [{ storage, key: getObjectKeyFromNode(node), name: node.name }] : []
    })
    return downloadCommand.build(objects)
  }

  const onDeleteClick = () => {
    if (!selectedNodeCanWrite) {
      notify.error(t.messages.noWriteAccess)
      return
    }
    let nodesToDelete: TreeNode[] = []
    if (checkedItems.size > 0) {
      nodesToDelete = Array.from(checkedItems)
        .map((path) => treeMap[path])
        .filter((node): node is TreeNode => Boolean(node))
    } else if (selectedNode) {
      nodesToDelete = [selectedNode]
    }
    setPendingDelete(pruneNodesInsideSelectedDirectories(nodesToDelete))
    setDeleteModalOpen(true)
  }

  const handlePostDelete = (selectedNode: TreeNode | null) => {
    if (!selectedNode) {
      return
    }

    if (selectedNode.type === 'file') {
      let parentPath = getParentPath(selectedNode.path)
      let parentNode = treeMap[parentPath]

      // Find the nearest non-empty folder or root
      while (parentNode) {
        const children = getNodeChildren(parentToChildrenMap, parentPath)
        if (children.length > 0) {
          break
        }
        if (parentNode.storageId && parentNode.root) {
          break
        }
        parentPath = getParentPath(parentPath)
        parentNode = treeMap[parentPath]
      }

      if (parentNode) {
        handleSelectTreeItem(parentPath, parentNode)
      }
    } else if (selectedNode.type === 'directory') {
      // Go back to parent folder if all children are deleted
      const currentFolderChildren = getNodeChildren(parentToChildrenMap, selectedNode.path)
      const allChildrenChecked =
        currentFolderChildren.length > 0 &&
        currentFolderChildren.every((child) => checkedItems.has(child.path))

      if (allChildrenChecked) {
        const parentPath = getParentPath(selectedNode.path)
        const parentNode = treeMap[parentPath]
        if (parentNode) {
          handleSelectTreeItem(parentPath, parentNode)
        }
      }
    }
  }

  const handleDelete = async () => {
    if (!pendingDelete || pendingDelete.length === 0) {
      notify.error(t.messages.noItemsForDeletion)
      return
    }

    const parentPath = getParentPath(pendingDelete[0]!.path)
    const parentNode = treeMap[parentPath]

    const factory = await getStorageProviderAndClient(pendingDelete[0]!.storageId)
    if (!factory) {
      return
    }
    const { storage, provider, client } = factory

    if (!provider?.deleteFilesInput) {
      notify.error(t.messages.deleteUnsupported)
      return
    }

    try {
      notify.loading(t.messages.deleting)
      const input = provider.deleteFilesInput(storage.bucketName || storage.name, pendingDelete)
      const response = await client.deleteFiles(input)
      notify.dismiss()

      // A node above the storage root (e.g. the bare user) is not in the
      // tree; skip the child refetch rather than dereference an undefined node.
      if (parentNode) {
        await fetchNodeChildren(parentNode, { replace: true })
      }

      setPendingDelete(null)
      setCheckedItems(new Set())
      setDeleteModalOpen(false)

      if (response?.Errors?.length) {
        notify.error(t.messages.deleteSomeFailed)
        return
      }

      // Only reposition when the file open in the detail pane was itself removed,
      // either deleted directly or as a descendant of a deleted folder (which the
      // provider expands, so the descendants are not in pendingDelete).
      const deletedPaths = new Set(pendingDelete.map((n) => n.path))
      const deletedDirPrefixes = pendingDelete
        .filter((n) => n.type === 'directory')
        .map((n) => (n.path.endsWith('/') ? n.path : `${n.path}/`))
      const selectedRemoved =
        !!selectedNode &&
        (deletedPaths.has(selectedNode.path) ||
          deletedDirPrefixes.some((p) => selectedNode.path.startsWith(p)))
      if (selectedNode && (selectedNode.type === 'directory' || selectedRemoved)) {
        handlePostDelete(selectedNode)
      }
      notify.success(t.messages.deleteSuccess)
    } catch (err) {
      notify.dismiss()
      notify.error(t.messages.deleteFailed(err instanceof Error ? err.message : String(err)))
    }
  }

  const handleUploadInputChange = (files: FileList | null, selectedNode: TreeNode | null) => {
    if (!files || !selectedNode || selectedNode.type === 'file') {
      return
    }
    if (!storageCanWrite(selectedNode.storageId)) {
      notify.error(t.messages.noWriteAccess)
      return
    }
    if (!storageCanUpload(selectedNode.storageId)) {
      notify.error(t.messages.uploadsUnsupported)
      return
    }
    if (waitForUpload) {
      notify.warning(t.messages.waitForCurrentUpload)
      return
    }

    setWaitForUpload(true)
    const uploadNodes: UploadNode[] = Array.from(files).map((file) => ({
      name: file.name,
      file,
      relativePath: file.webkitRelativePath || file.name,
    }))
    const totalSize = calculateUploadNodesTotalSize(uploadNodes)
    setPendingUpload({
      targetPath: selectedNode.path,
      uploadNodes,
      totalSize,
    })
    setUploadModalOpen(true)
    setWaitForUpload(false)

    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
    if (folderInputRef.current) {
      folderInputRef.current.value = ''
    }
  }

  const handleUpload = async () => {
    if (!pendingUpload) {
      notify.error(t.messages.noFilesToUpload)
      return
    }
    if (waitForUpload) {
      notify.info(t.messages.waitForUpload)
      return
    }

    const targetNode = treeMap[pendingUpload.targetPath]
    if (!targetNode || !targetNode.storageId) {
      notify.error(t.messages.invalidUploadTarget)
      return
    }

    const factory = await getStorageProviderAndClient(targetNode.storageId)
    if (!factory) {
      notify.error(t.messages.connectFailed)
      return
    }
    const { storage, provider, client } = factory
    const storageName = storage.bucketName || storage.name

    const cleanTargetPath = targetNode.root
      ? ''
      : removeLeadingAndTrailingSlashes(targetNode.relativePath || '')

    if (!provider?.uploadFileInput) {
      notify.error(t.messages.uploadUnsupported)
      return
    }

    const sessionId = fileExplorerContext.addUploadSession(
      storageName,
      cleanTargetPath,
      pendingUpload.uploadNodes,
      client,
      provider,
      targetNode,
      (node) => fetchNodeChildren(node, { replace: true }),
    )

    const sessionQueueIndex = fileExplorerContext.getUploadQueueIndex(sessionId)
    if (sessionQueueIndex === -1) {
      notify.update(sessionId, {
        render: t.messages.uploadInitFailed,
        type: 'error',
        icon: null,
        isLoading: false,
        closeButton: null,
      })
      return
    } else if (
      sessionQueueIndex > 0 &&
      fileExplorerContext.uploadQueue[sessionQueueIndex - 1] !== sessionId
    ) {
      notify.update(sessionId, {
        render: t.messages.uploadQueuedInfo,
        type: 'info',
        icon: null,
        isLoading: false,
        autoClose: false,
      })
      return
    }

    setUploadModalOpen(false)
    setPendingUpload(null)
    setWaitForUpload(false)
  }

  const validateFolderName = (name: string): string | null => {
    if (createFolderTarget?.type !== 'directory') {
      return null
    }
    const error = getDirectoryNameError(
      name,
      getNodeChildren(parentToChildrenMap, createFolderTarget.path),
    )
    return error ? t.createFolder.validation[error] : null
  }

  const handleCreateFolder = async (name: string): Promise<boolean> => {
    if (!isStorageDirectory(createFolderTarget)) {
      notify.error(t.createFolder.invalidTarget)
      return false
    }
    if (!storageCanWrite(createFolderTarget.storageId)) {
      notify.error(t.createFolder.noWriteAccess)
      return false
    }
    if (!storageCanUpload(createFolderTarget.storageId)) {
      notify.error(t.createFolder.unsupported)
      return false
    }

    try {
      const factory = await getStorageProviderAndClient(createFolderTarget.storageId)
      if (!factory) {
        return false
      }
      const { storage, provider, client } = factory
      if (!provider.uploadFileInput) {
        notify.error(t.createFolder.unsupported)
        return false
      }

      const input = provider.uploadFileInput(
        storage.bucketName || storage.name,
        getDirectoryObjectPath(createFolderTarget, name),
        new Blob(),
      )
      await client.uploadFile(input)
      await fetchNodeChildren(createFolderTarget, { replace: true })
      notify.success(t.createFolder.success(name))
      return true
    } catch (error) {
      notify.error(t.createFolder.error(getErrorMessage(error)))
      return false
    }
  }

  const handleRefresh = async (opts?: { silent?: boolean }): Promise<{ corsError: boolean }> => {
    // Re-list every open folder, not just the selected one, so files written
    // outside the explorer (e.g. by a running notebook) show up wherever they
    // landed in the visible tree.
    const dirs = [...expandedPaths]
      .map((path) => treeMap[path])
      .filter((node): node is TreeNode => !!node && node.type === 'directory' && !!node.storageId)
    if (
      selectedNode?.type === 'directory' &&
      selectedNode.storageId &&
      !dirs.some((dir) => dir.path === selectedNode.path)
    ) {
      dirs.push(selectedNode)
    }
    if (dirs.length > 0) {
      const results = await Promise.all(
        dirs.map((dir) => fetchNodeChildren(dir, { replace: true, silent: opts?.silent })),
      )
      return { corsError: results.some((result) => result.corsError) }
    }
    if (onRefresh) {
      // only for user nodes in the unified explorer
      onRefresh()
    }
    return { corsError: false }
  }

  return (
    <div className="w-full h-full flex relative">
      <div className="w-full h-full flex">
        <TreeFrame treeOnly={treeOnly} sidebarWidth={sidebarWidth} onWidthChange={setSidebarWidth}>
          {/* File Tree - Left sidebar */}
          <div className="h-full flex flex-col border-r theme-border bg-(--theme-panel-bg)/60">
            <div className="flex items-center justify-end h-10 px-3 shrink-0 border-b theme-border">
              <div className="flex gap-x-0.5">
                <button
                  type="button"
                  aria-label={t.chrome.refresh}
                  data-tooltip-id={TOOLTIP_ID}
                  data-tooltip-content="Refresh"
                  data-tooltip-class-name="z-50"
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md cursor-pointer theme-muted-text hover:theme-text hover:theme-hover transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-(--theme-link)"
                  onClick={() => handleRefresh()}
                >
                  <RefreshIcon className="h-3.5 w-3.5" />
                </button>

                <button
                  type="button"
                  aria-label={t.chrome.collapse}
                  data-tooltip-id={TOOLTIP_ID}
                  data-tooltip-content="Collapse All"
                  data-tooltip-class-name="z-50"
                  className="inline-flex items-center justify-center h-7 w-7 rounded-md cursor-pointer theme-muted-text hover:theme-text hover:theme-hover transition-colors duration-150 focus:outline-none focus-visible:ring-1 focus-visible:ring-(--theme-link)"
                  onClick={collapseAll}
                >
                  <CollapseIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Tree Contents Section */}
            <TreeView
              rootNodes={rootNodes}
              parentToChildrenMap={parentToChildrenMap}
              expandedPaths={expandedPaths}
              selectedPath={normalizedSelectedPath}
              loadingPaths={loadingPaths}
              onToggleExpand={handleToggleExpand}
              onSelect={(path, node) => {
                void handleSelectTreeItem(path, node)
                // With no details pane beside it, the tree is the only way to
                // reach a file, so selecting one opens it.
                if (treeOnly && node.type === 'file') {
                  openPreview(node)
                }
              }}
              onDropToFolder={onDropFiles}
              onContextMenu={openNodeContextMenu}
              onPreviewFile={openPreview}
              paging={treePaging}
            />
          </div>
        </TreeFrame>
        {/* Details Panel - Right side table */}
        {!treeOnly && (
          <div className="h-full flex flex-col flex-1 min-w-0">
            {!selectedNode && normalizedSelectedPath ? (
              hydrationStuck ? (
                <NotFoundPreview
                  path={normalizedSelectedPath}
                  onRetry={() => {
                    // A folder that still has a cursor keeps its pages and resumes
                    // paging: starting it over could never get past the page bound.
                    const deepest = stuck?.deepest
                    hydrationPagesRef.current = { path: '', pages: 0 }
                    setStuck(null)
                    if (deepest) {
                      setListings((prev) =>
                        hasMore(prev, deepest)
                          ? clearListingError(prev, deepest)
                          : clearListingsUnder(prev, deepest),
                      )
                    }
                  }}
                />
              ) : (
                <ListSkeleton />
              )
            ) : !selectedNode && showUserHierarchy ? (
              <div className="overflow-auto h-full">
                <Table {...listTableProps}>
                  <Table.Header caps={false} className="py-2" style={{ minWidth: 200 }}>
                    Name
                  </Table.Header>
                  <Table.Header caps={false} className="w-[22%] py-2">
                    Type
                  </Table.Header>
                  <Table.Header caps={false} className="w-[22%] py-2">
                    Storages
                  </Table.Header>
                  <ListActionsHeader actionCount={1} />
                  {rootNodes.map((rootNode) => (
                    <UserRow
                      key={rootNode.path}
                      node={rootNode}
                      icon={getNodeIcon(rootNode, slots.storageIconUrl, t.chrome.storageIconAlt)}
                      storageCount={getNodeChildren(parentToChildrenMap, rootNode.path).length}
                      getItems={() => [
                        {
                          kind: 'action',
                          label: t.preview.open,
                          icon: <FolderIcon />,
                          onSelect: () => openUserNode(rootNode),
                        },
                      ]}
                      openMenu={openMenu}
                      onOpen={openUserNode}
                    />
                  ))}
                </Table>
                {rootNodes.length === 0 && (
                  <NoDataAvailablePreview selectedStorage={null} onRefresh={handleRefresh} />
                )}
              </div>
            ) : !selectedNode ? (
              <NoFileSelectedPreview />
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 px-4 h-12 shrink-0 border-b theme-border">
                  {renderBreadcrumb()}
                  {/* Action Buttons */}
                  <div className="flex shrink-0 items-center gap-2">
                    {/* Without this the row count reads as the folder's real size. */}
                    {folderHasMore && (
                      <StatusBadge variant="muted" className="whitespace-nowrap tabular-nums">
                        {t.partialCount(selectedNodeChildren.length)}
                      </StatusBadge>
                    )}
                    {/* The only cue for rows selected then scrolled out of the
                      window. Counts this folder's rows, since checkedItems can
                      still hold another folder's paths. */}
                    {selectedInFolderCount > 0 && (
                      <StatusBadge variant="muted" className="whitespace-nowrap tabular-nums">
                        {t.selectedCount(selectedInFolderCount)}
                      </StatusBadge>
                    )}
                    {!selectedNodeCanWrite && (
                      <StatusBadge variant="muted" className="uppercase tracking-wider">
                        {t.readOnly}
                      </StatusBadge>
                    )}
                    <input
                      type="file"
                      multiple
                      ref={fileInputRef}
                      className="hidden"
                      onChange={(e) => {
                        handleUploadInputChange(e.target.files, selectedNode)
                      }}
                    />
                    <input
                      type="file"
                      multiple
                      // @ts-expect-error - The `webkitdirectory` attribute is not standard but widely supported for folder uploads
                      webkitdirectory="true"
                      ref={folderInputRef}
                      className="hidden"
                      onChange={(e) => {
                        handleUploadInputChange(e.target.files, selectedNode)
                      }}
                    />

                    {selectedNodeCanWrite && selectedNodeCanUpload && (
                      <button
                        type="button"
                        aria-label={t.createFolder.action}
                        className="btn btn-info cursor-pointer flex items-center justify-center"
                        disabled={selectedNode.type === 'file' || !selectedNode.storageId}
                        onClick={() => setCreateFolderTarget(selectedNode)}
                      >
                        <FolderIcon className="h-4 w-4 mr-2" />
                        <span className="hidden md:inline">{t.createFolder.action}</span>
                      </button>
                    )}

                    {selectedNodeCanWrite && selectedNodeCanUpload && (
                      <Menu>
                        <MenuButton
                          aria-label={t.chrome.upload}
                          className="btn btn-info cursor-pointer flex items-center justify-between pr-0.5!"
                          disabled={selectedNode.type === 'file' || !selectedNode.storageId}
                        >
                          <div>
                            <UploadIcon className="h-4 w-4 mr-2" />
                            <span className="hidden md:inline">{t.chrome.upload}</span>
                          </div>
                          <AngleDownIcon className="h-4 w-4 ml-2" />
                        </MenuButton>

                        <MenuItems
                          transition
                          anchor="bottom end"
                          className="theme-panel w-36 rounded-md border p-1 mt-1 shadow-lg z-50 origin-top-right transition duration-100
                    ease-out data-closed:scale-95 data-closed:opacity-0 focus:outline-none"
                        >
                          <MenuItem>
                            <button
                              type="button"
                              className="text-sm rounded-sm hover:theme-hover cursor-pointer w-full items-center px-2 py-1.5"
                              onClick={() => fileInputRef.current?.click()}
                            >
                              Select Files
                            </button>
                          </MenuItem>
                          <MenuItem>
                            <button
                              type="button"
                              className="text-sm rounded-sm hover:theme-hover cursor-pointer w-full items-center px-2 py-1.5"
                              onClick={() => folderInputRef.current?.click()}
                            >
                              Select Folder
                            </button>
                          </MenuItem>
                        </MenuItems>
                      </Menu>
                    )}

                    <Menu>
                      <MenuButton
                        aria-label={t.chrome.download}
                        className="btn btn-info cursor-pointer flex items-center justify-between pr-0.5!"
                        disabled={
                          (checkedItems.size === 0 && selectedNode.type !== 'file') ||
                          hasFolderSelected() ||
                          !selectedNode.storageId
                        }
                      >
                        <div>
                          <DownloadFileIcon className="h-4 w-4 mr-2" />
                          <span className="hidden md:inline">{t.chrome.download}</span>
                        </div>
                        <AngleDownIcon className="h-4 w-4 ml-2" />
                      </MenuButton>

                      <MenuItems
                        transition
                        anchor="bottom end"
                        className="theme-panel w-72 rounded-md border p-1 mt-1 shadow-lg z-50 origin-top-right transition duration-100 
                    ease-out data-closed:scale-95 data-closed:opacity-0 focus:outline-none"
                      >
                        <MenuItem>
                          <button
                            type="button"
                            className="text-sm rounded-sm hover:theme-hover cursor-pointer w-full items-center px-2 py-1.5"
                            onClick={handleDownload}
                          >
                            {t.chrome.downloadFromBrowser}
                          </button>
                        </MenuItem>
                        {downloadCommand && generateDownloadCommand() && (
                          <>
                            <MenuSeparator className="my-0.5 h-px theme-border" />
                            <MenuItem>
                              <div>
                                <p className="text-sm w-full text-center pointer-events-none px-2 py-1.5">
                                  {downloadCommand.label}
                                </p>
                                {(() => {
                                  const downloadCommand = generateDownloadCommand()
                                  return (
                                    <CopyCodeBlock textToCopy={downloadCommand}>
                                      <div className="overflow-x-auto text-xs">
                                        {keyedByContent(downloadCommand.split('\n'), (l) => l).map(
                                          ({ key, item: line }) => (
                                            <div key={key} className="whitespace-nowrap">
                                              {line}
                                            </div>
                                          ),
                                        )}
                                      </div>
                                    </CopyCodeBlock>
                                  )
                                })()}
                              </div>
                            </MenuItem>
                          </>
                        )}
                      </MenuItems>
                    </Menu>

                    <button
                      type="button"
                      aria-label={t.chrome.access}
                      className="btn btn-info cursor-pointer flex items-center justify-center"
                      disabled={!selectedNode.storageId}
                      onClick={() => setAccessDrawerOpen(true)}
                      hidden={!groups || groups.length === 0 || !selectedNodeCanManageAccess}
                    >
                      <AccessIcon className="h-4 w-4 mr-2" />
                      <span className="hidden md:inline">{t.chrome.manageAccess}</span>
                    </button>

                    {selectedNodeCanWrite && (
                      <button
                        type="button"
                        aria-label={t.chrome.delete}
                        className="btn btn-destructive cursor-pointer flex items-center justify-center"
                        disabled={
                          (checkedItems.size === 0 && selectedNode.type !== 'file') ||
                          !selectedNode.storageId
                        }
                        onClick={onDeleteClick}
                      >
                        <TrashIcon className="h-4 w-4 mr-2" />
                        <span className="hidden md:inline">{t.chrome.delete}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Table View for directories */}
                {selectedNode.type === 'directory' && (
                  <DragDropZone
                    className="min-h-0 flex-1 overflow-hidden"
                    onDropFiles={
                      selectedNodeCanWrite
                        ? (files) => {
                            onDropFiles(selectedNode.path, files)
                          }
                        : undefined
                    }
                  >
                    {/* Skeleton preview for loading folder contents */}
                    {loadingPaths.has(selectedNode.path) && <ListSkeleton />}
                    {!loadingPaths.has(selectedNode.path) &&
                      (selectedNodeChildren.length > 0 || folderHasMore ? (
                        <FileTable
                          nodes={selectedNodeChildren}
                          key={selectedNode.path}
                          checkedItems={checkedItems}
                          allSelected={allItemsSelected}
                          someSelected={selectedInFolderCount > 0}
                          onSelectAll={handleBatchCheckbox}
                          getItems={buildRowMenu}
                          openMenu={openMenu}
                          onOpen={(n) => handleSelectTreeItem(n.path, n)}
                          onToggleCheck={handleItemCheckbox}
                          onPreview={openPreview}
                          loadMore={loadMoreProps}
                        />
                      ) : (
                        <div className="h-full flex flex-col">
                          <Table {...listTableFixedProps} wrapperClassName="overflow-x-auto">
                            <FileTableHeaders
                              allSelected={allItemsSelected}
                              someSelected={selectedInFolderCount > 0}
                              onSelectAll={handleBatchCheckbox}
                            />
                          </Table>
                          <NoDataAvailablePreview
                            selectedStorage={
                              storages.find((s) => s.id === selectedNode.storageId) || null
                            }
                            canWrite={selectedNodeCanWrite}
                            onRefresh={handleRefresh}
                            error={
                              hasCorsIssue.get(selectedNode.storageId ?? '')
                                ? new CorsError(
                                    connectionIssuesMessage.get(selectedNode.storageId ?? '') || '',
                                  )
                                : null
                            }
                            connectionIssueMessage={
                              selectedNode.storageId
                                ? connectionIssuesMessage.get(selectedNode.storageId)
                                : null
                            }
                          />
                        </div>
                      ))}
                  </DragDropZone>
                )}

                {/* Details view for files */}
                {selectedNode.type === 'file' &&
                  (() => {
                    const uris = getNodeUris(selectedNode)
                    const fileIcon = getNodeIcon(
                      selectedNode,
                      slots.storageIconUrl,
                      t.chrome.storageIconAlt,
                    ) ?? <FileIcon className="h-5 w-5 theme-muted-text" />
                    const modifiedDt = selectedNode.modified
                      ? DateTime.fromISO(selectedNode.modified)
                      : null
                    const createdDt = selectedNode.created
                      ? DateTime.fromISO(selectedNode.created)
                      : null
                    const previewable = canPreview(selectedNode)
                    const effectiveTab = previewable ? detailTab : 'details'
                    const tabClass = (active: boolean) =>
                      cx(
                        'mx-2.5 border-b-2 px-1 py-2.5 text-[13px] font-medium cursor-pointer transition-colors',
                        active
                          ? 'theme-text border-(--theme-element)'
                          : 'theme-muted-text border-transparent hover:theme-text',
                      )
                    return (
                      <div className="flex h-full min-h-0 flex-col">
                        <div className="flex shrink-0 items-center border-b theme-border px-3">
                          <button
                            type="button"
                            className={tabClass(effectiveTab === 'details')}
                            onClick={() => setDetailTab('details')}
                          >
                            {t.preview.detailsTab}
                          </button>
                          {previewable && (
                            <button
                              type="button"
                              className={tabClass(effectiveTab === 'preview')}
                              onClick={() => setDetailTab('preview')}
                            >
                              {t.preview.previewTab}
                            </button>
                          )}
                        </div>
                        {effectiveTab === 'preview' && previewable ? (
                          <FilePreviewInline
                            node={selectedNode}
                            storage={storages.find((s) => s.id === selectedNode.storageId) ?? null}
                            getPresignedUrl={getPresignedUrl}
                            onOpenFull={openPreview}
                            onDownload={downloadNode}
                            active={!previewOpen}
                          />
                        ) : (
                          <div className="min-h-0 flex-1 overflow-auto">
                            {/* Hero */}
                            <div className="flex items-start gap-4 px-6 pt-6 pb-5 border-b theme-border">
                              <div className="shrink-0 inline-flex items-center justify-center w-12 h-12 rounded-lg theme-muted-panel">
                                <div className="*:h-5 *:w-5 *:mr-0">{fileIcon}</div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <h2 className="text-lg font-semibold leading-tight break-all">
                                  {selectedNode.name}
                                </h2>
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs theme-muted-text">
                                  {selectedNode.contentType && (
                                    <span className="inline-flex items-center rounded-full border theme-border px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wider">
                                      {selectedNode.contentType}
                                    </span>
                                  )}
                                  {typeof selectedNode.size === 'number' && (
                                    <span className="tabular-nums">
                                      {formatFileSize(selectedNode.size)}
                                    </span>
                                  )}
                                  {modifiedDt && (
                                    <>
                                      <span aria-hidden>·</span>
                                      <span>Modified {modifiedDt.toRelative()}</span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* URIs */}
                            {uris.length > 0 && (
                              <div className="px-6 pt-5 space-y-2">
                                {uris.map((uri) => (
                                  <UriCard key={uri} value={uri} />
                                ))}
                              </div>
                            )}

                            {/* Share */}
                            {selectedNodeCanShare && (
                              <div className="flex items-center gap-2 px-6 pt-4">
                                <ShareFileButton
                                  node={selectedNode}
                                  onShare={onShareFileButtonClick}
                                />
                                <TooltipInfo
                                  text="This will generate a pre-signed URL for this file. Anyone with this link can temporarily access and download the file, even if they don't have an account. The link will automatically expire after 12 hours."
                                  place="right"
                                />
                              </div>
                            )}

                            {/* Details */}
                            <div className="px-6 py-5 mt-5 border-t theme-border">
                              <h3 className="text-[11px] font-semibold uppercase tracking-widest theme-muted-text mb-3">
                                Details
                              </h3>
                              <dl className="grid grid-cols-[minmax(0,140px)_1fr] gap-x-6 gap-y-2 text-sm">
                                {typeof selectedNode.size === 'number' && (
                                  <>
                                    <dt className="theme-muted-text">{t.chrome.size}</dt>
                                    <dd className="tabular-nums">
                                      {formatFileSize(selectedNode.size)}
                                    </dd>
                                  </>
                                )}
                                {selectedNode.contentType && (
                                  <>
                                    <dt className="theme-muted-text">Content Type</dt>
                                    <dd className="font-mono text-xs">
                                      {selectedNode.contentType}
                                    </dd>
                                  </>
                                )}
                                {createdDt && (
                                  <>
                                    <dt className="theme-muted-text">{t.chrome.created}</dt>
                                    <dd>
                                      {createdDt.toLocaleString(DateTime.DATETIME_MED)}{' '}
                                      <span className="theme-muted-text">
                                        · {createdDt.toRelative()}
                                      </span>
                                    </dd>
                                  </>
                                )}
                                {modifiedDt && (
                                  <>
                                    <dt className="theme-muted-text">Last Modified</dt>
                                    <dd>
                                      {modifiedDt.toLocaleString(DateTime.DATETIME_MED)}{' '}
                                      <span className="theme-muted-text">
                                        · {modifiedDt.toRelative()}
                                      </span>
                                    </dd>
                                  </>
                                )}
                                {selectedNode.hash && (
                                  <>
                                    <dt className="theme-muted-text">{t.chrome.hash}</dt>
                                    <dd className="font-mono text-xs break-all">
                                      {selectedNode.hash.replace(/^"|"$/g, '')}
                                    </dd>
                                  </>
                                )}
                                {selectedNode.storageClass && (
                                  <>
                                    <dt className="theme-muted-text">Storage Class</dt>
                                    <dd className="font-mono text-xs uppercase tracking-wider">
                                      {selectedNode.storageClass}
                                    </dd>
                                  </>
                                )}
                              </dl>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })()}
              </>
            )}
          </div>
        )}
      </div>

      {contextMenu}

      <FilePreview
        open={previewOpen}
        node={previewNode}
        siblings={previewSiblings}
        storage={storages.find((s) => s.id === previewNode?.storageId) ?? null}
        getPresignedUrl={getPresignedUrl}
        onNavigate={setPreviewNode}
        onClose={closePreview}
        onDownload={downloadNode}
        onCopyUri={copyNodeUri}
      />

      <CreateModal
        open={!!createFolderTarget}
        onClose={() => setCreateFolderTarget(null)}
        typeIcon={<FolderIcon className="w-3 h-3" />}
        typeLabel={t.createFolder.folder}
        namePlaceholder={t.createFolder.namePlaceholder}
        submitLabel={t.createFolder.submit}
        submittingLabel={t.createFolder.creating}
        validateName={validateFolderName}
        onSubmit={handleCreateFolder}
      />

      {waitForUpload && (
        <div className="absolute inset-0 bg-(--theme-app-bg)/75 backdrop-blur-[2px] transition-opacity flex items-center justify-center z-50">
          <Loader full />
        </div>
      )}

      <ConfirmModal
        open={uploadModalOpen && !!pendingUpload}
        onClose={() => {
          setUploadModalOpen(false)
          setPendingUpload(null)
        }}
        align="center"
        title={t.confirmUpload.title}
        description={t.confirmUpload.text(pendingUpload?.targetPath || t.confirmUpload.defaultPath)}
        confirmLabel={t.confirmUpload.confirm}
        onConfirm={handleUpload}
        confirmDisabled={pendingUpload ? isUploadSizeExceeded(pendingUpload.totalSize) : false}
      >
        <div className="text-sm flex flex-col gap-2 mt-2 text-left">
          <ul className="list-disc pl-5 max-h-40 overflow-auto theme-muted-panel py-1">
            {pendingUpload?.uploadNodes && renderUploadNodes(pendingUpload.uploadNodes)}
          </ul>
          <div>
            <span className="font-semibold">{t.confirmUpload.target}</span>{' '}
            {pendingUpload?.targetPath || t.confirmUpload.noPath}
          </div>
          <div className="text-xs mt-1">
            <span className="font-semibold">{t.confirmUpload.totalSize}</span>{' '}
            <span
              className={cx(
                isUploadSizeExceeded(pendingUpload?.totalSize ?? 0) &&
                  'text-amber-800 font-semibold',
              )}
            >
              {formatFileSize(pendingUpload?.totalSize ?? 0)}
            </span>
          </div>
          {isUploadSizeExceeded(pendingUpload?.totalSize ?? 0) && (
            <div className="mt-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertIcon className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-amber-800">
                  <div className="font-semibold mb-1">{t.confirmUpload.sizeLimitTitle}</div>
                  <div className="text-sm">
                    <p>
                      {t.confirmUpload.sizeLimitBody(
                        formatFileSize(pendingUpload?.totalSize ?? 0),
                        formatFileSize(MAX_UPLOAD_SIZE),
                      )}
                    </p>
                    <p>{t.confirmUpload.sizeLimitHint}</p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </ConfirmModal>

      <ConfirmModal
        open={deleteModalOpen && !!pendingDelete}
        onClose={() => {
          setDeleteModalOpen(false)
          setPendingDelete(null)
          setCheckedItems(new Set())
        }}
        align="center"
        destructive
        title={t.confirmDelete.title}
        description={t.confirmDelete.text}
        confirmLabel={t.confirmDelete.action}
        onConfirm={handleDelete}
      >
        <div className="text-sm flex flex-col gap-2 mt-2 text-left">
          <ul className="list-disc pl-5 max-h-40 overflow-auto theme-muted-panel py-1">
            {pendingDelete?.map((node) => (
              <li key={node.path}>{node.path}</li>
            ))}
          </ul>
        </div>
      </ConfirmModal>
      {/* Access drawer (host slot) */}
      {selectedNode?.storageId &&
        !groupsLoading &&
        slots.accessDrawer?.({
          open: accessDrawerOpen,
          setOpen: setAccessDrawerOpen,
          groups,
          storage: storages.find((s) => s.id === selectedNode.storageId),
        })}
    </div>
  )
}
