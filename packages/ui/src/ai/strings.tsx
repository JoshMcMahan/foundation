import type { ReactNode } from 'react'

// English defaults for the package's user-facing strings. Hosts localize by
// passing overrides through ChatUIConfig.strings.

export interface ChatStrings {
  modal: {
    cancel: string
    save: string
    loading: string
  }
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
    remove: string
    addGroups: string
    info: ReactNode
    shareButton: string
  }
  blockedGroup: {
    // {group} is replaced with the billing group name.
    title: string
    message: string
  }
  queue: {
    remove: string
  }
  activity: {
    tokens: (input: string, output: string) => string
    stop: string
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
    retry: string
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
    activity: string
  }
  thread: {
    viewOnly: string
  }
  sidebar: {
    groupToday: string
    groupYesterday: string
    groupThisWeek: string
    groupThisMonth: string
    groupOlder: string
    untitled: string
    rename: string
    share: string
    delete: string
    sharedWithYou: string
    openSidebar: string
    closeSidebar: string
    newChat: string
    attachments: string
    connectTools: string
    manageProviders: string
    noConversations: string
    deleteTitle: string
    deleteBody: string
    deleteAction: string
    renameTitle: string
    renameAction: string
    renameLabel: string
    renamePlaceholder: string
  }
  attachmentUpload: {
    fileTooLarge: (maxSize: string) => string
    maxFilesAllowed: (max: number) => string
    remove: string
    dropFilesHere: string
    addFiles: string
  }
  attachmentManager: {
    title: string
    empty: string
    download: string
    delete: string
    loadMore: string
    loading: string
  }
  branch: {
    previous: string
    next: string
  }
  chrome: {
    searchPlaceholder: string
    searchLabel: string
    noMatches: string
    download: string
    exportError: string
    jumpToLatest: string
  }
  messageMeta: {
    stopped: string
    showMore: string
    showLess: string
    // {total} token count for the turn.
    tokens: (total: number) => string
    tokensBreakdown: (prompt: number, completion: number) => string
    copy: string
    edit: string
    regenerate: string
    retry: string
    editPlaceholder: string
    cancel: string
    send: string
  }
  permissions: {
    choose: string
    readOnly: string
    acceptEdits: string
    bypassPermissions: string
    plan: string
    readOnlyHint: string
    acceptEditsHint: string
    bypassPermissionsHint: string
    planHint: string
  }
  agentTranscript: {
    showMore: string
    showLess: string
    running: string
    done: string
    failed: string
    interrupted: string
    noOutput: string
    diffTruncated: string
    // {count} is replaced with the hidden line count.
    moreLines: string
    allowOnce: string
    allowDirectory: string
    deny: string
    denyWithFeedback: string
    feedbackPlaceholder: string
    send: string
    answered: string
    writeOwnAnswer: string
    subagent: string
    tasks: string
    planPending: string
    approvalPending: string
    approvalOptions: string
  }
}

export const defaultChatStrings: ChatStrings = {
  modal: {
    cancel: 'Cancel',
    save: 'Save',
    loading: 'Loading…',
  },
  shareConversation: {
    title: 'Share Conversation',
    loadError: 'Failed to load sharing settings',
    saveSuccess: 'Sharing settings saved',
    orgAccess: 'Organization Access',
    orgCanView: 'Anyone in the organization can view',
    allowCollaboration: 'Allow collaboration (edit messages)',
    groupAccess: 'Group Access',
    noGroups: 'No groups have access yet',
    viewOnly: 'View only',
    canCollaborate: 'Can collaborate',
    remove: 'Remove',
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
    title: 'Billing group "{group}" is over its allocation',
    message:
      'It has reached its allocation limit. Messages to this provider are paused until your administrator increases the allocation.',
  },
  queue: {
    remove: 'Remove queued message',
  },
  activity: {
    tokens: (input, output) => `↑${input} ↓${output} tokens`,
    stop: 'Stop',
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
    retry: 'Retry',
  },
  input: {
    placeholder: 'Ask anything',
    placeholderLoading: 'Loading models...',
    placeholderNoProviders: 'Add an AI provider to start chatting',
    attachFiles: 'Attach files',
    stopGenerating: 'Stop generating (Escape)',
    sendMessage: 'Send message (Enter)',
    filesAttached: (count) => `${count} file${count > 1 ? 's' : ''} attached`,
  },
  paste: {
    title: 'Pasted text',
    lines: (count) => `${count.toLocaleString()} line${count === 1 ? '' : 's'}`,
    saving: 'Saving…',
    remove: 'Remove paste',
  },
  thinking: {
    label: 'Thinking',
    ellipsis: 'Thinking...',
    thoughtFor: (duration) => `Thought for ${duration}`,
    activity: 'Activity',
  },
  thread: {
    viewOnly: 'You have view only access',
  },
  sidebar: {
    groupToday: 'Today',
    groupYesterday: 'Yesterday',
    groupThisWeek: 'This Week',
    groupThisMonth: 'This Month',
    groupOlder: 'Older',
    untitled: 'Untitled',
    rename: 'Rename',
    share: 'Share',
    delete: 'Delete',
    sharedWithYou: 'Shared with you',
    openSidebar: 'Open sidebar',
    closeSidebar: 'Close sidebar',
    newChat: 'New chat',
    attachments: 'Attachments',
    connectTools: 'Connect Tools',
    manageProviders: 'Manage Providers',
    noConversations: 'No conversations yet',
    deleteTitle: 'Delete Conversation',
    deleteBody: 'Are you sure you want to delete this conversation? This action cannot be undone.',
    deleteAction: 'Delete',
    renameTitle: 'Rename Conversation',
    renameAction: 'Rename',
    renameLabel: 'Conversation title',
    renamePlaceholder: 'Enter a new title',
  },
  attachmentUpload: {
    fileTooLarge: (maxSize) => `File too large. Maximum size is ${maxSize}`,
    maxFilesAllowed: (max) => `Maximum ${max} files allowed`,
    remove: 'Remove',
    dropFilesHere: 'Drop files here',
    addFiles: 'Add files (drag or click)',
  },
  attachmentManager: {
    title: 'Attachments',
    empty: 'No attachments yet',
    download: 'Download',
    delete: 'Delete',
    loadMore: 'Load more',
    loading: 'Loading...',
  },
  branch: {
    previous: 'Previous branch',
    next: 'Next branch',
  },
  chrome: {
    searchPlaceholder: 'Search conversations',
    searchLabel: 'Search conversations (⌘/Ctrl+Shift+F)',
    noMatches: 'No conversations match your search',
    download: 'Download',
    exportError: 'Failed to export conversation',
    jumpToLatest: 'Jump to latest',
  },
  messageMeta: {
    stopped: 'Stopped',
    showMore: 'Show more',
    showLess: 'Show less',
    tokens: (total) => `${total.toLocaleString()} tokens`,
    tokensBreakdown: (prompt, completion) =>
      `${prompt.toLocaleString()} in · ${completion.toLocaleString()} out`,
    copy: 'Copy message',
    edit: 'Edit message',
    regenerate: 'Regenerate response',
    retry: 'Retry',
    editPlaceholder: 'Edit your message...',
    cancel: 'Cancel',
    send: 'Send',
  },
  permissions: {
    choose: 'Choose what the agent may do',
    readOnly: 'Read only',
    acceptEdits: 'Accept edits',
    bypassPermissions: 'Bypass permissions',
    plan: 'Plan',
    readOnlyHint: 'The workspace can be read but not changed.',
    acceptEditsHint:
      'File edits are applied without asking. The workspace can be changed without your review.',
    bypassPermissionsHint:
      'Every action is taken without asking, including commands that change the system.',
    planHint: 'The workspace is left unchanged while a plan is drafted.',
  },
  agentTranscript: {
    showMore: 'Show more',
    showLess: 'Show less',
    running: 'Running…',
    done: 'Done',
    failed: 'Failed',
    interrupted: 'Interrupted',
    noOutput: '(no output)',
    diffTruncated: 'Diff truncated',
    moreLines: '+{count} more lines',
    allowOnce: 'Yes, allow this command',
    allowDirectory: 'Yes, and allow this directory for the session',
    deny: 'No, deny this command',
    denyWithFeedback: 'No, and provide feedback to the agent',
    feedbackPlaceholder: 'Tell the agent what to do instead…',
    send: 'Send',
    answered: 'Answered',
    writeOwnAnswer: 'Write my own answer…',
    subagent: 'Task',
    tasks: 'Tasks',
    planPending: 'Plan awaiting approval in the terminal',
    approvalPending: 'Waiting for an answer in the terminal',
    approvalOptions: 'Offered choices',
  },
}
