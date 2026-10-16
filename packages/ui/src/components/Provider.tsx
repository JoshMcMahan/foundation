import { CSPProvider } from '@base-ui/react/csp-provider'
import { dequal } from 'dequal'
import type { Dispatch, ReactNode, SetStateAction } from 'react'
import { createContext, use, useCallback, useContext, useEffect, useRef, useState } from 'react'
import type { AccessText } from '../access/strings'
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
    /** Returns to the view a drawer or panel showed before. */
    back: string
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
    /** Read out where a value is missing, which shows as a dash. */
    noValue: string
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
    /** A person's presence beside their avatar, read with their name. */
    presence: Record<'online' | 'offline' | 'busy' | 'away', string>
    /** An avatar's name with the person's presence, such as "Ada Lovelace, online". */
    withPresence: (name: string, presence: string) => string
    moreInfo: string
    /** The name of a menu of actions on a page or row. */
    actions: string
    edit: string
    submit: string
    search: string
    clearSearch: string
    filterPlaceholder: string
    breadcrumb: string
    /** Names the menu of the breadcrumbs a narrow trail folds away. */
    showFullPath: string
    yes: string
    no: string
    /** Read after a link that opens a new tab. */
    opensInNewTab: string
    /** Names a code editor that has no label of its own. */
    codeEditor: string
    /** Shown when someone types in a read-only code editor. */
    readOnlyText: string
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
    /** While a search for options is under way. */
    searching: string
    showOptions: string
    /** The row that adds typed text as a new value. */
    add: (text: string) => string
    /** In place of the placeholder once a field holds as many values as it takes. */
    limitReached: (max: number) => string
    /** Names the button on a chosen value's chip that takes it out. */
    removeValue: (label: string) => string
  }
  datePicker: {
    /** The button's text while no date is chosen. */
    pickDate: string
    /** Names the time beside the date. */
    time: string
    previousMonth: string
    nextMonth: string
  }
  colorInput: {
    /** Names the picker beside the hex field: the field's name, or none when it has no plain one. */
    pick: (name?: string) => string
    /** Under the hex field while what is typed isn't a color. */
    invalid: string
  }
  oneTimeCode: {
    /** Names each box after the first, which the field's label names. */
    character: (position: number, length: number) => string
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
    /** Exchanges the background and the accent. */
    swap: string
    contrast: string
    /** Under the contrast slider. */
    contrastHelp: string
    /** The switch that gives the sidebar its own colors. */
    customSidebar: string
    sidebarBase: string
    sidebarAccent: string
    code: string
    codeStyle: (style: 'balanced' | 'vivid' | 'muted' | 'mono') => string
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
    /** A line number's name: it selects the line for copying. */
    selectLine: (line: number) => string
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
    loadingSummary: string
    hasSummary: string
    stepOf: (position: number, count: number) => string
    summaryLoadFailed: string
    summaryTab: string
    logsTab: string
    scriptTab: string
    openSubworkflow: string
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
    /** Names the annotations' toggle for a screen reader, in place of its count badges, such as
     *  "Annotations: 2 errors, 1 warning". It starts with `annotations`, the toggle's visible text. */
    annotationsLabel: (counts: { error: number; warning: number; notice: number }) => string
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
  /** The access drawer's text, over its English defaults. */
  access: Partial<AccessText>
  inputsEditor: Partial<InputsEditorText>
  fileExplorer: {
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
      /** A folder's listing failed; `name` is the folder. */
      loadFailed: (name: string, message: string) => string
      /** A failure that came with no message of its own. */
      unknownError: string
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
    /** What `ListError` names when the host gives no noun. */
    data: string
    /** A list's size, as `ListCount` shows it; `count` is formatted and `noun` agrees with it. */
    count: (count: string, noun: string) => string
    /** How many rows a filter left, of how many. */
    matchCount: (matches: string, total: string, nounPlural: string) => string
    displayOptions: string
    grouping: string
    ordering: string
    orderDefault: string
    orderFavorites: string
    ascending: string
    descending: string
    columnHeaders: string
    showColumnHeaders: string
    /** The header checkbox that ticks every row, or clears them all. */
    selectAll: string
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

/** What a host passes to translate the strings: any group, any string in it, at any depth.
 *  A string it leaves out stays in English. */
export type UIStringOverrides = Overrides<UIStrings>

type Overrides<T> = {
  [K in keyof T]?: T[K] extends (...args: never[]) => unknown
    ? T[K]
    : T[K] extends readonly unknown[]
      ? T[K]
      : T[K] extends object
        ? Overrides<T[K]>
        : T[K]
}

const isGroup = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

// Overrides laid over the defaults group by group, so a host can translate one string of a
// nested group, such as the file explorer's preview, without restating the rest of it.
function mergeStrings<T>(defaults: T, overrides: unknown): T {
  if (!isGroup(overrides) || !isGroup(defaults)) {
    return defaults
  }
  const merged: Record<string, unknown> = { ...defaults }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      continue
    }
    merged[key] = isGroup(value) && isGroup(merged[key]) ? mergeStrings(merged[key], value) : value
  }
  return merged as T
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
import type { Breadcrumb } from './Breadcrumbs'

/** An internal navigation link, which hosts bind to their router's Link. Its
 *  `href` is a full in-app URL that may carry a search and a hash, such as
 *  `/runs/42?tab=logs#step-3`, and the host routes all of it client-side on a
 *  plain click, leaving modified and middle clicks to the browser. It passes
 *  every other prop, ref included, to its anchor, so menus and tooltips can
 *  attach to it. Components render it through `AppLink`, which sanitizes the
 *  href and keeps full page loads and other origins off the router. */
export type UILinkComponent = React.ComponentType<
  React.ComponentPropsWithRef<'a'> & { href: string }
>

const DefaultLink: UILinkComponent = ({ href, ...rest }) => <a href={safeUrl(href)} {...rest} />

/** The provider's link slot, with a plain anchor fallback. */
export function useLink(): UILinkComponent {
  return useContext(SlotsContext).link ?? DefaultLink
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
  breadcrumbPin?: (args: { crumbs: readonly Breadcrumb[] }) => ReactNode
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
      back: 'Back',
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
      noValue: 'None',
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
      presence: { online: 'online', offline: 'offline', busy: 'busy', away: 'away' },
      withPresence: (name, presence) => `${name}, ${presence}`,
      moreInfo: 'More information',
      actions: 'Actions',
      edit: 'Edit',
      submit: 'Submit',
      search: 'Search',
      clearSearch: 'Clear search',
      filterPlaceholder: 'Filter…',
      breadcrumb: 'Breadcrumb',
      showFullPath: 'Show full path',
      yes: 'Yes',
      no: 'No',
      opensInNewTab: '(opens in a new tab)',
      codeEditor: 'Code editor',
      readOnlyText: 'This text is read-only.',
      resizePanel: 'Resize panel',
      panelWidth: (px) => `${px} pixels wide`,
      refresh: 'Refresh',
      refreshing: 'Refreshing',
      updated: (ago) => `Updated ${ago}`,
    },
    dropdown: {
      select: (type) => `Select ${type}`,
      noOptionsFound: 'No options found',
      searching: 'Searching…',
      showOptions: 'Show options',
      add: (text) => `Add “${text}”`,
      limitReached: (max) => `Up to ${max}`,
      removeValue: (label) => `Remove ${label}`,
    },
    datePicker: {
      pickDate: 'Pick a date',
      time: 'Time',
      previousMonth: 'Previous month',
      nextMonth: 'Next month',
    },
    colorInput: {
      pick: (name) => (name ? `Pick ${name.toLowerCase()}` : 'Pick a color'),
      invalid: 'Enter a hex color, such as #1f6feb.',
    },
    oneTimeCode: {
      character: (position, length) => `Character ${position} of ${length}`,
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
      swap: 'Swap background and accent',
      contrast: 'Contrast',
      contrastHelp: 'Separates surfaces and strengthens text. Text always meets WCAG AA.',
      customSidebar: 'Custom sidebar',
      sidebarBase: 'Sidebar background',
      sidebarAccent: 'Sidebar accent',
      code: 'Code',
      codeStyle: (style) =>
        ({ balanced: 'Balanced', vivid: 'Vivid', muted: 'Muted', mono: 'Monochrome' })[style],
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
      copyAll: 'Copy all',
      hideDebug: 'Hide debug',
      showDebug: 'Show debug',
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
      selectLine: (line) => `Select line ${line}`,
    },
    dag: {
      workflow: 'Workflow',
      run: 'Run',
      status: 'Status',
      runtime: 'Runtime',
      submitted: 'Submitted',
      resetView: 'Reset view',
      previousGraph: 'Back to the previous graph',
      nextGraph: 'Forward to the next graph',
      matrixOf: (name) => `Matrix: ${name}`,
      jobCount: (count) => (count === 1 ? '1 job' : `${count} jobs`),
      loadingLogs: 'Loading logs',
      noLogFound: 'No log found',
      logLoadFailed: 'Log could not be loaded',
      loadingSummary: 'Loading summary',
      hasSummary: 'Has a summary',
      stepOf: (position, count) => `Step ${position} of ${count}`,
      summaryLoadFailed: 'Summary could not be loaded',
      summaryTab: 'Summary',
      logsTab: 'Logs',
      scriptTab: 'Script',
      openSubworkflow: 'Open Subworkflow',
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
      annotationsLabel: ({ error, warning, notice }) =>
        `Annotations: ${[
          [error, 'error', 'errors'],
          [warning, 'warning', 'warnings'],
          [notice, 'notice', 'notices'],
        ]
          .filter(([count]) => count)
          .map(([count, one, many]) => `${count} ${count === 1 ? one : many}`)
          .join(', ')}`,
      annotationSource: (job, step) => `in ${job} → ${step}`,
      stepNumber: (index) => `step ${index}`,
    },
    jobActions: {
      openSubworkflowLogs: 'Open subworkflow logs',
      openOriginalWorkflow: 'Open original workflow',
      openInNewGraph: 'Open in new graph',
    },
    graphEditor: {},
    access: {},
    inputsEditor: {},
    fileExplorer: {
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
        text: (path: string) =>
          `Please confirm the following objects you want to upload to ${path}.`,
        defaultPath: 'the selected path',
        noPath: 'No path selected',
        confirm: 'Confirm',
        target: 'Target:',
        sizeLimitTitle: 'Upload size limit exceeded',
        sizeLimitBody: (total: string, max: string) =>
          `The total upload size (${total}) exceeds the maximum allowed limit of ${max}.`,
        sizeLimitHint: 'Please reduce the number of files or upload them in smaller batches.',
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
        failedSummary: (failed: number, total: number) =>
          `${failed}/${total} files failed to upload:`,
        failReasonGeneric:
          'The file(s) may be too large or the connection may have been interrupted.',
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
      data: 'data',
      count: (count, noun) => `${count} ${noun}`,
      matchCount: (matches, total, nounPlural) => `${matches} of ${total} ${nounPlural}`,
      displayOptions: 'Display options',
      grouping: 'Grouping',
      ordering: 'Ordering',
      orderDefault: 'Default',
      orderFavorites: 'Favorites',
      ascending: 'Ascending',
      descending: 'Descending',
      columnHeaders: 'Column headers',
      showColumnHeaders: 'Show column headers',
      selectAll: 'Select all',
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

// One context per concern, so a change to one, such as the host's data hooks, re-renders only the
// components that read it rather than every string and link under the provider.
const StringsContext = createContext<UIStrings>(DEFAULTS.strings)
const NavigationContext = createContext<UINavigation>(DEFAULTS.navigation)
const DataContext = createContext<UIData>(DEFAULTS.data)
const SlotsContext = createContext<UISlots>(DEFAULTS.slots)
const EngineContext = createContext<WorkflowEngineSource | undefined>(undefined)

export function useStrings(): UIStrings {
  return useContext(StringsContext)
}

export function useNavigation(): UINavigation {
  return useContext(NavigationContext)
}

export function useWorkflowJsonResolver(): UIData['resolveWorkflowJson'] {
  return useContext(DataContext).resolveWorkflowJson
}

export function useRepoSuggestions(): UIData['repoSuggestions'] {
  return useContext(DataContext).repoSuggestions
}

const NO_ACTIONS: Record<string, WorkflowAction> = {}

export function useWorkflowActions(): Record<string, WorkflowAction> {
  return useContext(DataContext).workflowActions ?? NO_ACTIONS
}

export function useSecretVariablesResolver(): UIData['resolveSecretVariables'] {
  return useContext(DataContext).resolveSecretVariables
}

export function useSlots(): UISlots {
  return useContext(SlotsContext)
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
  const source = useContext(EngineContext)
  if (!enabled || !source) {
    return undefined
  }
  return resolveEngine(source)
}

export function useWorkflowEngine(): WorkflowEngine {
  const source = useContext(EngineContext)
  if (!source) {
    throw new Error('Workflow forms and graphs need a UIProvider with an engine.')
  }
  return resolveEngine(source)
}

/** The engine once it has loaded, without suspending; renders again when a loader resolves. */
export function useLoadedWorkflowEngine(): WorkflowEngine | undefined {
  const source = useContext(EngineContext)
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
  const source = useContext(EngineContext)
  return useCallback(async () => {
    if (!source) {
      return undefined
    }
    return typeof source === 'function' ? loadEngine(source).promise : source
  }, [source])
}

export function useProvisionCorsRules(): UIData['provisionCorsRules'] {
  return useContext(DataContext).provisionCorsRules
}

export function useRunFile(
  slug: string,
  path: string | null,
  options?: { refreshInterval?: number },
): RunFileResult {
  const { useRunFile: boundUseRunFile } = useContext(DataContext)
  return boundUseRunFile(slug, path, options)
}

export function usePersistedState<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const { usePersistedState: boundUsePersistedState } = useContext(DataContext)
  return boundUsePersistedState(key, defaultValue)
}

export interface UIProviderProps {
  /** Translations over the English defaults, at any depth. Define them outside a component, or
   *  memoize them: the provider compares them by value, but a function made each render differs. */
  strings?: UIStringOverrides | undefined
  /** How the package navigates; read at the moment it navigates, so a new one never re-renders. */
  navigation?: Partial<UINavigation> | undefined
  /** The host's data hooks and resolvers. `useRunFile` and `usePersistedState` are called as
   *  hooks, so each must stay the same function for the life of the app. */
  data?: Partial<UIData> | undefined
  /** Components the host renders inside the package's; a component made each render would
   *  remount everything it renders. */
  slots?: UISlots | undefined
  /** The engine, or a loader that resolves to it. A loader is called once, the first one
   *  passed, so it may be written inline. */
  engine?: WorkflowEngineSource | undefined
  /** The nonce the page's Content Security Policy allows inline scripts by,
   *  for a host that renders on the server: a few components emit a script
   *  that places them before hydration. The components render no inline
   *  `<style>`, so a policy without 'unsafe-inline' styles needs none. */
  nonce?: string | undefined
  children: React.ReactNode
}

// The value last seen while each new one equals it, so a host passing an object literal each
// render hands consumers the same object and none of them re-render.
function useByValue<T>(value: T): T {
  const ref = useRef(value)
  if (ref.current !== value && !dequal(ref.current, value)) {
    ref.current = value
  }
  return ref.current
}

function useMerged<T>(compute: () => T, input: unknown): T {
  const stableInput = useByValue(input)
  const ref = useRef<{ input: unknown; value: T } | null>(null)
  if (!ref.current || ref.current.input !== stableInput) {
    ref.current = { input: stableInput, value: compute() }
  }
  return ref.current.value
}

export function UIProvider({
  strings,
  navigation,
  data,
  slots,
  engine: engineProp,
  nonce,
  children,
}: UIProviderProps) {
  // A loader is the first one passed: an inline arrow is a new function each render, and each
  // new one would load the engine again.
  const [firstLoader] = useState(() => (typeof engineProp === 'function' ? engineProp : undefined))
  const engine = typeof engineProp === 'function' ? (firstLoader ?? engineProp) : engineProp
  // Loading after mount keeps the engine off the first paint, and means the
  // first form or graph rarely has to suspend for it.
  useEffect(() => {
    if (typeof engine === 'function') {
      loadEngine(engine)
    }
  }, [engine])
  const mergedStrings = useMerged(() => mergeStrings(DEFAULTS.strings, strings), strings)
  const mergedData = useMerged(() => ({ ...DEFAULTS.data, ...data }), data)
  const stableSlots = useByValue(slots ?? DEFAULTS.slots)
  // Each call reads the host's navigation as it is now, so the object consumers hold never changes.
  const navigationRef = useRef(navigation)
  navigationRef.current = navigation
  const [stableNavigation] = useState<UINavigation>(() => ({
    goTo: (to) => (navigationRef.current?.goTo ?? DEFAULTS.navigation.goTo)(to),
    openStepSource: (uses, sourceUrl) =>
      (navigationRef.current?.openStepSource ?? DEFAULTS.navigation.openStepSource)(
        uses,
        sourceUrl,
      ),
    openExternal: (href) =>
      (navigationRef.current?.openExternal ?? DEFAULTS.navigation.openExternal)(href),
  }))
  return (
    <StringsContext value={mergedStrings}>
      <NavigationContext value={stableNavigation}>
        <DataContext value={mergedData}>
          <SlotsContext value={stableSlots}>
            <EngineContext value={engine}>
              {/* Base UI hides a select's or scroll area's own scrollbar with an
                  inline <style>, which a same-origin style policy blocks and
                  reports. theme.css ships that rule instead. */}
              <CSPProvider nonce={nonce} disableStyleElements>
                <TooltipProvider>{children}</TooltipProvider>
                <Toaster />
              </CSPProvider>
            </EngineContext>
          </SlotsContext>
        </DataContext>
      </NavigationContext>
    </StringsContext>
  )
}
