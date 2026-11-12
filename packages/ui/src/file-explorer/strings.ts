// English defaults for the file explorer; a host supplies translations through UIProvider.

import { useMemo } from 'react'
import { mergeStrings, useStrings } from '../components/Provider'

/** The file explorer's text, which a host translates through UIProvider's `fileExplorer`. */
export interface FileExplorerText {
  preview: {
    shareFile: string
    open: string
    userType: string
    select: (name: string) => string
    viewDetails: string
    openFolder: string
    /** A path's page in the app, as in "Copy link". */
    link: string
    /** An object's key within its storage, as in "Copy path". */
    path: string
    detailsTab: string
    previewTab: string
    preview: string
    openFullPreview: string
    /** Names the choice between a compact preview and the full window. */
    previewLayout: string
    /** The preview in a panel over the page, beside `fullWindow`. */
    compact: string
    fullWindow: string
    streamed: string
    streamedTooltip: string
    loading: string
    linkError: string
    errorTitle: string
    previewError: string
    tooLarge: string
    tooLargeSize: (size: string) => string
    downloadInstead: string
    archiveTitle: string
    archiveMessage: string
    unsupportedTitle: string
    unsupportedMessage: string
    notebookParseError: string
    copyUri: string
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
    unsupported: string
    validation: {
      reserved: string
      separator: string
      exists: string
    }
  }
  rename: {
    action: string
    submit: string
    renaming: string
    file: string
    namePlaceholder: string
    success: (name: string) => string
    failed: string
    unsupported: string
    validation: {
      reserved: string
      separator: string
      exists: string
    }
  }
  readOnly: string
  /** Names what a copy took, in its toast. */
  fileLink: string
  uri: string
  cors: {
    explanation: {
      title: string
      description: string
      action: string
      note: string
    }
    actions: {
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
  partialCount: (count: number) => string
  notFound: {
    title: (name: string) => string
    description: string
  }
  treeMoreCount: (count: number) => string
  treeMoreCountPartial: (count: number) => string
  messages: {
    noWriteAccess: string
    uploadsUnsupported: string
    transferLimitExceeded: (limit: string) => string
    noFilesForDownload: string
    downloadLinkFailed: string
    fileLinkFailed: string
    noUri: string
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
    previewUnsupported: string
    /** A folder's listing failed; `name` is the folder. */
    loadFailed: (name: string, message: string) => string
    /** A failure that came with no message of its own. */
    unknownError: string
    /** Why a storage service refused, recognized by its error code. */
    cloudErrors: {
      accessDenied: string
      notFound: string
      credentials: string
      throttled: string
      network: string
      /** Any other error from the storage service, whose own text shows below it. */
      other: string
    }
    /** Names the error's own text for its copy button: "Copy error". */
    errorDetail: string
  }
  chrome: {
    explorer: string
    upload: string
    downloadFromBrowser: string
    access: string
    manageAccess: string
    selectAll: string
    name: string
    size: string
    created: string
    hash: string
    storageIconAlt: string
    type: string
    storages: string
    groupBy: string
    groupByUser: string
    groupByType: string
    modified: string
    lastModified: string
    contentType: string
    storageClass: string
    details: string
    selectFiles: string
    selectFolder: string
    /** Names the table of a folder's contents. */
    files: string
    /** Names the folder tree. */
    folders: string
    /** Names the trail from the storage down to the open folder. */
    location: string
    /** Explains a share link, beside Share. */
    shareHelp: string
  }
  confirmUpload: {
    title: string
    text: (path: string) => string
    defaultPath: string
    noPath: string
    confirm: string
    target: string
    sizeLimitTitle: string
    sizeLimitBody: (total: string, max: string) => string
    sizeLimitHint: string
    skippedOverLimit: (limit: string) => string
  }
  confirmDelete: {
    title: string
    text: string
  }
  empty: {
    nothingSelected: string
    nothingSelectedHint: string
    folderEmpty: string
    dropHint: string
    readOnlyHint: string
    connectionIssue: string
    shareThisFile: string
  }
  upload: {
    inQueue: (position: number, total: number) => string
    queuedShort: (position: number, total: number) => string
    destination: string
    eta: string
    uploading: string
    completeTitle: string
    failedTitle: string
    unknownTitle: string
    unknownShort: string
    canceled: string
    completed: string
    failed: string
    totalSize: string
    size: string
    calculating: string
    /** In place of the time left once only a few seconds remain. */
    almostDone: string
    expandDetails: string
    minimizeDetails: string
    sessionNotQueued: (id: string, status: string) => string
    allCanceled: (count: number) => string
    someUploaded: (count: number) => string
    someCanceled: (count: number) => string
    allUploaded: string
    failedSummary: (failed: number, total: number) => string
    failReasonGeneric: string
    refreshFailed: (name: string, message: string) => string
    unknownError: string
    overallProgress: string
    cancelFile: (name: string) => string
    confirmCancelFile: string
    confirmCancelAll: string
    filesDone: (done: number, total: number) => string
    progress: (uploading: number, done: number, total: number) => string
    fileCount: (count: number) => string
    keepPageOpen: string
  }
}

export const FILE_EXPLORER_STRINGS: FileExplorerText = {
  preview: {
    shareFile: 'Share file',
    open: 'Open',
    userType: 'User',
    select: (name: string) => `Select ${name}`,
    viewDetails: 'View details',
    openFolder: 'Open folder',
    link: 'link',
    path: 'path',
    detailsTab: 'Details',
    previewTab: 'Preview',
    preview: 'Preview',
    openFullPreview: 'Open full preview',
    previewLayout: 'Preview layout',
    compact: 'Compact',
    fullWindow: 'Full window',
    streamed: 'Streamed',
    streamedTooltip:
      'Streamed securely to your browser over a short-lived signed URL — never written to disk.',
    loading: 'Loading preview…',
    linkError: "Couldn't generate a preview link for this file.",
    errorTitle: "Couldn't load preview",
    previewError: "This file couldn't be previewed in your browser.",
    tooLarge: 'This file is too large to preview in the browser.',
    tooLargeSize: (size: string) => `This file is ${size}, too large to preview in the browser.`,
    downloadInstead: 'Download instead',
    archiveTitle: "Can't preview archives",
    archiveMessage:
      "Archive files can't be previewed in the browser. Download the file to view its contents.",
    unsupportedTitle: 'Preview not available',
    unsupportedMessage:
      "This file type can't be previewed in the browser. Download the file to view it.",
    notebookParseError: "This notebook couldn't be parsed.",
    copyUri: 'Copy URI',
    previousFile: 'Previous file',
    nextFile: 'Next file',
    csvRows: (count: number, columns: number) => `${count} rows · ${columns} columns`,
    csvFirstRows: (count: number, columns: number) => `First ${count} rows · ${columns} columns`,
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
    unsupported: 'Folder creation is not supported for this storage.',
    validation: {
      reserved: 'The folder name cannot be . or ..',
      separator: 'Folder names cannot include / or \\.',
      exists: 'An item with this name already exists.',
    },
  },
  rename: {
    action: 'Rename',
    submit: 'Rename',
    renaming: 'Renaming…',
    file: 'File',
    namePlaceholder: 'New name',
    success: (name: string) => `Renamed to ${name}.`,
    failed: "Couldn't rename.",
    unsupported: 'Renaming is not supported for this storage.',
    validation: {
      reserved: 'The name cannot be . or ..',
      separator: 'Names cannot include / or \\.',
      exists: 'An item with this name already exists.',
    },
  },
  readOnly: 'Read-only',
  fileLink: 'file link',
  uri: 'URI',
  cors: {
    explanation: {
      title: 'CORS configuration required',
      description:
        'This storage location cannot be accessed from the browser because it is missing Cross-Origin Resource Sharing (CORS) rules.',
      action: 'You can automatically configure these rules to allow access from this domain.',
      note: 'Note: Changes may take up to 30 seconds to propagate.',
    },
    actions: {
      addRules: 'Add CORS rules',
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
  partialCount: (count: number) => `${count.toLocaleString()}+ items`,
  notFound: {
    title: (name: string) => `Couldn't find ${name}`,
    description:
      'It may have been moved or deleted, or it may sit further into a folder than we have listed.',
  },
  treeMoreCount: (count: number) => `${count.toLocaleString()} more`,
  treeMoreCountPartial: (count: number) => `${count.toLocaleString()}+ more`,
  messages: {
    noWriteAccess: 'You do not have write access to this storage.',
    uploadsUnsupported: 'Uploads are not supported for this storage.',
    transferLimitExceeded: (limit: string) =>
      `Larger than the ${limit} limit for one download or upload here.`,
    noFilesForDownload: 'No files selected for download.',
    downloadLinkFailed: 'Failed to generate download link',
    fileLinkFailed: 'Failed to generate file link',
    noUri: 'No URI available for this file.',
    storageUnavailable: 'This storage is not available at the moment. Please try again later.',
    waitForCurrentUpload: 'Please wait for the current upload to finish before starting a new one.',
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
    deleteSuccess: 'Deleted from storage.',
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
    previewUnsupported: 'Preview is not supported for this storage.',
    loadFailed: (name, message) => `Failed to load contents for ${name}: ${message}`,
    unknownError: 'Unknown error',
    cloudErrors: {
      accessDenied: 'You don’t have access to this storage',
      notFound: 'This bucket or file doesn’t exist',
      credentials: 'The storage credentials expired or aren’t valid',
      throttled: 'The storage service is busy. Try again in a moment',
      network: 'Couldn’t reach the storage service',
      other: 'The storage service returned an error',
    },
    errorDetail: 'error',
  },
  chrome: {
    explorer: 'Explorer',
    upload: 'Upload',
    downloadFromBrowser: 'From browser',
    access: 'Access',
    manageAccess: 'Manage access',
    selectAll: 'Select all',
    name: 'Name',
    size: 'Size',
    created: 'Created',
    hash: 'Hash',
    storageIconAlt: 'An icon for the storage',
    type: 'Type',
    storages: 'Storages',
    groupBy: 'Group by',
    groupByUser: 'User',
    groupByType: 'Type',
    modified: 'Modified',
    lastModified: 'Last modified',
    contentType: 'Content type',
    storageClass: 'Storage class',
    details: 'Details',
    selectFiles: 'Select files',
    selectFolder: 'Select folder',
    files: 'Files',
    folders: 'Folders',
    location: 'Location',
    shareHelp:
      "This will generate a pre-signed URL for this file. Anyone with this link can temporarily access and download the file, even if they don't have an account. The link will automatically expire after 12 hours.",
  },
  confirmUpload: {
    title: 'Confirm upload',
    text: (path: string) => `Please confirm the following objects you want to upload to ${path}.`,
    defaultPath: 'the selected path',
    noPath: 'No path selected',
    confirm: 'Confirm',
    target: 'Target:',
    sizeLimitTitle: 'Upload size limit exceeded',
    sizeLimitBody: (total: string, max: string) =>
      `The total upload size (${total}) exceeds the maximum allowed limit of ${max}.`,
    sizeLimitHint: 'Please reduce the number of files or upload them in smaller batches.',
    skippedOverLimit: (limit: string) =>
      `Larger than the ${limit} limit for one upload here, so these are skipped:`,
  },
  confirmDelete: {
    title: 'Confirm delete',
    text: 'Are you sure you want to delete the following item(s)? Folders are deleted with everything inside them. This action cannot be undone.',
  },
  empty: {
    nothingSelected: 'Nothing selected',
    nothingSelectedHint: 'Pick a folder or file from the tree to see its contents.',
    folderEmpty: 'This folder is empty',
    dropHint: 'Drag files or a folder here to upload.',
    readOnlyHint: 'You have read-only access to this storage.',
    connectionIssue: 'Connection issue',
    shareThisFile: 'Share this file',
  },
  upload: {
    inQueue: (position: number, total: number) => `In queue (#${position} of ${total})`,
    queuedShort: (position: number, total: number) => `Queued #${position} / ${total}`,
    destination: 'Destination:',
    eta: 'ETA:',
    uploading: 'Uploading...',
    completeTitle: 'Upload complete',
    failedTitle: 'Upload failed',
    unknownTitle: 'Unknown status',
    unknownShort: 'Unknown',
    canceled: 'Canceled',
    completed: 'Completed',
    failed: 'Failed',
    totalSize: 'Total size:',
    size: 'Size:',
    calculating: 'Calculating…',
    almostDone: 'Almost done',
    expandDetails: 'Expand details',
    minimizeDetails: 'Minimize details',
    sessionNotQueued: (id: string, status: string) =>
      `Upload session with ID ${id} is not queued, current status is ${status}`,
    allCanceled: (count: number) => `All ${count} file(s) were canceled by user.`,
    someUploaded: (count: number) => `${count} file(s) uploaded.`,
    someCanceled: (count: number) => `${count} file(s) canceled by user.`,
    allUploaded: 'Uploaded the file(s).',
    failedSummary: (failed: number, total: number) => `${failed}/${total} files failed to upload:`,
    failReasonGeneric: 'The file(s) may be too large or the connection may have been interrupted.',
    refreshFailed: (name: string, message: string) =>
      `Failed to refresh storage data for ${name}. ${message}. Please try again.`,
    unknownError: 'Unknown error',
    overallProgress: 'Overall progress',
    cancelFile: (name) => `Cancel ${name}`,
    confirmCancelFile: 'Cancel?',
    confirmCancelAll: 'Cancel all uploading files?',
    filesDone: (done: number, total: number) => `${done} / ${total} files done`,
    progress: (uploading: number, done: number, total: number) =>
      uploading > 0
        ? `${uploading} uploading (${done} / ${total} done)`
        : `${done} / ${total} done`,
    fileCount: (count: number) => (count === 1 ? '1 file' : `${count.toLocaleString()} files`),
    keepPageOpen: "Please don't refresh this page during upload to prevent any data loss.",
  },
}

/** The file explorer's strings: the host's translations over the English defaults. */
export function useFileExplorerStrings(): FileExplorerText {
  const { fileExplorer: overrides } = useStrings()
  return useMemo(() => mergeStrings(FILE_EXPLORER_STRINGS, overrides), [overrides])
}
