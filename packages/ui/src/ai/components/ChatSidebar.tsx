import cx from 'classnames'
import { DateTime } from 'luxon'
import { useEffect, useMemo, useRef, useState } from 'react'
import { positionKeys } from '../../components/keys'
import {
  DownloadIcon,
  EditIcon,
  ImageIcon,
  NewChatIcon,
  SearchIcon,
  SettingsIcon,
  ShareIcon,
  SharingIcon,
  TrashIcon,
} from '../../icons'
import { type OpenMenu, type RowMenuItem, useRowMenu } from '../../list/index'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import { FOCUS_SIDEBAR_SEARCH_EVENT } from '../core/events'
import { conversationToMarkdown, downloadText, exportFilename } from '../core/exportConversation'
import type { ConversationSummary } from '../types'
import {
  SIDEBAR_DEFAULT_WIDTH_PX,
  SidebarGroupHeading,
  SidebarPanel,
  SidebarRow,
  SidebarToggle,
  useRowDialogs,
} from '../ui/sidebar'
import ShareDialog from './ShareDialog'

type ConversationGroupKey =
  | 'groupToday'
  | 'groupYesterday'
  | 'groupThisWeek'
  | 'groupThisMonth'
  | 'groupOlder'

function groupByDate<T extends { id: string; title?: string | null; createdAt: string }>(
  conversations: T[],
): [ConversationGroupKey, T[]][] {
  const now = DateTime.now()
  const groups: Record<ConversationGroupKey, T[]> = {
    groupToday: [],
    groupYesterday: [],
    groupThisWeek: [],
    groupThisMonth: [],
    groupOlder: [],
  }

  for (const conv of conversations) {
    const dt = DateTime.fromISO(conv.createdAt)
    const diff = now.diff(dt, 'days').days

    if (diff < 1) {
      groups.groupToday.push(conv)
    } else if (diff < 2) {
      groups.groupYesterday.push(conv)
    } else if (diff < 7) {
      groups.groupThisWeek.push(conv)
    } else if (diff < 30) {
      groups.groupThisMonth.push(conv)
    } else {
      groups.groupOlder.push(conv)
    }
  }

  return (Object.entries(groups) as [ConversationGroupKey, T[]][]).filter(
    ([, items]) => items.length > 0,
  )
}

function ConversationRow({
  conv,
  isCurrent,
  sharingAvailable,
  openMenu,
  onRename,
  onShare,
  onDelete,
  onExport,
}: {
  conv: ConversationSummary
  isCurrent: boolean
  sharingAvailable: boolean
  openMenu: OpenMenu
  onRename: (conv: ConversationSummary) => void
  onShare: (id: string) => void
  onDelete: (conv: ConversationSummary) => void
  onExport: (id: string) => void
}) {
  const { LinkComponent, strings } = useChatConfig()
  const t = strings.sidebar
  const menuItems: RowMenuItem[] = [
    {
      kind: 'action',
      label: t.rename,
      icon: <EditIcon />,
      onSelect: () => onRename(conv),
    },
    ...(sharingAvailable
      ? [
          {
            kind: 'action',
            label: t.share,
            icon: <ShareIcon />,
            onSelect: () => onShare(conv.id),
          } satisfies RowMenuItem,
        ]
      : []),
    {
      kind: 'action',
      label: strings.chrome.download,
      icon: <DownloadIcon />,
      onSelect: () => onExport(conv.id),
    },
    {
      kind: 'action',
      label: t.delete,
      icon: <TrashIcon />,
      destructive: true,
      onSelect: () => onDelete(conv),
    },
  ]

  return (
    <SidebarRow selected={isCurrent} menuItems={menuItems} openMenu={openMenu}>
      <LinkComponent
        target={{ kind: 'conversation', id: conv.id }}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
      >
        {conv.isOwner === false && (
          <SharingIcon className="h-3 w-3 shrink-0 theme-muted-text" title={t.sharedWithYou} />
        )}
        <span className="min-w-0 flex-1 truncate text-sm theme-text">
          {conv.title || t.untitled}
        </span>
      </LinkComponent>
    </SidebarRow>
  )
}

const SIDEBAR_WIDTH_STORAGE_KEY = 'aiChatSidebarWidth'
const SIDEBAR_MIN_WIDTH_PX = 200
const SIDEBAR_MAX_WIDTH_PX = 480

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH_PX, Math.max(SIDEBAR_MIN_WIDTH_PX, width))
}

function readStoredSidebarWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY))
    return Number.isFinite(stored) && stored > 0
      ? clampSidebarWidth(stored)
      : SIDEBAR_DEFAULT_WIDTH_PX
  } catch {
    return SIDEBAR_DEFAULT_WIDTH_PX
  }
}

function storeSidebarWidth(width: number) {
  try {
    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(width))
  } catch {
    // Storage unavailable (SSR, disabled storage): width simply doesn't persist.
  }
}

function useResizableSidebarWidth() {
  const [width, setWidth] = useState(readStoredSidebarWidth)
  const [resizing, setResizing] = useState(false)
  const widthRef = useRef(width)
  widthRef.current = width

  const startResize = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = widthRef.current
    setResizing(true)
    const onMove = (ev: PointerEvent) => {
      setWidth(clampSidebarWidth(startWidth + ev.clientX - startX))
    }
    const onUp = () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      setResizing(false)
      storeSidebarWidth(widthRef.current)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const reset = () => {
    setWidth(SIDEBAR_DEFAULT_WIDTH_PX)
    storeSidebarWidth(SIDEBAR_DEFAULT_WIDTH_PX)
  }

  const nudge = (delta: number) => {
    const next = clampSidebarWidth(widthRef.current + delta)
    setWidth(next)
    storeSidebarWidth(next)
  }

  return { width, resizing, startResize, reset, nudge }
}

export default function ChatSidebar({
  actions = true,
}: {
  /** False when the host's page header carries new chat, attachments and search. */
  actions?: boolean
}) {
  const { extraLinks, LinkComponent, strings } = useChatConfig()
  const tSidebar = strings.sidebar
  const {
    adapter,
    navigation,
    notify,
    activeConversationId,
    conversations,
    sidebarCollapsed,
    toggleSidebar,
    isLoading,
    loadConversations,
    deleteConversation,
    updateConversationTitle,
    clearCurrentConversation,
  } = useChat()
  const sharingAvailable = !!adapter.sharing
  const attachmentsAvailable = !!adapter.attachments

  const [shareDialogOpen, setShareDialogOpen] = useState(false)
  const [conversationToShare, setConversationToShare] = useState<string | null>(null)
  const { openMenu, contextMenu } = useRowMenu()
  const { requestDelete, requestRename, dialogs } = useRowDialogs<ConversationSummary>({
    strings: {
      deleteTitle: tSidebar.deleteTitle,
      deleteBody: () => tSidebar.deleteBody,
      deleteAction: tSidebar.deleteAction,
      renameTitle: tSidebar.renameTitle,
      renameLabel: tSidebar.renameLabel,
      renamePlaceholder: tSidebar.renamePlaceholder,
      renameAction: tSidebar.renameAction,
    },
    nameOf: (conv) => conv.title || tSidebar.untitled,
    onDelete: (conv) => deleteConversation(conv.id),
    onRename: (conv, title) => updateConversationTitle(conv.id, title),
  })

  const {
    width: sidebarWidth,
    resizing,
    startResize,
    reset: resetSidebarWidth,
    nudge: nudgeSidebarWidth,
  } = useResizableSidebarWidth()

  const [search, setSearch] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const sidebarCollapsedRef = useRef(sidebarCollapsed)
  sidebarCollapsedRef.current = sidebarCollapsed

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (!actions) {
      return
    }
    const focusSearch = () => {
      if (sidebarCollapsedRef.current) {
        toggleSidebar()
      }
      // After expanding, the input mounts on the next frame.
      requestAnimationFrame(() => searchInputRef.current?.focus())
    }
    document.addEventListener(FOCUS_SIDEBAR_SEARCH_EVENT, focusSearch)
    return () => document.removeEventListener(FOCUS_SIDEBAR_SEARCH_EVENT, focusSearch)
  }, [actions, toggleSidebar])

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return conversations
    }
    return conversations.filter((conv) =>
      (conv.title || tSidebar.untitled).toLowerCase().includes(query),
    )
  }, [conversations, search, tSidebar.untitled])

  const groupedConversations = useMemo(
    () => groupByDate(filteredConversations),
    [filteredConversations],
  )

  const handleExport = async (id: string) => {
    try {
      const conversation = await adapter.conversations.get(id)
      downloadText(exportFilename(conversation.title), conversationToMarkdown(conversation))
    } catch {
      notify.error(strings.chrome.exportError)
    }
  }

  const handleShareClick = (id: string) => {
    setConversationToShare(id)
    setShareDialogOpen(true)
  }

  const handleNewChat = () => {
    clearCurrentConversation()
    navigation.toNewChat()
  }

  return (
    <>
      <SidebarPanel collapsed={sidebarCollapsed} width={sidebarWidth} resizing={resizing}>
        {!sidebarCollapsed && (
          // biome-ignore lint/a11y/useSemanticElements: a window splitter must be focusable and full height; <hr> is reset to height 0 and cannot host the drag surface.
          <div
            role="separator"
            tabIndex={0}
            aria-orientation="vertical"
            aria-label="Resize conversation list"
            aria-valuemin={SIDEBAR_MIN_WIDTH_PX}
            aria-valuemax={SIDEBAR_MAX_WIDTH_PX}
            aria-valuenow={sidebarWidth}
            title="Drag to resize; double-click to reset"
            onPointerDown={startResize}
            onDoubleClick={resetSidebarWidth}
            onKeyDown={(e) => {
              if (e.key === 'ArrowLeft') {
                nudgeSidebarWidth(-16)
              } else if (e.key === 'ArrowRight') {
                nudgeSidebarWidth(16)
              }
            }}
            className={cx(
              'absolute inset-y-0 right-0 z-10 w-1 cursor-col-resize touch-none',
              resizing ? 'bg-(--theme-element)' : 'hover:bg-(--theme-border)',
            )}
          />
        )}
        {actions && (
          <div className="flex flex-col gap-1 p-1.5">
            <button
              type="button"
              onClick={handleNewChat}
              className={cx(
                'flex items-center h-9 px-2 gap-3 rounded-lg hover:theme-muted-panel',
                'transition-colors',
                !sidebarCollapsed && 'border theme-border',
              )}
              title={tSidebar.newChat}
            >
              <NewChatIcon className={cx('flex-shrink-0', 'w-4 h-4')} />
              <span
                className={cx(
                  'text-sm transition-opacity duration-200',
                  sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100',
                )}
              >
                {tSidebar.newChat}
              </span>
            </button>

            {attachmentsAvailable && (
              <LinkComponent
                target={{ kind: 'attachments' }}
                className="flex items-center h-9 px-2 gap-3 rounded-lg hover:theme-muted-panel"
                title={tSidebar.attachments}
              >
                <ImageIcon className="flex-shrink-0 w-4 h-4" />
                <span
                  className={cx(
                    'text-sm transition-opacity duration-200',
                    sidebarCollapsed ? 'opacity-0 w-0 overflow-hidden' : 'opacity-100',
                  )}
                >
                  {tSidebar.attachments}
                </span>
              </LinkComponent>
            )}
          </div>
        )}

        {actions && !sidebarCollapsed && conversations.length > 0 && (
          <div className="px-2 pb-1">
            <div className="relative">
              <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 theme-muted-text pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && search) {
                    e.stopPropagation()
                    setSearch('')
                  }
                }}
                placeholder={strings.chrome.searchPlaceholder}
                aria-label={strings.chrome.searchLabel}
                className="w-full h-8 pl-8 pr-2 text-sm rounded-lg border theme-border bg-(--theme-input-bg) placeholder:theme-muted-text focus:outline-none focus:border-(--theme-element)"
              />
            </div>
          </div>
        )}

        {/* Conversations List - hide when collapsed */}
        <div
          className={cx(
            'min-h-0 flex-1 overflow-y-auto px-2 pb-2 transition-opacity duration-200',
            sidebarCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100',
          )}
        >
          {isLoading ? (
            <div className="space-y-3 px-2 pt-2">
              {positionKeys(5, 'skeleton').map((key, i) => (
                <div key={key} className="animate-pulse">
                  <div
                    className="h-4 rounded theme-muted-panel"
                    style={{ width: `${70 - i * 10}%` }}
                  />
                </div>
              ))}
            </div>
          ) : conversations.length === 0 ? (
            <p className="theme-muted-text text-sm px-2 whitespace-nowrap">
              {tSidebar.noConversations}
            </p>
          ) : filteredConversations.length === 0 ? (
            <p className="theme-muted-text text-sm px-2">{strings.chrome.noMatches}</p>
          ) : (
            groupedConversations.map(([label, convs]) => (
              <div key={label} className="mb-2">
                <SidebarGroupHeading>{tSidebar[label]}</SidebarGroupHeading>
                <ul className="space-y-0.5">
                  {convs.map((conv) => (
                    <ConversationRow
                      key={conv.id}
                      conv={conv}
                      isCurrent={activeConversationId === conv.id}
                      sharingAvailable={sharingAvailable}
                      openMenu={openMenu}
                      onRename={requestRename}
                      onShare={handleShareClick}
                      onDelete={requestDelete}
                      onExport={handleExport}
                    />
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>

        <div
          className={cx(
            'flex shrink-0 items-center gap-1 p-1.5',
            sidebarCollapsed
              ? 'justify-center'
              : extraLinks.manageProviders
                ? 'justify-between'
                : 'justify-end',
          )}
        >
          {!sidebarCollapsed && extraLinks.manageProviders && (
            <LinkComponent
              target={{ kind: 'external', href: extraLinks.manageProviders }}
              className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-xs theme-muted-text hover:theme-hover"
              title={tSidebar.manageProviders}
            >
              <SettingsIcon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{tSidebar.manageProviders}</span>
            </LinkComponent>
          )}
          <SidebarToggle
            collapsed={sidebarCollapsed}
            onToggle={toggleSidebar}
            openLabel={tSidebar.openSidebar}
            closeLabel={tSidebar.closeSidebar}
          />
        </div>
      </SidebarPanel>

      {contextMenu}
      {dialogs}

      {/* Share Dialog */}
      {conversationToShare && (
        <ShareDialog
          conversationId={conversationToShare}
          isOpen={shareDialogOpen}
          onClose={() => {
            setShareDialogOpen(false)
            setConversationToShare(null)
          }}
        />
      )}
    </>
  )
}
