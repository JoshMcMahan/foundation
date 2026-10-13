import { DateTime } from 'luxon'
import { type ReactNode, useState } from 'react'
import { type OpenMenu, useContextMenu } from '../../components/ContextMenu'
import type { MenuAction, MenuEntry } from '../../components/MenuEntries'
import { useStrings } from '../../components/Provider'
import { toast } from '../../components/Toast'
import { DownloadIcon, RenameIcon, ShareIcon, TrashIcon } from '../../icons'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import { conversationToMarkdown, downloadText, exportFilename } from '../core/exportConversation'
import type { ConversationSummary } from '../types'
import { useRowDialogs } from '../ui/sidebar'
import ShareDialog from './ShareDialog'

export type ConversationGroupKey =
  | 'groupToday'
  | 'groupYesterday'
  | 'groupThisWeek'
  | 'groupThisMonth'
  | 'groupOlder'

/** Conversations by how long ago they started, newest group first, leaving
 *  out the groups with none. Each key names its label in the sidebar strings. */
export function groupConversationsByDate<T extends { createdAt: string }>(
  conversations: T[],
): { key: ConversationGroupKey; items: T[] }[] {
  const now = DateTime.now()
  const groups: Record<ConversationGroupKey, T[]> = {
    groupToday: [],
    groupYesterday: [],
    groupThisWeek: [],
    groupThisMonth: [],
    groupOlder: [],
  }
  for (const conv of conversations) {
    const days = now.diff(DateTime.fromISO(conv.createdAt), 'days').days
    const key: ConversationGroupKey =
      days < 1
        ? 'groupToday'
        : days < 2
          ? 'groupYesterday'
          : days < 7
            ? 'groupThisWeek'
            : days < 30
              ? 'groupThisMonth'
              : 'groupOlder'
    groups[key].push(conv)
  }
  return (Object.entries(groups) as [ConversationGroupKey, T[]][])
    .filter(([, items]) => items.length > 0)
    .map(([key, items]) => ({ key, items }))
}

/** What a conversation row offers behind its menu (rename, share, download,
 *  delete) and the menu and dialogs that carry them out, for any list of
 *  conversations. Render `overlays` once beside the list. */
export function useConversationActions(): {
  menuItems: (conv: ConversationSummary) => MenuEntry[]
  openMenu: OpenMenu
  overlays: ReactNode
} {
  const { strings } = useChatConfig()
  const { common } = useStrings()
  const t = strings.sidebar
  const { adapter, deleteConversation, updateConversationTitle } = useChat()
  const { openMenu, contextMenu } = useContextMenu()
  const [sharing, setSharing] = useState<string | null>(null)
  const { requestDelete, requestRename, dialogs } = useRowDialogs<ConversationSummary>({
    strings: {
      deleteTitle: t.deleteTitle,
      deleteBody: () => t.deleteBody,
      deleteAction: common.delete,
      renameTitle: t.renameTitle,
      renameLabel: t.renameLabel,
      renamePlaceholder: t.renamePlaceholder,
      renameAction: common.rename,
    },
    nameOf: (conv) => conv.title || t.untitled,
    onDelete: (conv) => deleteConversation(conv.id),
    onRename: (conv, title) => updateConversationTitle(conv.id, title),
  })

  const download = async (id: string) => {
    try {
      const conversation = await adapter.conversations.get(id)
      downloadText(exportFilename(conversation.title), conversationToMarkdown(conversation))
    } catch {
      toast.error(strings.chrome.exportError)
    }
  }

  const menuItems = (conv: ConversationSummary): MenuEntry[] => [
    {
      label: common.rename,
      icon: <RenameIcon />,
      onClick: () => requestRename(conv),
    },
    // Only the owner can change who a conversation is shared with.
    ...(adapter.sharing && conv.isOwner !== false
      ? [
          {
            label: common.share,
            icon: <ShareIcon />,
            onClick: () => setSharing(conv.id),
          } satisfies MenuAction,
        ]
      : []),
    {
      label: common.download,
      icon: <DownloadIcon />,
      onClick: () => void download(conv.id),
    },
    {
      label: common.delete,
      icon: <TrashIcon />,
      destructive: true,
      onClick: () => requestDelete(conv),
    },
  ]

  const overlays = (
    <>
      {contextMenu}
      {dialogs}
      {sharing && <ShareDialog conversationId={sharing} isOpen onClose={() => setSharing(null)} />}
    </>
  )

  return { menuItems, openMenu, overlays }
}
