import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { createContext, use, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { WorkflowAction, WorkflowEditing } from '../editing'
import type { WorkflowEngine } from '../engine'
import type { GraphEditorText, InputsEditorText } from '../graph/editorStrings'
import type { RunLink } from '../graph/types'
import { safeUrl } from '../safeUrl'
import { useLocalPersistedState } from './persistedState'
import { Toaster } from './Toast'
import { TooltipProvider } from './Tooltip'

export interface UIStrings {
  modal: {
    creating: string
    addDescription: string
    advanced: string
    favorite: string
    favorited: string
    favoriteHintOn: string
    favoriteHintOff: string
  }
  common: {
    cancel: string
    close: string
    save: string
    clear: string
    delete: string
    download: string
    retry: string
    reset: string
    apply: string
    dismiss: string
    /** Names the region toasts appear in. */
    notifications: string
    rename: string
    share: string
    send: string
    filter: string
    /** A filter's choice that turns it off, showing everything. */
    all: string
    loading: string
    loadMore: string
    showMore: string
    showLess: string
    previous: string
    next: string
    zoomIn: string
    zoomOut: string
    expandAll: string
    collapseAll: string
    moveUp: string
    moveDown: string
    undo: string
    redo: string
    duplicate: string
    copied: string
    copyToClipboard: string
    /** The toast after a copy that names nothing. */
    copiedToClipboard: string
    copyFailed: string
    /** `label` names what is copied, such as "email address". */
    copyThing: (label: string) => string
    copiedThing: (label: string) => string
    copyThingFailed: (label: string) => string
    /** A name field's rule: the characters a key or identifier allows. */
    invalidName: string
    invalidNumber: string
    copy: string
    /** A masked value's eye toggle, for a password or a secret. */
    showValue: string
    hideValue: string
    expand: string
    collapse: string
    showHiddenFields: string
    showHiddenFieldsHint: string
    jsonHasErrors: string
    add: string
    create: string
    remove: string
    sort: string
    userAvatar: string
    moreInfo: string
    /** The name of a menu of actions on a page or row. */
    actions: string
    edit: string
    submit: string
    search: string
    clearSearch: string
    filterPlaceholder: string
    breadcrumb: string
    yes: string
    no: string
    /** Read after a link that opens a new tab. */
    opensInNewTab: string
    /** Names the handle that resizes a panel. */
    resizePanel: string
    /** A resizable panel's width, read aloud. */
    panelWidth: (px: number) => string
    refresh: string
    refreshing: string
    /** A refresh button's label once it knows when the data was fetched. */
    updated: (ago: string) => string
  }
  dropdown: {
    select: (type: string) => string
    noOptionsFound: string
    showOptions: string
    /** The row that adds typed text as a new value. */
    add: (text: string) => string
    /** In place of the placeholder once a field holds as many values as it takes. */
    limitReached: (max: number) => string
  }
  datePicker: {
    /** The button's text while no date is chosen. */
    pickDate: string
    /** Names the time beside the date. */
    time: string
    previousMonth: string
    nextMonth: string
  }
  theme: {
    /** Names the light, dark or system choice. */
    appearance: string
    light: string
    dark: string
    system: string
    /** Names the choice of which mode's colors the controls edit. */
    editing: string
    presets: string
    /** The background a theme is generated from. */
    base: string
    accent: string
    contrast: string
    /** Under the contrast slider. */
    contrastHelp: string
    /** The switch that gives the sidebar its own colors. */
    customSidebar: string
    sidebarBase: string
    sidebarAccent: string
    code: string
    codeStyle: (style: 'balanced' | 'vivid' | 'muted' | 'mono') => string
    /** Names a color input's picker, beside its hex field. */
    pick: (name: string) => string
    invalidColor: string
    copy: string
    /** The thing a copy toast names. */
    copied: string
    import: string
    importLabel: string
    importPlaceholder: string
    apply: string
    reset: string
    /** Why a pasted theme was refused. */
    importError: (code: 'json' | 'version' | 'shape' | 'color' | 'range', path: string) => string
    preview: string
    previewNav: readonly string[]
    previewHeading: string
    previewBody: string
    previewMuted: string
    previewLink: string
    previewButton: string
    previewSearch: string
    previewPassed: string
    previewFailed: string
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
    invalidStartTime: string
    invalidEndTime: string
    endBeforeStart: string
    endInFuture: string
    follow: string
    following: string
  }
  dag: {
    workflow: string
    run: string
    status: string
    runtime: string
    submitted: string
    resetView: string
    previousGraph: string
    nextGraph: string
    matrixOf: (name: string) => string
    jobCount: (count: number) => string
    loadingLogs: string
    noLogFound: string
    logLoadFailed: string
    statusLabel: (status: string) => string
    statusReason: (reason: string | undefined | null) => string | undefined
    /** A run's general log, beside its summary. */
    generalLog: string
    previousStep: string
    nextStep: string
    /** The view toggle: the graph, and the list of jobs and steps. */
    graphView: string
    treeView: string
    summary: string
    dependsOn: string
    subworkflow: string
    annotations: string
    annotationType: { error: string; warning: string; notice: string }
    /** Where an annotation came from, under its message. */
    annotationSource: (job: string, step: string) => string
    /** A step without a name, numbered from 0 as the run reports it. */
    stepNumber: (index: number) => string
  }
  jobActions: {
    openSubworkflowLogs: string
    openOriginalWorkflow: string
    openInNewGraph: string
  }
  /** The visual editor's text a host translates; the editor fills in the rest in English. */
  graphEditor: Partial<GraphEditorText>
  inputsEditor: Partial<InputsEditorText>
  fileExplorer: {
    preview: {
      shareFile: string
      open: string
      userType: string
      select: (name: string) => string
      viewDetails: string
      openFolder: string
      detailsTab: string
      previewTab: string
      preview: string
      openFullPreview: string
      /** Names the choice between a quick look and the full window. */
      previewLayout: string
      quickLook: string
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
      modified: string
      lastModified: string
      contentType: string
      storageClass: string
      details: string
      selectFiles: string
      selectFolder: string
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
  form: {
    /** Under a field the form needs a value in. */
    required: string
    /** Under a field the server rejected without saying why. */
    checkValue: string
    invalidDuration: string
    durationOutOfRange: (min: string, max: string) => string
    durationBelowMin: (min: string) => string
    /** A repeated wizard page's copy, numbered from 1. */
    copyTitle: (title: string, number: number) => string
    addCopy: (title: string) => string
    removeCopy: (title: string) => string
    /** A wizard's steps: what its list of them is called. */
    steps: string
    /** Where a wizard is, numbered from 1. */
    stepOf: (number: number, total: number) => string
    /** The button that opens the list of a wizard's steps. */
    allSteps: string
    /** A step before the current one. */
    stepDone: string
    /** A step with a value to fix. */
    stepNeedsAttention: string
    previousStep: string
    nextStep: string
    /** A wizard's last button, unless its config names its own. */
    runWizard: string
    fixErrorsToContinue: string
    stepFailed: string
    /** A step's name in the list of steps, numbered from 1. */
    stepLabel: (number: number, title: string) => string
  }
  time: {
    now: string
    minutes: (n: number) => string
    hours: (n: number) => string
    days: (n: number) => string
    years: (n: number) => string
  }
  list: {
    moreActions: string
    /** A toolbar toggle's name in the overflow menu, where a row can't be pressed. */
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
    none: string
    searchOptions: string
    /** `atLeast`: `total` is a floor, because the count was capped and more rows follow. */
    pager: (start: number, end: number, total: number, atLeast: boolean) => string
    perPage: string
    paginationPrevious: string
    paginationNext: string
    pagination: string
    removeSearchTerm: (term: string) => string
  }
}

export interface UINavigation {
  goTo: (to: string) => void
  /** Opens the source of a step that runs another workflow, named by its `uses`;
   * `sourceUrl` is a page the server resolved for it, when there is one. */
  openStepSource: (uses: string, sourceUrl?: string) => void
  openExternal: (href: string) => void
}

export type WorkflowJsonRef =
  | { kind: 'marketplace'; slug: string; version: string }
  | { kind: 'workflow'; name: string }

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
  resolveWorkflowJson?: (ref: WorkflowJsonRef) => Promise<unknown>
  /** The built-in actions a workflow step can use, for the editor's step form. */
  workflowActions?: Record<string, WorkflowAction>
  resolveSecretVariables?: () => Promise<string[]>
  /** Repository files, so the editor can read the workflow a step's repository `uses` names. */
  repoSuggestions?: {
    file: (repo: string, ref: string, path: string) => Promise<string>
  }
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
/** An internal navigation link. It passes every other prop, ref included, to
 *  its anchor, so menus and tooltips can attach to it. */
export type UILinkComponent = React.ComponentType<
  React.ComponentPropsWithRef<'a'> & { href: string }
>

const DefaultLink: UILinkComponent = ({ href, ...rest }) => <a href={safeUrl(href)} {...rest} />

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

interface UIProviderValue {
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

const DEFAULTS: UIProviderValue = {
  strings: {
    modal: {
      creating: 'Creating…',
      addDescription: 'Add description…',
      advanced: 'Advanced',
      favorite: 'Favorite',
      favorited: 'Favorited',
      favoriteHintOn: "Your item will be favorited when it's created",
      favoriteHintOff: "Favorite your item when it's created",
    },
    common: {
      cancel: 'Cancel',
      close: 'Close',
      save: 'Save',
      clear: 'Clear',
      delete: 'Delete',
      download: 'Download',
      retry: 'Retry',
      reset: 'Reset',
      apply: 'Apply',
      dismiss: 'Dismiss',
      notifications: 'Notifications',
      rename: 'Rename',
      share: 'Share',
      send: 'Send',
      filter: 'Filter',
      all: 'All',
      loading: 'Loading…',
      loadMore: 'Load more',
      showMore: 'Show more',
      showLess: 'Show less',
      previous: 'Previous',
      next: 'Next',
      zoomIn: 'Zoom in',
      zoomOut: 'Zoom out',
      expandAll: 'Expand all',
      collapseAll: 'Collapse all',
      moveUp: 'Move up',
      moveDown: 'Move down',
      undo: 'Undo',
      redo: 'Redo',
      duplicate: 'Duplicate',
      copied: 'Copied',
      copyToClipboard: 'Copy to clipboard',
      copiedToClipboard: 'Copied to clipboard',
      copyFailed: "Couldn't copy to the clipboard",
      copyThing: (label) => `Copy ${label}`,
      copiedThing: (label) => `Copied ${label}`,
      copyThingFailed: (label) => `Couldn't copy ${label}`,
      invalidName: 'Use letters, numbers, dashes, and underscores.',
      invalidNumber: 'Use a number.',
      copy: 'Copy',
      showValue: 'Show value',
      hideValue: 'Hide value',
      expand: 'Expand',
      collapse: 'Collapse',
      showHiddenFields: 'Show hidden fields',
      add: 'Add',
      create: 'Create',
      showHiddenFieldsHint:
        "Includes fields hidden by default because they're specific to each resource, such as name and group.",
      jsonHasErrors: 'JSON has errors, please fix before saving',
      remove: 'Remove',
      sort: 'Sort',
      userAvatar: 'User avatar',
      moreInfo: 'More information',
      actions: 'Actions',
      edit: 'Edit',
      submit: 'Submit',
      search: 'Search',
      clearSearch: 'Clear search',
      filterPlaceholder: 'Filter…',
      breadcrumb: 'Breadcrumb',
      yes: 'Yes',
      no: 'No',
      opensInNewTab: '(opens in a new tab)',
      resizePanel: 'Resize panel',
      panelWidth: (px) => `${px} pixels wide`,
      refresh: 'Refresh',
      refreshing: 'Refreshing',
      updated: (ago) => `Updated ${ago}`,
    },
    dropdown: {
      select: (type) => `Select ${type}`,
      noOptionsFound: 'No options found',
      showOptions: 'Show options',
      add: (text) => `Add “${text}”`,
      limitReached: (max) => `Up to ${max}`,
    },
    datePicker: {
      pickDate: 'Pick a date',
      time: 'Time',
      previousMonth: 'Previous month',
      nextMonth: 'Next month',
    },
    theme: {
      appearance: 'Appearance',
      light: 'Light',
      dark: 'Dark',
      system: 'System',
      editing: 'Colors for',
      presets: 'Presets',
      base: 'Background',
      accent: 'Accent',
      contrast: 'Contrast',
      contrastHelp: 'Separates surfaces and strengthens text. Text always meets WCAG AA.',
      customSidebar: 'Custom sidebar',
      sidebarBase: 'Sidebar background',
      sidebarAccent: 'Sidebar accent',
      code: 'Code',
      codeStyle: (style) =>
        ({ balanced: 'Balanced', vivid: 'Vivid', muted: 'Muted', mono: 'Monochrome' })[style],
      pick: (name) => `Pick ${name.toLowerCase()}`,
      invalidColor: 'Enter a hex color, such as #1f6feb.',
      copy: 'Copy theme',
      copied: 'theme',
      import: 'Import theme',
      importLabel: 'Theme to import',
      importPlaceholder: 'Paste a copied theme',
      apply: 'Apply',
      reset: 'Reset',
      importError: (code, path) =>
        ({
          json: 'This isn’t a copied theme: it isn’t valid JSON.',
          version: 'This theme is from a version this app can’t read.',
          shape: `This theme is incomplete${path ? ` at ${path}` : ''}.`,
          color: `${path} isn’t a color.`,
          range: `${path} is out of range.`,
        })[code],
      preview: 'Preview',
      previewNav: ['Home', 'Runs', 'Settings'],
      previewHeading: 'Weekly report',
      previewBody: 'Twelve runs finished and two need attention.',
      previewMuted: 'Updated a minute ago',
      previewLink: 'View runs',
      previewButton: 'Run again',
      previewSearch: 'Search runs',
      previewPassed: 'Passed',
      previewFailed: 'Failed',
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
      invalidStartTime: 'Start time is not a valid date.',
      invalidEndTime: 'End time is not a valid date.',
      endBeforeStart: 'End time must be after the start time.',
      endInFuture: 'End time cannot be in the future.',
      follow: 'Follow',
      following: 'Following',
    },
    dag: {
      workflow: 'Workflow',
      run: 'Run',
      status: 'Status',
      runtime: 'Runtime',
      submitted: 'Submitted',
      resetView: 'Reset View',
      previousGraph: 'Back to the previous graph',
      nextGraph: 'Forward to the next graph',
      matrixOf: (name) => `Matrix: ${name}`,
      jobCount: (count) => (count === 1 ? '1 job' : `${count} jobs`),
      loadingLogs: 'Loading logs',
      noLogFound: 'No log found',
      logLoadFailed: 'Log could not be loaded',
      statusLabel: (status) => status,
      statusReason: () => undefined,
      generalLog: 'General log',
      previousStep: 'Previous step',
      nextStep: 'Next step',
      graphView: 'DAG',
      treeView: 'Tree',
      summary: 'Summary',
      dependsOn: 'depends on:',
      subworkflow: '(subworkflow)',
      annotations: 'Annotations',
      annotationType: { error: 'Error', warning: 'Warning', notice: 'Notice' },
      annotationSource: (job, step) => `in ${job} → ${step}`,
      stepNumber: (index) => `step ${index}`,
    },
    jobActions: {
      openSubworkflowLogs: 'Open subworkflow logs',
      openOriginalWorkflow: 'Open original workflow',
      openInNewGraph: 'Open in new graph',
    },
    graphEditor: {},
    inputsEditor: {},
    fileExplorer: {
      preview: {
        shareFile: 'Share file',
        open: 'Open',
        userType: 'User',
        select: (name: string) => `Select ${name}`,
        viewDetails: 'View details',
        openFolder: 'Open folder',
        detailsTab: 'Details',
        previewTab: 'Preview',
        preview: 'Preview',
        openFullPreview: 'Open full preview',
        previewLayout: 'Preview layout',
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
        tooLargeSize: (size: string) =>
          `This file is ${size}, too large to preview in the browser.`,
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
        unsupported: 'Folder creation is not supported for this storage.',
        validation: {
          reserved: 'The folder name cannot be . or ..',
          separator: 'Folder names cannot include / or \\.',
          exists: 'An item with this name already exists.',
        },
      },
      readOnly: 'Read-only',
      fileLink: 'file link',
      uri: 'URI',
      cors: {
        explanation: {
          title: 'CORS Configuration Required',
          description:
            'This storage location cannot be accessed from the browser because it is missing Cross-Origin Resource Sharing (CORS) rules.',
          action: 'You can automatically configure these rules to allow access from this domain.',
          note: 'Note: Changes may take up to 30 seconds to propagate.',
        },
        actions: {
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
        noFilesForDownload: 'No files selected for download.',
        downloadLinkFailed: 'Failed to generate download link',
        fileLinkFailed: 'Failed to generate file link',
        noUri: 'No URI available for this file.',
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
        previewUnsupported: 'Preview is not supported for this storage.',
      },
      chrome: {
        explorer: 'Explorer',
        upload: 'Upload',
        downloadFromBrowser: 'From browser',
        access: 'Access',
        manageAccess: 'Manage Access',
        selectAll: 'Select all',
        name: 'Name',
        size: 'Size',
        created: 'Created',
        hash: 'Hash',
        storageIconAlt: 'An icon for the storage',
        type: 'Type',
        storages: 'Storages',
        modified: 'Modified',
        lastModified: 'Last modified',
        contentType: 'Content type',
        storageClass: 'Storage class',
        details: 'Details',
        selectFiles: 'Select files',
        selectFolder: 'Select folder',
      },
      confirmUpload: {
        title: 'Confirm Upload',
        text: (path: string) =>
          `Please confirm the following objects you want to upload to ${path}.`,
        defaultPath: 'the selected path',
        noPath: 'No path selected',
        confirm: 'Confirm',
        target: 'Target:',
        sizeLimitTitle: 'Upload Size Limit Exceeded',
        sizeLimitBody: (total: string, max: string) =>
          `The total upload size (${total}) exceeds the maximum allowed limit of ${max}.`,
        sizeLimitHint: 'Please reduce the number of files or upload them in smaller batches.',
      },
      confirmDelete: {
        title: 'Confirm Delete',
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
        inQueue: (position: number, total: number) => `In Queue (#${position} of ${total})`,
        queuedShort: (position: number, total: number) => `Queued #${position} / ${total}`,
        destination: 'Destination:',
        eta: 'ETA:',
        uploading: 'Uploading...',
        completeTitle: 'Upload Complete!',
        failedTitle: 'Upload Failed',
        unknownTitle: 'Unknown Status',
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
        someUploaded: (count: number) => `${count} file(s) uploaded successfully!`,
        someCanceled: (count: number) => `${count} file(s) canceled by user.`,
        allUploaded: 'Upload file(s) successfully!',
        failedSummary: (failed: number, total: number) =>
          `${failed}/${total} files failed to upload:`,
        failReasonGeneric:
          'The file(s) may be too large or the connection may have been interrupted.',
        refreshFailed: (name: string, message: string) =>
          `Failed to refresh storage data for ${name}. ${message}. Please try again.`,
        unknownError: 'Unknown error',
        overallProgress: 'Overall Progress',
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
    },
    form: {
      required: 'Enter a value.',
      checkValue: 'Check this value.',
      invalidDuration: 'Enter a duration as DD-HH:MM:SS or HH:MM:SS.',
      durationOutOfRange: (min, max) => `Must be between ${min} and ${max}.`,
      durationBelowMin: (min) => `Must be at least ${min}.`,
      copyTitle: (title, number) => `${title} ${number}`,
      addCopy: (title) => `+ Add ${title}`,
      removeCopy: (title) => `Remove ${title}`,
      steps: 'Steps',
      stepOf: (number, total) => `Step ${number} of ${total}`,
      allSteps: 'All steps',
      stepDone: 'Done',
      stepNeedsAttention: 'Needs a fix',
      previousStep: 'Go to previous step',
      nextStep: 'Go to next step',
      runWizard: 'Execute',
      fixErrorsToContinue: 'Please fix errors before proceeding',
      stepFailed: 'An error occurred',
      stepLabel: (number, title) => `Step ${number}: ${title}`,
    },
    time: {
      now: 'now',
      minutes: (n) => `${n}m`,
      hours: (n) => `${n}h`,
      days: (n) => `${n}d`,
      years: (n) => `${n}y`,
    },
    list: {
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
      none: 'None',
      searchOptions: 'Search options…',
      pager: (start, end, total, atLeast) => `${start}–${end} of ${total}${atLeast ? '+' : ''}`,
      perPage: 'Per page',
      paginationPrevious: 'Previous',
      paginationNext: 'Next',
      pagination: 'Pagination',
      removeSearchTerm: (term) => `Remove filter ${term}`,
    },
  },
  navigation: {
    goTo: (to) => {
      const url = safeUrl(to)
      if (url) {
        window.location.assign(url)
      }
    },
    openStepSource: (_uses, sourceUrl) => {
      const url = safeUrl(sourceUrl)
      if (url) {
        window.open(url, '_blank')
      }
    },
    openExternal: (href) => {
      const url = safeUrl(href)
      if (url) {
        window.open(url, '_blank')
      }
    },
  },
  data: {
    useRunFile: defaultUseRunFile,
    usePersistedState: useLocalPersistedState,
  },
  slots: {},
}

const UIContext = createContext<UIProviderValue>(DEFAULTS)

export function useStrings(): UIStrings {
  return useContext(UIContext).strings
}

export function useNavigation(): UINavigation {
  return useContext(UIContext).navigation
}

export function useWorkflowJsonResolver(): UIData['resolveWorkflowJson'] {
  return useContext(UIContext).data.resolveWorkflowJson
}

export function useRepoSuggestions(): UIData['repoSuggestions'] {
  return useContext(UIContext).data.repoSuggestions
}

const NO_ACTIONS: Record<string, WorkflowAction> = {}

export function useWorkflowActions(): Record<string, WorkflowAction> {
  return useContext(UIContext).data.workflowActions ?? NO_ACTIONS
}

export function useSecretVariablesResolver(): UIData['resolveSecretVariables'] {
  return useContext(UIContext).data.resolveSecretVariables
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

/** The engine once it has loaded, without suspending; renders again when a loader resolves. */
export function useLoadedWorkflowEngine(): WorkflowEngine | undefined {
  const source = useContext(UIContext).engine
  const [, setLoaded] = useState(0)
  const entry = typeof source === 'function' ? loadEngine(source) : undefined
  const engine = typeof source === 'function' ? entry?.engine : source
  useEffect(() => {
    if (!entry || entry.engine) {
      return
    }
    let live = true
    entry.promise.then(() => {
      if (live) {
        setLoaded((n) => n + 1)
      }
    })
    return () => {
      live = false
    }
  }, [entry])
  return engine
}

/** The engine's workflow editing, which the visual editor can't work without. */
export function useWorkflowEditing(): WorkflowEditing {
  const { editing } = useWorkflowEngine()
  if (!editing) {
    throw new Error('The workflow editor needs a UIProvider engine with editing.')
  }
  return editing
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
  strings,
  navigation,
  data,
  slots,
  engine,
  children,
}: {
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
      strings: {
        modal: { ...DEFAULTS.strings.modal, ...strings?.modal },
        common: { ...DEFAULTS.strings.common, ...strings?.common },
        dropdown: { ...DEFAULTS.strings.dropdown, ...strings?.dropdown },
        datePicker: { ...DEFAULTS.strings.datePicker, ...strings?.datePicker },
        theme: { ...DEFAULTS.strings.theme, ...strings?.theme },
        logviewer: { ...DEFAULTS.strings.logviewer, ...strings?.logviewer },
        dag: { ...DEFAULTS.strings.dag, ...strings?.dag },
        jobActions: {
          ...DEFAULTS.strings.jobActions,
          ...strings?.jobActions,
        },
        graphEditor: {
          ...DEFAULTS.strings.graphEditor,
          ...strings?.graphEditor,
        },
        inputsEditor: {
          ...DEFAULTS.strings.inputsEditor,
          ...strings?.inputsEditor,
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
    [strings, navigation, data, slots, engine],
  )
  return (
    <UIContext.Provider value={value}>
      <TooltipProvider>{children}</TooltipProvider>
      <Toaster />
    </UIContext.Provider>
  )
}
