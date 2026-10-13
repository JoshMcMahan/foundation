import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import type { OpenMenu } from '../../components/ContextMenu'
import { EmptyState } from '../../components/EmptyState'
import type { MenuEntry } from '../../components/MenuEntries'
import { RelativeTime } from '../../components/relativeTime'
import { SearchInput } from '../../components/SearchInput'
import { cx } from '../../cx'
import { ImageIcon, NewChatIcon, UsersIcon } from '../../icons'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import { FOCUS_SIDEBAR_SEARCH_EVENT } from '../core/events'
import type { ConversationSummary } from '../types'
import { ConversationSidebar } from '../ui/ConversationSidebar'
import { SidebarRow, SidebarRowTitle } from '../ui/sidebar'
import { ManageProvidersLink } from './ComposerChrome'
import { groupConversationsByDate, useConversationActions } from './conversationActions'

function ConversationRow({
  conv,
  isCurrent,
  menuItems,
  openMenu,
  onOpen,
}: {
  conv: ConversationSummary
  isCurrent: boolean
  menuItems: MenuEntry[]
  openMenu: OpenMenu
  onOpen: () => void
}) {
  const { LinkComponent, strings } = useChatConfig()
  const t = strings.sidebar

  return (
    <SidebarRow selected={isCurrent} menuItems={menuItems} openMenu={openMenu}>
      <LinkComponent
        target={{ kind: 'conversation', id: conv.id }}
        className="flex min-w-0 flex-1 items-center gap-1.5 py-1 text-left"
        onClick={onOpen}
      >
        {conv.isOwner === false && (
          <UsersIcon className="h-3 w-3 shrink-0 theme-muted-text" title={t.sharedWithYou} />
        )}
        <SidebarRowTitle
          time={<RelativeTime value={conv.updatedAt ?? conv.createdAt} format="compact" />}
        >
          {conv.title || t.untitled}
        </SidebarRowTitle>
      </LinkComponent>
    </SidebarRow>
  )
}

export default function ChatSidebar({
  actions = true,
  top,
}: {
  /** False when the host's page header carries new chat, attachments and search. */
  actions?: boolean
  /** The host's own content above the list, given whether it is the rail. */
  top?: ((state: { collapsed: boolean }) => ReactNode) | undefined
}) {
  const { LinkComponent, strings } = useChatConfig()
  const tSidebar = strings.sidebar
  const {
    adapter,
    navigation,
    activeConversationId,
    conversations,
    sidebar,
    sidebarPresentation,
    drawerOpen,
    setSidebar,
    setDrawerOpen,
    toggleSidebar,
    isLoading,
    loadConversations,
    clearCurrentConversation,
  } = useChat()
  const attachmentsAvailable = !!adapter.attachments
  const { menuItems, openMenu, overlays } = useConversationActions()

  const drawer = sidebarPresentation === 'drawer'
  // The drawer always opens to the full list; the rail is for a column.
  const sidebarCollapsed = !drawer && sidebar !== 'expanded'
  // Picking something in the drawer is done with it; with no drawer open
  // this does nothing.
  const closeDrawer = () => setDrawerOpen(false)

  const [search, setSearch] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const revealRef = useRef(() => {})
  revealRef.current = () => {
    if (drawer) {
      setDrawerOpen(true)
    } else if (sidebar !== 'expanded') {
      setSidebar('expanded')
    }
  }

  useEffect(() => {
    loadConversations()
  }, [loadConversations])

  useEffect(() => {
    if (!actions) {
      return
    }
    const focusSearch = () => {
      revealRef.current()
      // After expanding, the input mounts on the next frame.
      requestAnimationFrame(() => searchInputRef.current?.focus())
    }
    document.addEventListener(FOCUS_SIDEBAR_SEARCH_EVENT, focusSearch)
    return () => document.removeEventListener(FOCUS_SIDEBAR_SEARCH_EVENT, focusSearch)
  }, [actions])

  const filteredConversations = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) {
      return conversations
    }
    return conversations.filter((conv) =>
      (conv.title || tSidebar.untitled).toLowerCase().includes(query),
    )
  }, [conversations, search, tSidebar.untitled])

  const groups = useMemo(
    () =>
      groupConversationsByDate(filteredConversations).map(({ key, items }) => ({
        key,
        label: tSidebar[key],
        items,
      })),
    [filteredConversations, tSidebar],
  )

  const handleNewChat = () => {
    closeDrawer()
    clearCurrentConversation()
    navigation.toNewChat()
  }

  const list = (
    <ConversationSidebar
      collapsed={sidebarCollapsed}
      drawer={
        drawer
          ? {
              open: drawerOpen,
              onClose: closeDrawer,
              label: tSidebar.drawerLabel,
            }
          : undefined
      }
      onToggle={toggleSidebar}
      toggleLabels={{ open: tSidebar.openSidebar, close: tSidebar.closeSidebar }}
      resize={{
        label: tSidebar.resizeLabel,
        hint: tSidebar.resizeHint,
      }}
      groups={groups}
      getKey={(conv) => conv.id}
      renderRow={(conv) => (
        <ConversationRow
          conv={conv}
          isCurrent={activeConversationId === conv.id}
          menuItems={menuItems(conv)}
          openMenu={openMenu}
          onOpen={closeDrawer}
        />
      )}
      loading={isLoading}
      placeholder={
        <EmptyState
          variant="bare"
          title={conversations.length === 0 ? tSidebar.noConversations : strings.chrome.noMatches}
        />
      }
      cycle={{
        current: filteredConversations.find((conv) => conv.id === activeConversationId),
        onSelect: (conv) => navigation.toConversation(conv.id),
      }}
      top={
        (top || actions) && (
          <>
            {top?.({ collapsed: sidebarCollapsed })}
            {actions && (
              <>
                <div className="flex flex-col gap-0.5 px-2 pt-2 pb-1">
                  <button
                    type="button"
                    onClick={handleNewChat}
                    className="flex items-center h-9 px-2 gap-3 rounded-lg font-medium transition-colors hover:chat-tint"
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
                      className="flex items-center h-9 px-2 gap-3 rounded-lg transition-colors hover:chat-tint"
                      title={tSidebar.attachments}
                      onClick={closeDrawer}
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

                {!sidebarCollapsed && conversations.length > 0 && (
                  <div className="px-2 pb-2">
                    <SearchInput
                      ref={searchInputRef}
                      value={search}
                      onValueChange={setSearch}
                      label={strings.chrome.searchLabel}
                      placeholder={strings.chrome.searchPlaceholder}
                    />
                  </div>
                )}
              </>
            )}
          </>
        )
      }
      footer={<ManageProvidersLink />}
    />
  )

  return (
    <>
      {(drawer || sidebar !== 'hidden') && list}

      {overlays}
    </>
  )
}
