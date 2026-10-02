import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { createContext, use, useCallback, useContext, useEffect, useMemo } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import type { WorkflowEngine } from '../engine'
import type { RunLink } from '../graph/types'

export type UIToastId = string | number

export interface UIToastOptions {
  toastId?: UIToastId
  /** false hides the default icon. */
  icon?: false
  closeButton?: boolean
  autoClose?: number | false
}

export interface UIToastUpdate {
  render?: ReactNode
  type?: 'info' | 'success' | 'warning' | 'error'
  /** false or null hides the icon. */
  icon?: false | null
  isLoading?: boolean
  closeButton?: boolean | null
  autoClose?: number | false | null
}

export interface UINotify {
  info: (message: string) => void
  success: (message: string) => void
  warning: (message: string) => void
  error: (message: string) => void
  /** Persistent spinner toast; drive it with update/dismiss via the returned id. */
  loading: (content: ReactNode, options?: UIToastOptions) => UIToastId
  update: (id: UIToastId, update: UIToastUpdate) => void
  /** Without an id, dismisses every open toast. */
  dismiss: (id?: UIToastId) => void
}

export interface UIStrings {
  loading: string
  modal: {
    cancel: string
    close: string
    create: string
    creating: string
    addDescription: string
    advanced: string
    favorite: string
    favorited: string
    favoriteHintOn: string
    favoriteHintOff: string
    filter: string
    noOptions: string
  }
  common: {
    copy: string
    copied: string
    copyFailed: string
    showHiddenFields: string
    showHiddenFieldsHint: string
    jsonHasErrors: string
    add: string
    create: string
    remove: string
    sort: string
    userAvatar: string
  }
  dropdown: {
    select: (type: string) => string
    noOptionsFound: string
    showOptions: string
  }
  logviewer: {
    error: string
    warning: string
    notice: string
    top: string
    clearSelection: string
    copyLines: (count: number) => string
    copyAll: string
    hideDebug: string
    showDebug: string
    filterLogs: string
    download: string
    beginningOfLog: string
    loadingOlderEntries: string
    loadOlderEntries: string
    timeRange: string
    timeRangeActive: string
    timeRangeOn: string
    filterByTimeRange: string
    timeRangeHelp: string
    timeRangeFrom: string
    timeRangeTo: string
    apply: string
    clear: string
    invalidStartTime: string
    invalidEndTime: string
    endBeforeStart: string
    endInFuture: string
  }
  dag: {
    workflow: string
    run: string
    status: string
    runtime: string
    submitted: string
    expandAll: string
    collapseAll: string
    loadingLogs: string
    noLogFound: string
    logLoadFailed: string
    statusLabel: (status: string) => string
    statusReason: (reason: string | undefined | null) => string | undefined
  }
  jobActions: {
    openSubworkflowLogs: string
    openOriginalWorkflow: string
    openInNewGraph: string
  }
  fileExplorer: {
    preview: {
      shareFile: string
      open: string
      userType: string
      select: (name: string) => string
      viewDetails: string
      openFolder: string
      delete: string
      detailsTab: string
      previewTab: string
      preview: string
      openFullPreview: string
      quickLook: string
      fullWindow: string
      streamed: string
      streamedTooltip: string
      loading: string
      linkError: string
      errorTitle: string
      previewError: string
      tooLarge: string
      downloadInstead: string
      archiveTitle: string
      archiveMessage: string
      unsupportedTitle: string
      unsupportedMessage: string
      notebookParseError: string
      copyUri: string
      download: string
      close: string
      zoomIn: string
      zoomOut: string
      previousFile: string
      nextFile: string
      csvRows: (count: number, columns: number) => string
      csvFirstRows: (count: number, columns: number) => string
      head: string
      tail: string
      firstLines: (count: number) => string
      lastLines: (count: number) => string
      notebookOutput: string
    }
    createFolder: {
      action: string
      submit: string
      creating: string
      folder: string
      namePlaceholder: string
      success: (name: string) => string
      error: (message: string) => string
      invalidTarget: string
      noWriteAccess: string
      unsupported: string
      validation: {
        reserved: string
        separator: string
        exists: string
      }
    }
    readOnly: string
    cors: {
      explanation: {
        title: string
        description: string
        action: string
        note: string
      }
      actions: {
        retry: string
        addRules: string
      }
      propagating: {
        title: string
        description: string
        stages: {
          submitted: string
          propagating: string
          verified: string
        }
        telemetry: {
          probing: string
        }
      }
    }
    selectedCount: (count: number) => string
    loadingMore: string
    loadMore: string
    retry: string
    partialCount: (count: number) => string
    notFound: {
      title: (name: string) => string
      description: string
      retry: string
    }
    treeMoreCount: (count: number) => string
    treeMoreCountPartial: (count: number) => string
    messages: {
      noWriteAccess: string
      uploadsUnsupported: string
      noFilesForDownload: string
      downloadLinkFailed: string
      fileLinkFailed: string
      fileLinkCopied: string
      noUri: string
      uriCopied: string
      uriCopyFailed: string
      storageUnavailable: string
      waitForCurrentUpload: string
      waitForUpload: string
      downloadUnsupported: string
      sharingUnsupported: string
      deleteUnsupported: string
      uploadUnsupported: string
      noItemsForDeletion: string
      deleting: string
      deleteSomeFailed: string
      deleteSuccess: string
      deleteFailed: (message: string) => string
      noFilesToUpload: string
      invalidUploadTarget: string
      uploadInitFailed: string
      uploadQueuedInfo: string
      connectFailed: string
      corsNoStorage: string
      corsAdded: string
      corsPropagating: string
    }
    chrome: {
      explorer: string
      refresh: string
      collapse: string
      upload: string
      download: string
      downloadFromBrowser: string
      access: string
      manageAccess: string
      delete: string
      copyToClipboard: string
      selectAll: string
      name: string
      size: string
      created: string
      hash: string
      storageIconAlt: string
    }
    confirmUpload: {
      title: string
      text: (path: string) => string
      defaultPath: string
      noPath: string
      confirm: string
      target: string
      totalSize: string
      sizeLimitTitle: string
      sizeLimitBody: (total: string, max: string) => string
      sizeLimitHint: string
    }
    confirmDelete: {
      title: string
      text: string
      action: string
    }
    empty: {
      nothingSelected: string
      nothingSelectedHint: string
      folderEmpty: string
      dropHint: string
      readOnlyHint: string
      connectionIssue: string
      tryAgain: string
      shareThisFile: string
    }
    upload: {
      inQueue: (position: number, total: number) => string
      queuedShort: (position: number, total: number) => string
      destination: string
      eta: string
      uploading: string
      completeTitle: string
      completeShort: string
      failedTitle: string
      failedShort: string
      unknownTitle: string
      unknownShort: string
      cancelled: string
      completed: string
      failed: string
      totalSize: string
      size: string
      calculating: string
      expandDetails: string
      minimizeDetails: string
      sessionNotQueued: (id: string, status: string) => string
      allCancelled: (count: number) => string
      someUploaded: (count: number) => string
      someCancelled: (count: number) => string
      allUploaded: string
      failedSummary: (failed: number, total: number) => string
      failReasonGeneric: string
      refreshFailed: (name: string, message: string) => string
      unknownError: string
      overallProgress: string
    }
  }
  form: {
    invalidDuration: string
    durationOutOfRange: (min: string, max: string) => string
    durationBelowMin: (min: string) => string
  }
  time: {
    now: string
    minutes: (n: number) => string
    hours: (n: number) => string
    days: (n: number) => string
    years: (n: number) => string
  }
  list: {
    copyMenu: string
    copy: (label: string) => string
    copied: (label: string) => string
    couldntCopy: (label: string) => string
    moreActions: string
    labelName: string
    labelEmail: string
    labelUsername: string
    labelUid: string
    labelId: string
    labelUrl: string
    couldNotLoad: (noun: string) => string
    displayOptions: string
    grouping: string
    ordering: string
    orderDefault: string
    orderFavorites: string
    ascending: string
    descending: string
    columnHeaders: string
    showColumnHeaders: string
    showActions: string
    showRowActions: string
    alwaysShowActions: string
    alwaysShowRowActions: string
    displayProperties: string
    pinnedActions: string
    pinnedActionsHelp: string
    reset: string
    none: string
    filter: string
    clear: string
    pager: (start: number, end: number, total: number) => string
    perPage: string
    paginationPrevious: string
    paginationNext: string
    paginationShowing: (name: string, start: number | string, end: number | string) => ReactNode
    paginationShowingTimeRange: (name: string, startTime: string, endTime: string) => ReactNode
  }
}

export interface UINavigation {
  goTo: (to: string) => void
  /** Opens the source of a step that runs another workflow, named by its `uses`;
   * `sourceUrl` is a page the server resolved for it, when there is one. */
  openStepSource: (uses: string, sourceUrl?: string) => void
  openExternal: (href: string) => void
}

export interface RunFileResult {
  data: string | undefined
  isLoading: boolean
  error: unknown
}

export type PersistedStateHook = <T>(
  key: string,
  defaultValue: T,
) => [T, Dispatch<SetStateAction<T>>]

export interface UIData {
  /**
   * Host-bound hook resolving a file in a run's artifact tree (logs, scripts).
   * A null path skips fetching; refreshInterval polls while set. Must be a
   * stable function reference — components call it as a hook.
   */
  useRunFile: (
    slug: string,
    path: string | null,
    options?: { refreshInterval?: number },
  ) => RunFileResult
  /**
   * Provisions browser-access CORS rules on a storage. Absent, the storage
   * explorer hides its "add CORS rules" affordance.
   */
  provisionCorsRules?: (args: {
    csp: string
    type?: string | undefined
    username: string
    storageName: string
  }) => Promise<{ error?: string }>
  usePersistedState: PersistedStateHook
}

import type { FieldComponent } from '../form/fieldRegistry'
import type { PageHeaderCrumb } from './PageHeader'

/** Renders internal navigation; hosts bind their router's Link. Accessibility
 * and tooltip data attributes pass through so header links keep their labels. */
export type UILinkComponent = React.ComponentType<{
  to: string
  onClick?: () => void
  className?: string
  children: ReactNode
  title?: string | undefined
  'aria-label'?: string | undefined
  [dataAttr: `data-${string}`]: string | undefined
}>

const DefaultLink: UILinkComponent = ({ to, onClick, className, children, ...rest }) => (
  <a href={to} onClick={onClick} className={className} {...rest}>
    {children}
  </a>
)

/** The provider's link slot, with a plain anchor fallback. */
export function useLink(): UILinkComponent {
  return useContext(UIContext).slots.link ?? DefaultLink
}

export interface UISlots {
  /** Internal navigation links; absent falls back to a plain anchor. */
  link?: UILinkComponent
  /**
   * Host-supplied form field components, merged over the form engine's core
   * registry by field type. Lazy components are supported — the registry
   * renders fields inside a Suspense boundary.
   */
  formFields?: Record<string, FieldComponent>
  /** Links and sessions block for a run's sidebar; absent hides the section. */
  runSessions?: (args: {
    runId: string
    runNumber: number
    runActive: boolean
    links?: Record<string, RunLink> | undefined
  }) => ReactNode
  /** Rich read-only YAML viewer; absent falls back to a plain <pre>. */
  yamlViewer?: (args: {
    value: string
    height: number
    width: number
    contentKey: string
  }) => ReactNode
  /** Icon for a subworkflow step; absent hides icon-bound affordances. */
  workflowIcon?: (args: {
    image?: string | undefined
    type?: string | undefined
    className?: string
  }) => ReactNode
  /** Icon URL for a storage type; absent falls back to a generic disk icon.
   * Scheme-dependent variants are the host's concern — bind with the host's
   * own theme state. */
  storageIconUrl?: (args: { type: string }) => string | undefined
  /**
   * The storage explorer's access-management drawer; absent hides the
   * affordance. `storage` and `groups` are the host's own objects passed back
   * through the explorer opaquely.
   */
  accessDrawer?: (args: {
    open: boolean
    setOpen: (open: boolean) => void
    storage: unknown
    groups?: unknown
  }) => ReactNode
  /** Pin affordance rendered after the page header's crumb trail; absent hides it. */
  breadcrumbPin?: (args: { crumbs: readonly PageHeaderCrumb[] }) => ReactNode
  /** Control rendered at the start of the page header row, before the crumb
   * trail — the host's app-nav toggle. Absent hides it. */
  navToggle?: () => ReactNode
}

/** An engine, or a loader so the host can keep the engine out of its first-load bundle. */
export type WorkflowEngineSource = WorkflowEngine | (() => Promise<WorkflowEngine>)

export interface UIProviderValue {
  notify: UINotify
  strings: UIStrings
  navigation: UINavigation
  data: UIData
  slots: UISlots
  engine?: WorkflowEngineSource | undefined
}

const defaultUseRunFile = (): RunFileResult => ({
  data: undefined,
  isLoading: false,
  error: undefined,
})

function useLocalStoragePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useLocalStorage(key, defaultValue)
  return [value, setValue]
}

const DEFAULTS: UIProviderValue = {
  notify: {
    info: () => {},
    success: () => {},
    warning: () => {},
    error: () => {},
    loading: () => 'toast',
    update: () => {},
    dismiss: () => {},
  },
  strings: {
    loading: 'Loading…',
    modal: {
      cancel: 'Cancel',
      close: 'Close',
      create: 'Create',
      creating: 'Creating…',
      addDescription: 'Add description…',
      advanced: 'Advanced',
      favorite: 'Favorite',
      favorited: 'Favorited',
      favoriteHintOn: "Your item will be favorited when it's created",
      favoriteHintOff: "Favorite your item when it's created",
      filter: 'Filter',
      noOptions: 'No options available',
    },
    common: {
      copy: 'Copy',
      copied: 'Copied!',
      copyFailed: 'Failed to copy text to clipboard',
      showHiddenFields: 'Show hidden fields',
      add: 'Add',
      create: 'Create',
      showHiddenFieldsHint:
        "Includes fields hidden by default because they're specific to each resource, such as name and group.",
      jsonHasErrors: 'JSON has errors, please fix before saving',
      remove: 'Remove',
      sort: 'Sort',
      userAvatar: 'User avatar',
    },
    dropdown: {
      select: (type) => `Select ${type}`,
      noOptionsFound: 'No options found',
      showOptions: 'Show options',
    },
    logviewer: {
      error: 'Error:',
      warning: 'Warning:',
      notice: 'Notice:',
      top: 'Top',
      clearSelection: 'Clear selection',
      copyLines: (count) => (count === 1 ? 'Copy 1 line' : `Copy ${count} lines`),
      copyAll: 'Copy All',
      hideDebug: 'Hide Debug',
      showDebug: 'Show Debug',
      filterLogs: 'Filter logs',
      download: 'Download',
      beginningOfLog: 'Beginning of log',
      loadingOlderEntries: 'Loading older entries…',
      loadOlderEntries: 'Load older entries',
      timeRange: 'Time range',
      timeRangeActive: 'Time range active',
      timeRangeOn: 'ON',
      filterByTimeRange: 'Filter by time range',
      timeRangeHelp:
        'Times are interpreted in your local timezone. Applying a range re-queries the log source and replaces what is loaded. Setting an end time stops live tailing until you clear it.',
      timeRangeFrom: 'From',
      timeRangeTo: 'To',
      apply: 'Apply',
      clear: 'Clear',
      invalidStartTime: 'Start time is not a valid date.',
      invalidEndTime: 'End time is not a valid date.',
      endBeforeStart: 'End time must be after the start time.',
      endInFuture: 'End time cannot be in the future.',
    },
    dag: {
      workflow: 'Workflow',
      run: 'Run',
      status: 'Status',
      runtime: 'Runtime',
      submitted: 'Submitted',
      expandAll: 'Expand all',
      collapseAll: 'Collapse all',
      loadingLogs: 'Loading logs',
      noLogFound: 'No log found',
      logLoadFailed: 'Log could not be loaded',
      statusLabel: (status) => status,
      statusReason: () => undefined,
    },
    jobActions: {
      openSubworkflowLogs: 'Open subworkflow logs',
      openOriginalWorkflow: 'Open original workflow',
      openInNewGraph: 'Open in new graph',
    },
    fileExplorer: {
      preview: {
        shareFile: 'Share file',
        open: 'Open',
        userType: 'User',
        select: (name: string) => `Select ${name}`,
        viewDetails: 'View details',
        openFolder: 'Open folder',
        delete: 'Delete',
        detailsTab: 'Details',
        previewTab: 'Preview',
        preview: 'Preview',
        openFullPreview: 'Open full preview',
        quickLook: 'Quick Look',
        fullWindow: 'Full window',
        streamed: 'Streamed',
        streamedTooltip:
          'Streamed securely to your browser over a short-lived signed URL — never written to disk.',
        loading: 'Loading preview…',
        linkError: "Couldn't generate a preview link for this file.",
        errorTitle: "Couldn't load preview",
        previewError: "This file couldn't be previewed in your browser.",
        tooLarge: 'This file is too large to preview in the browser.',
        downloadInstead: 'Download instead',
        archiveTitle: "Can't preview archives",
        archiveMessage:
          "Archive files can't be previewed in the browser. Download the file to view its contents.",
        unsupportedTitle: 'Preview not available',
        unsupportedMessage:
          "This file type can't be previewed in the browser. Download the file to view it.",
        notebookParseError: "This notebook couldn't be parsed.",
        copyUri: 'Copy URI',
        download: 'Download',
        close: 'Close',
        zoomIn: 'Zoom in',
        zoomOut: 'Zoom out',
        previousFile: 'Previous file',
        nextFile: 'Next file',
        csvRows: (count: number, columns: number) => `${count} rows · ${columns} columns`,
        csvFirstRows: (count: number, columns: number) =>
          `First ${count} rows · ${columns} columns`,
        head: 'Head',
        tail: 'Tail',
        firstLines: (count: number) => `First ${count} lines`,
        lastLines: (count: number) => `Last ${count} lines`,
        notebookOutput: 'Notebook output',
      },
      createFolder: {
        action: 'New folder',
        submit: 'Create folder',
        creating: 'Creating folder…',
        folder: 'Folder',
        namePlaceholder: 'Folder name',
        success: (name: string) => `Created ${name}.`,
        error: (message: string) => `Couldn't create folder: ${message}`,
        invalidTarget: 'Select a folder before creating a new folder.',
        noWriteAccess: 'You do not have write access to this storage.',
        unsupported: 'Folder creation is not supported for this storage.',
        validation: {
          reserved: 'The folder name cannot be . or ..',
          separator: 'Folder names cannot include / or \\.',
          exists: 'An item with this name already exists.',
        },
      },
      readOnly: 'Read-only',
      cors: {
        explanation: {
          title: 'CORS Configuration Required',
          description:
            'This storage location cannot be accessed from the browser because it is missing Cross-Origin Resource Sharing (CORS) rules.',
          action: 'You can automatically configure these rules to allow access from this domain.',
          note: 'Note: Changes may take up to 30 seconds to propagate.',
        },
        actions: {
          retry: 'Retry Connection',
          addRules: 'Add CORS Rules',
        },
        propagating: {
          title: 'Propagating CORS rules',
          description:
            'The storage provider is rolling out the new rules to its endpoints. This usually completes within a minute.',
          stages: {
            submitted: 'Submitted',
            propagating: 'Propagating',
            verified: 'Verified',
          },
          telemetry: {
            probing: 'probing every 3s',
          },
        },
      },
      selectedCount: (count: number) => `${count} selected`,
      loadingMore: 'Loading more items…',
      loadMore: 'Load more',
      retry: 'Retry',
      partialCount: (count: number) => `${count.toLocaleString()}+ items`,
      notFound: {
        title: (name: string) => `Couldn't find ${name}`,
        description:
          'It may have been moved or deleted, or it may sit further into a folder than we have listed.',
        retry: 'Try again',
      },
      treeMoreCount: (count: number) => `${count.toLocaleString()} more`,
      treeMoreCountPartial: (count: number) => `${count.toLocaleString()}+ more`,
      messages: {
        noWriteAccess: 'You do not have write access to this storage.',
        uploadsUnsupported: 'Uploads are not supported for this storage.',
        noFilesForDownload: 'No files selected for download.',
        downloadLinkFailed: 'Failed to generate download link',
        fileLinkFailed: 'Failed to generate file link',
        fileLinkCopied: 'File link copied to clipboard',
        noUri: 'No URI available for this file.',
        uriCopied: 'URI copied to clipboard',
        uriCopyFailed: 'Failed to copy URI',
        storageUnavailable: 'This storage is not available at the moment. Please try again later.',
        waitForCurrentUpload:
          'Please wait for the current upload to finish before starting a new one.',
        waitForUpload: 'Please wait for the upload to finish.',
        downloadUnsupported:
          'Download is not supported for this storage at the moment. Please check back later.',
        sharingUnsupported:
          'Sharing is not supported for this storage at the moment. Please check back later.',
        deleteUnsupported:
          'Delete is not supported for this storage at the moment. Please check back later.',
        uploadUnsupported:
          'Upload is not supported for this storage at the moment. Please check back later.',
        noItemsForDeletion: 'No items selected for deletion.',
        deleting: 'Deleting item(s) from storage...',
        deleteSomeFailed: 'Failed to delete one or more items. Please try again.',
        deleteSuccess: 'Deleted item(s) from storage successfully!',
        deleteFailed: (message: string) => `Failed to delete item(s): ${message}`,
        noFilesToUpload: 'No files to upload or target path not selected.',
        invalidUploadTarget: 'This target path is not valid for upload.',
        uploadInitFailed: 'Failed to initialize upload session. Please try again.',
        uploadQueuedInfo:
          'Another upload is in progress. This upload will be added to the queue and handled once the previous upload finishes.',
        connectFailed:
          'Failed to connect to storage provider. Please check your storage settings and try again.',
        corsNoStorage: 'No storage selected',
        corsAdded: 'CORS rules added successfully',
        corsPropagating: 'CORS rules were added, but are still propagating. Try again in a moment.',
      },
      chrome: {
        explorer: 'Explorer',
        refresh: 'Refresh',
        collapse: 'Collapse',
        upload: 'Upload',
        download: 'Download',
        downloadFromBrowser: 'From browser',
        access: 'Access',
        manageAccess: 'Manage Access',
        delete: 'Delete',
        copyToClipboard: 'Copy to clipboard',
        selectAll: 'Select all',
        name: 'Name',
        size: 'Size',
        created: 'Created',
        hash: 'Hash',
        storageIconAlt: 'An icon for the storage',
      },
      confirmUpload: {
        title: 'Confirm Upload',
        text: (path: string) =>
          `Please confirm the following objects you want to upload to ${path}.`,
        defaultPath: 'the selected path',
        noPath: 'No path selected',
        confirm: 'Confirm',
        target: 'Target:',
        totalSize: 'Total Size:',
        sizeLimitTitle: 'Upload Size Limit Exceeded',
        sizeLimitBody: (total: string, max: string) =>
          `The total upload size (${total}) exceeds the maximum allowed limit of ${max}.`,
        sizeLimitHint: 'Please reduce the number of files or upload them in smaller batches.',
      },
      confirmDelete: {
        title: 'Confirm Delete',
        text: 'Are you sure you want to delete the following item(s)? Folders are deleted with everything inside them. This action cannot be undone.',
        action: 'Delete',
      },
      empty: {
        nothingSelected: 'Nothing selected',
        nothingSelectedHint: 'Pick a folder or file from the tree to see its contents.',
        folderEmpty: 'This folder is empty',
        dropHint: 'Drag files or a folder here to upload.',
        readOnlyHint: 'You have read-only access to this storage.',
        connectionIssue: 'Connection issue',
        tryAgain: 'Try again',
        shareThisFile: 'Share this file',
      },
      upload: {
        inQueue: (position: number, total: number) => `In Queue (#${position} of ${total})`,
        queuedShort: (position: number, total: number) => `Queued #${position} / ${total}`,
        destination: 'Destination:',
        eta: 'ETA:',
        uploading: 'Uploading...',
        completeTitle: 'Upload Complete!',
        completeShort: 'Completed',
        failedTitle: 'Upload Failed',
        failedShort: 'Failed',
        unknownTitle: 'Unknown Status',
        unknownShort: 'Unknown',
        cancelled: 'Cancelled',
        completed: 'Completed',
        failed: 'Failed',
        totalSize: 'Total size:',
        size: 'Size:',
        calculating: 'Calculating...',
        expandDetails: 'Expand details',
        minimizeDetails: 'Minimize details',
        sessionNotQueued: (id: string, status: string) =>
          `Upload session with ID ${id} is not queued, current status is ${status}`,
        allCancelled: (count: number) => `All ${count} file(s) were cancelled by user.`,
        someUploaded: (count: number) => `${count} file(s) uploaded successfully!`,
        someCancelled: (count: number) => `${count} file(s) cancelled by user.`,
        allUploaded: 'Upload file(s) successfully!',
        failedSummary: (failed: number, total: number) =>
          `${failed}/${total} files failed to upload:`,
        failReasonGeneric:
          'The file(s) may be too large or the connection may have been interrupted.',
        refreshFailed: (name: string, message: string) =>
          `Failed to refresh storage data for ${name}. ${message}. Please try again.`,
        unknownError: 'Unknown error',
        overallProgress: 'Overall Progress',
      },
    },
    form: {
      invalidDuration: 'Enter a duration as DD-HH:MM:SS or HH:MM:SS.',
      durationOutOfRange: (min, max) => `Must be between ${min} and ${max}.`,
      durationBelowMin: (min) => `Must be at least ${min}.`,
    },
    time: {
      now: 'now',
      minutes: (n) => `${n}m`,
      hours: (n) => `${n}h`,
      days: (n) => `${n}d`,
      years: (n) => `${n}y`,
    },
    list: {
      copyMenu: 'Copy',
      copy: (label) => `Copy ${label}`,
      copied: (label) => `Copied ${label}`,
      couldntCopy: (label) => `Couldn't copy ${label}`,
      moreActions: 'More actions',
      labelName: 'name',
      labelEmail: 'email',
      labelUsername: 'username',
      labelUid: 'UID',
      labelId: 'ID',
      labelUrl: 'URL',
      couldNotLoad: (noun) => `Couldn't load ${noun}`,
      displayOptions: 'Display options',
      grouping: 'Grouping',
      ordering: 'Ordering',
      orderDefault: 'Default',
      orderFavorites: 'Favorites',
      ascending: 'Ascending',
      descending: 'Descending',
      columnHeaders: 'Column headers',
      showColumnHeaders: 'Show column headers',
      showActions: 'Show actions',
      showRowActions: 'Show row actions',
      alwaysShowActions: 'Always show actions',
      alwaysShowRowActions: 'Always show row actions',
      displayProperties: 'Display properties',
      pinnedActions: 'Pinned actions',
      pinnedActionsHelp:
        "Pinned actions show as quick buttons on the right of each row (on hover), alongside the ⋯ menu. Each only appears on rows where that action is available, so a row's buttons vary by its type and status.",
      reset: 'Reset',
      none: 'None',
      filter: 'Filter',
      clear: 'Clear',
      pager: (start, end, total) => `${start}–${end} of ${total}`,
      perPage: 'Per page',
      paginationPrevious: 'Previous',
      paginationNext: 'Next',
      paginationShowing: (name, start, end) => (
        <>
          Showing {name} <span className="font-medium">{start}</span> to{' '}
          <span className="font-medium">{end}</span>
        </>
      ),
      paginationShowingTimeRange: (name, startTime, endTime) => (
        <>
          Showing {name} from <span className="font-medium">{startTime}</span> to{' '}
          <span className="font-medium">{endTime}</span>
        </>
      ),
    },
  },
  navigation: {
    goTo: (to) => window.location.assign(to),
    openStepSource: (_uses, sourceUrl) => {
      if (sourceUrl) {
        window.open(sourceUrl, '_blank')
      }
    },
    openExternal: (href) => window.open(href, '_blank'),
  },
  data: {
    useRunFile: defaultUseRunFile,
    usePersistedState: useLocalStoragePersistedState,
  },
  slots: {},
}

const UIContext = createContext<UIProviderValue>(DEFAULTS)

export function useNotify(): UINotify {
  return useContext(UIContext).notify
}

export function useStrings(): UIStrings {
  return useContext(UIContext).strings
}

export function useNavigation(): UINavigation {
  return useContext(UIContext).navigation
}

export function useSlots(): UISlots {
  return useContext(UIContext).slots
}

interface LoadedEngine {
  promise: Promise<WorkflowEngine>
  engine?: WorkflowEngine
}

const loadedEngines = new WeakMap<() => Promise<WorkflowEngine>, LoadedEngine>()

function loadEngine(load: () => Promise<WorkflowEngine>): LoadedEngine {
  let entry = loadedEngines.get(load)
  if (!entry) {
    const created: LoadedEngine = { promise: load() }
    created.promise.then((engine) => {
      created.engine = engine
    })
    loadedEngines.set(load, created)
    entry = created
  }
  return entry
}

function resolveEngine(source: WorkflowEngineSource): WorkflowEngine {
  if (typeof source !== 'function') {
    return source
  }
  const entry = loadEngine(source)
  return entry.engine ?? use(entry.promise)
}

/** The engine when one is provided and `enabled`; suspends while a loader resolves. */
export function useOptionalWorkflowEngine(enabled = true): WorkflowEngine | undefined {
  const source = useContext(UIContext).engine
  if (!enabled || !source) {
    return undefined
  }
  return resolveEngine(source)
}

export function useWorkflowEngine(): WorkflowEngine {
  const source = useContext(UIContext).engine
  if (!source) {
    throw new Error('Workflow forms and graphs need a UIProvider with an engine.')
  }
  return resolveEngine(source)
}

/** Resolves the engine without suspending, for async callers such as editor completions. */
export function useWorkflowEngineLoader(): () => Promise<WorkflowEngine | undefined> {
  const source = useContext(UIContext).engine
  return useCallback(async () => {
    if (!source) {
      return undefined
    }
    return typeof source === 'function' ? loadEngine(source).promise : source
  }, [source])
}

export function useProvisionCorsRules(): UIData['provisionCorsRules'] {
  return useContext(UIContext).data.provisionCorsRules
}

export function useRunFile(
  slug: string,
  path: string | null,
  options?: { refreshInterval?: number },
): RunFileResult {
  const { useRunFile: boundUseRunFile } = useContext(UIContext).data
  return boundUseRunFile(slug, path, options)
}

export function usePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const { usePersistedState: boundUsePersistedState } = useContext(UIContext).data
  return boundUsePersistedState(key, defaultValue)
}

export function UIProvider({
  notify,
  strings,
  navigation,
  data,
  slots,
  engine,
  children,
}: {
  notify?: Partial<UINotify>
  strings?: {
    [G in keyof UIStrings]?: UIStrings[G] extends object ? Partial<UIStrings[G]> : UIStrings[G]
  }
  navigation?: Partial<UINavigation>
  data?: Partial<UIData>
  slots?: UISlots
  engine?: WorkflowEngineSource
  children: React.ReactNode
}) {
  // Loading after mount keeps the engine off the first paint, and means the
  // first form or graph rarely has to suspend for it.
  useEffect(() => {
    if (typeof engine === 'function') {
      loadEngine(engine)
    }
  }, [engine])
  const value = useMemo(
    () => ({
      notify: { ...DEFAULTS.notify, ...notify },
      strings: {
        loading: strings?.loading ?? DEFAULTS.strings.loading,
        modal: { ...DEFAULTS.strings.modal, ...strings?.modal },
        common: { ...DEFAULTS.strings.common, ...strings?.common },
        dropdown: { ...DEFAULTS.strings.dropdown, ...strings?.dropdown },
        logviewer: { ...DEFAULTS.strings.logviewer, ...strings?.logviewer },
        dag: { ...DEFAULTS.strings.dag, ...strings?.dag },
        jobActions: {
          ...DEFAULTS.strings.jobActions,
          ...strings?.jobActions,
        },
        fileExplorer: {
          ...DEFAULTS.strings.fileExplorer,
          ...strings?.fileExplorer,
        },
        form: { ...DEFAULTS.strings.form, ...strings?.form },
        time: { ...DEFAULTS.strings.time, ...strings?.time },
        list: { ...DEFAULTS.strings.list, ...strings?.list },
      },
      navigation: { ...DEFAULTS.navigation, ...navigation },
      data: { ...DEFAULTS.data, ...data },
      slots: slots ?? DEFAULTS.slots,
      engine,
    }),
    [notify, strings, navigation, data, slots, engine],
  )
  return <UIContext.Provider value={value}>{children}</UIContext.Provider>
}
