import type { ReactNode } from 'react'
import { countOf, defaultToolStrings, type ToolStrings } from './agent/toolStrings'

// English defaults for the package's user-facing strings. Hosts localize by
// passing overrides through ChatUIConfig.strings.

export interface ChatStrings {
  shareConversation: {
    title: string
    loadError: string
    saveSuccess: string
    orgAccess: string
    orgCanView: string
    allowCollaboration: string
    groupAccess: string
    noGroups: string
    viewOnly: string
    canCollaborate: string
    addGroups: string
    info: ReactNode
    shareButton: string
  }
  blockedGroup: {
    title: (group: string) => string
    message: string
  }
  providerIssue: {
    keyRejected: string
    unreachable: string
    keyRejectedHint: string
    unreachableHint: string
    bannerKeyRejected: (provider: string) => string
    bannerUnreachable: (provider: string) => string
  }
  modelPicker: {
    /** Names the picker for assistive technology. */
    choose: string
    select: string
    search: string
    loading: string
    failed: string
    none: string
    /** Beside a provider another user registered and shared with the reader. */
    sharedBy: (owner: string) => string
    /** Beside a session whose models are still loading. */
    connecting: string
    /** Beside a session whose service did not answer. */
    notResponding: string
    /** Links the provider's settings from its issue banner, for its owner. */
    manageProvider: string
    /** Sending before a model is chosen. */
    selectFirst: string
  }
  allocationPicker: {
    choose: string
    placeholder: string
    usage: (used: string, total: string) => string
  }
  queue: {
    remove: string
    /** Under a message that goes out once the running reply finishes. */
    waiting: string
    /** Under a message a steering host hands to the agent between steps. */
    waitingNextStep: string
    /** Under a message the host has already handed to the running turn. */
    handedOver: string
  }
  activity: {
    tokens: (input: string, output: string) => string
    stop: string
    /** The status words an agent's working line picks from, one per turn. */
    words: readonly string[]
  }
  emptyState: {
    // null renders the built-in time-of-day greeting.
    greeting: string | null
    modernSubtitle: string
    noProvidersTitle: string
    noProvidersBody: string
    addProvider: string
    sessionUnreachableTitle: (session: string) => ReactNode
    sessionUnreachableBody: string
  }
  input: {
    placeholder: string
    placeholderLoading: string
    placeholderNoProviders: string
    attachFiles: string
    stopGenerating: string
    sendMessage: string
    filesAttached: (count: number) => string
  }
  paste: {
    title: string
    lines: (count: number) => string
    saving: string
    remove: string
  }
  thinking: {
    label: string
    ellipsis: string
    thoughtFor: (duration: string) => string
    /** A finished reasoning toggle's label when its duration is unknown. */
    thoughtProcess: string
    activity: string
    /** A finished turn's label when it ran tools without reasoning. */
    ranToolCalls: (count: number) => string
  }
  thread: {
    viewOnly: string
    /** Names the thread, a live log of the conversation, for assistive technology. */
    label: string
  }
  sidebar: {
    groupToday: string
    groupYesterday: string
    groupThisWeek: string
    groupThisMonth: string
    groupOlder: string
    untitled: string
    sharedWithYou: string
    openSidebar: string
    closeSidebar: string
    /** Names the drawer the list opens in on a narrow layout. */
    drawerLabel: string
    resizeLabel: string
    resizeHint: string
    newChat: string
    attachments: string
    connectTools: string
    manageProviders: string
    noConversations: string
    deleteTitle: string
    deleteBody: string
    renameTitle: string
    renameLabel: string
    renamePlaceholder: string
  }
  attachmentUpload: {
    fileTooLarge: (maxSize: string) => string
    maxFilesAllowed: (max: number) => string
    dropFilesHere: string
    releaseToUpload: string
    addFiles: string
    maxSizePerFile: (size: string) => string
    uploading: string
  }
  attachmentManager: {
    title: string
    empty: string
    /** Names an image attachment that has no file name. */
    unnamedImage: string
    /** Names a file attachment that has no file name. */
    unnamedFile: string
    /** Opens an attachment's preview, given its name. */
    open: (name: string) => string
    /** Names an attachment's download link, given its name. */
    download: (name: string) => string
    /** Names an attachment's delete button, given its name. */
    remove: (name: string) => string
  }
  branch: {
    previous: string
    next: string
  }
  chrome: {
    searchPlaceholder: string
    searchLabel: string
    noMatches: string
    exportError: string
    jumpToLatest: string
    /** The copy shortcut's note when no reply has come yet. */
    noResponseToCopy: string
  }
  messageMeta: {
    stopped: string
    // {total} token count for the turn.
    tokens: (total: number) => string
    tokensBreakdown: (prompt: number, completion: number) => string
    /** What a message's copy button names: "Copy message", then "Copied message". */
    copyLabel: string
    edit: string
    regenerate: string
    editPlaceholder: string
  }
  permissions: {
    choose: string
    readOnly: string
    acceptEdits: string
    auto: string
    bypassPermissions: string
    plan: string
    readOnlyHint: string
    acceptEditsHint: string
    autoHint: string
    bypassPermissionsHint: string
    planHint: string
  }
  agentTranscript: {
    running: string
    done: string
    failed: string
    interrupted: string
    noOutput: string
    diffTruncated: string
    /** Under a long tool result, how many of its lines are folded away. */
    moreLines: (count: number) => string
    allowOnce: string
    allowDirectory: string
    deny: string
    allowCode: string
    denyCode: string
    allowPath: string
    denyPath: string
    allowCall: string
    denyCall: string
    denyWithFeedback: string
    feedbackPlaceholder: string
    answered: string
    writeOwnAnswer: string
    subagent: string
    tasks: string
    planPending: string
    approvalPending: string
    approvalOptions: string
    /** Names a question the agent waits on that has no heading of its own. */
    approvalLabel: string
    /** Names the field for the reason a request is denied. */
    feedbackLabel: string
    /** Names the field for an answer of the reader's own. */
    ownAnswerLabel: string
    /** Read out in place of a task's checkbox glyph. */
    todoPending: string
    todoInProgress: string
    todoCompleted: string
  }
  /** One-line summaries of an agent's finished tool calls. */
  tools: ToolStrings
}

// The agent status words: one is picked per turn and held until it ends.
const activityWords: readonly string[] = [
  'Thinking',
  'Cogitating',
  'Pondering',
  'Percolating',
  'Ruminating',
  'Noodling',
  'Conjuring',
  'Simmering',
  'Marinating',
  'Tinkering',
  'Scheming',
  'Brewing',
  'Wrangling',
  'Finagling',
  'Spelunking',
  'Puttering',
  'Composing',
  'Synthesizing',
  'Deliberating',
  'Mulling',
  'Contemplating',
  'Vibing',
  'Whittling',
  'Concocting',
  'Formulating',
  'Hatching',
  'Herding',
  'Ideating',
  'Manifesting',
  'Moseying',
  'Musing',
  'Reticulating',
  'Schlepping',
  'Stewing',
  'Transmuting',
  'Wibbling',
  'Crunching',
  'Forging',
  'Cooking',
]

export const defaultChatStrings: ChatStrings = {
  shareConversation: {
    title: 'Share conversation',
    loadError: 'Failed to load sharing settings',
    saveSuccess: 'Sharing settings saved',
    orgAccess: 'Organization access',
    orgCanView: 'Anyone in the organization can view',
    allowCollaboration: 'Allow collaboration (edit messages)',
    groupAccess: 'Group access',
    noGroups: 'No groups have access yet',
    viewOnly: 'View only',
    canCollaborate: 'Can collaborate',
    addGroups: 'Add groups…',
    info: (
      <>
        <strong>View</strong> permission allows reading the conversation.
        <br />
        <strong>Collaborate</strong> permission allows adding messages.
      </>
    ),
    shareButton: 'Share conversation',
  },
  blockedGroup: {
    title: (group) => `Billing group \u201c${group}\u201d is over its allocation`,
    message:
      'It has reached its allocation limit. Messages to this provider are paused until your administrator increases the allocation.',
  },
  queue: {
    remove: 'Remove queued message',
    waiting: 'Queued \u00b7 sends when this reply finishes',
    waitingNextStep: 'Queued \u00b7 reaches the agent after its current step',
    handedOver: 'Sent to the running turn',
  },
  providerIssue: {
    keyRejected: 'API key rejected',
    unreachable: 'Endpoint unreachable',
    keyRejectedHint:
      'The provider rejected this connection\u2019s API key. Update the key in the provider settings to resume.',
    unreachableHint:
      'The provider\u2019s endpoint did not respond. Check the endpoint URL and network access.',
    bannerKeyRejected: (provider) => `API key rejected for \u201c${provider}\u201d`,
    bannerUnreachable: (provider) => `\u201c${provider}\u201d is unreachable`,
  },
  modelPicker: {
    choose: 'Model',
    select: 'Select a model',
    search: 'Search models\u2026',
    loading: 'Loading models\u2026',
    failed: 'Failed to load models',
    none: 'No models available',
    sharedBy: (owner) => `Shared by ${owner}`,
    connecting: 'Connecting\u2026',
    notResponding: 'Not responding',
    manageProvider: 'Manage provider',
    selectFirst: 'Select a model first',
  },
  allocationPicker: {
    choose: 'Allocation',
    placeholder: 'Select allocation',
    usage: (used, total) => `${used} / ${total}`,
  },
  activity: {
    tokens: (input, output) => `↑${input} ↓${output} tokens`,
    stop: 'Stop',
    words: activityWords,
  },
  emptyState: {
    greeting: null,
    modernSubtitle: 'Pick a starter below or type a question to your selected model.',
    noProvidersTitle: 'No AI providers configured',
    noProvidersBody: 'To start chatting, add an AI provider.',
    addProvider: 'Add a provider',
    sessionUnreachableTitle: (session) => <>Session &ldquo;{session}&rdquo; is not reachable</>,
    sessionUnreachableBody:
      'The session may be offline or still starting up. You can select a different model to continue.',
  },
  input: {
    placeholder: 'Ask anything',
    placeholderLoading: 'Loading models\u2026',
    placeholderNoProviders: 'Add an AI provider to start chatting',
    attachFiles: 'Attach files',
    stopGenerating: 'Stop generating (Escape)',
    sendMessage: 'Send message (Enter)',
    filesAttached: (count) => `${countOf(count, 'file', 'files')} attached`,
  },
  paste: {
    title: 'Pasted text',
    lines: (count) => countOf(count, 'line', 'lines'),
    saving: 'Saving…',
    remove: 'Remove paste',
  },
  thinking: {
    label: 'Thinking',
    ellipsis: 'Thinking\u2026',
    thoughtFor: (duration) => `Thought for ${duration}`,
    thoughtProcess: 'Thought process',
    activity: 'Activity',
    ranToolCalls: (count) => `Ran ${countOf(count, 'tool call', 'tool calls')}`,
  },
  thread: {
    viewOnly: 'You have view only access',
    label: 'Conversation',
  },
  sidebar: {
    groupToday: 'Today',
    groupYesterday: 'Yesterday',
    groupThisWeek: 'This week',
    groupThisMonth: 'This month',
    groupOlder: 'Older',
    untitled: 'Untitled',
    sharedWithYou: 'Shared with you',
    openSidebar: 'Open sidebar',
    closeSidebar: 'Close sidebar',
    drawerLabel: 'Conversations',
    resizeLabel: 'Resize conversation list',
    resizeHint: 'Drag to resize; double-click to reset',
    newChat: 'New chat',
    attachments: 'Attachments',
    connectTools: 'Connect tools',
    manageProviders: 'Manage providers',
    noConversations: 'No conversations yet',
    deleteTitle: 'Delete conversation',
    deleteBody: 'Are you sure you want to delete this conversation? This action cannot be undone.',
    renameTitle: 'Rename conversation',
    renameLabel: 'Conversation title',
    renamePlaceholder: 'Enter a new title',
  },
  attachmentUpload: {
    fileTooLarge: (maxSize) => `File too large. Maximum size is ${maxSize}`,
    maxFilesAllowed: (max) => `Maximum ${countOf(max, 'file', 'files')} allowed`,
    dropFilesHere: 'Drop files here',
    releaseToUpload: 'Release to upload',
    addFiles: 'Add files (drag or click)',
    maxSizePerFile: (size) => `Max ${size} per file`,
    uploading: 'Uploading…',
  },
  attachmentManager: {
    title: 'Attachments',
    empty: 'No attachments yet',
    unnamedImage: 'Image attachment',
    unnamedFile: 'File',
    open: (name) => `Open ${name}`,
    download: (name) => `Download ${name}`,
    remove: (name) => `Delete ${name}`,
  },
  branch: {
    previous: 'Previous branch',
    next: 'Next branch',
  },
  chrome: {
    searchPlaceholder: 'Search conversations',
    searchLabel: 'Search conversations (⌘/Ctrl+Shift+F)',
    noMatches: 'No conversations match your search',
    exportError: 'Failed to export conversation',
    jumpToLatest: 'Jump to latest',
    noResponseToCopy: 'No response to copy',
  },
  messageMeta: {
    stopped: 'Stopped',
    tokens: (total) => countOf(total, 'token', 'tokens'),
    tokensBreakdown: (prompt, completion) =>
      `${prompt.toLocaleString()} in · ${completion.toLocaleString()} out`,
    copyLabel: 'message',
    edit: 'Edit message',
    regenerate: 'Regenerate response',
    editPlaceholder: 'Edit your message\u2026',
  },
  permissions: {
    choose: 'Choose what the agent may do',
    readOnly: 'Read only',
    acceptEdits: 'Accept edits',
    auto: 'Auto',
    bypassPermissions: 'Bypass permissions',
    plan: 'Plan',
    readOnlyHint: 'The workspace can be read but not changed.',
    acceptEditsHint:
      'File edits are applied without asking. The workspace can be changed without your review.',
    autoHint:
      'File edits are applied without asking. An automatic reviewer approves or denies most actions that would ask you.',
    bypassPermissionsHint:
      'Every action is taken without asking, including commands that change the system.',
    planHint: 'The workspace is left unchanged while a plan is drafted.',
  },
  agentTranscript: {
    running: 'Running…',
    done: 'Done',
    failed: 'Failed',
    interrupted: 'Interrupted',
    noOutput: '(no output)',
    diffTruncated: 'Diff truncated',
    moreLines: (count) => `+${countOf(count, 'more line', 'more lines')}`,
    allowOnce: 'Yes, allow this command',
    allowDirectory: 'Yes, and allow this directory for the session',
    deny: 'No, deny this command',
    allowCode: 'Yes, run this code',
    denyCode: "No, don't run this code",
    allowPath: 'Yes, allow this once',
    denyPath: 'No, deny',
    allowCall: 'Yes, allow this call',
    denyCall: 'No, deny this call',
    denyWithFeedback: 'No, and provide feedback to the agent',
    feedbackPlaceholder: 'Tell the agent what to do instead…',
    answered: 'Answered',
    writeOwnAnswer: 'Write my own answer…',
    subagent: 'Task',
    tasks: 'Tasks',
    planPending: 'Plan awaiting approval in the terminal',
    approvalPending: 'Waiting for an answer in the terminal',
    approvalOptions: 'Offered choices',
    approvalLabel: 'Waiting for your answer',
    feedbackLabel: 'Feedback for the agent',
    ownAnswerLabel: 'Your answer',
    todoPending: 'To do',
    todoInProgress: 'In progress',
    todoCompleted: 'Done',
  },
  tools: defaultToolStrings,
}
