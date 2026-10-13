import { type ReactNode, type RefObject, useLayoutEffect, useRef, useState } from 'react'
import { cx } from '../../cx'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import { KeyboardShortcutsProvider } from '../core/KeyboardShortcutsProvider'
import { type SidebarPresentation, useReportSidebarPresentation } from '../core/sidebarState'
import { SIDEBAR_DEFAULT_WIDTH_PX, SidebarToggle } from '../ui/sidebar'
import ChatSidebar from './ChatSidebar'

/** Where the conversation list goes: beside the thread, in a drawer over it,
 *  or whichever fits the width the chat is given. */
export type SidebarMode = 'inline' | 'drawer' | 'auto'

/** The list at its default width beside the narrowest thread that still
 *  reads comfortably; narrower than that, 'auto' moves the list to a drawer. */
export const DRAWER_BELOW_PX = SIDEBAR_DEFAULT_WIDTH_PX + 640

/** Put on the element the thread and composer sit in: their shared column
 *  grows with it, from 50rem to 64rem, instead of staying 50rem on a wide
 *  screen. */
export const CHAT_COLUMN_SCOPE = '@container [--chat-column:clamp(50rem,60cqi,64rem)]'

// Measured on the chat's own box rather than the window, because a chat
// embedded in a panel can be narrow on a wide screen.
function useSidebarPresentation(
  ref: RefObject<HTMLElement | null>,
  mode: SidebarMode,
  drawerBelowPx: number,
): SidebarPresentation {
  const [narrow, setNarrow] = useState(false)
  useLayoutEffect(() => {
    const el = ref.current
    if (mode !== 'auto' || !el) {
      return
    }
    const measure = () => setNarrow(el.clientWidth < drawerBelowPx)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, mode, drawerBelowPx])

  const presentation = mode === 'drawer' || (mode === 'auto' && narrow) ? 'drawer' : 'inline'
  const report = useReportSidebarPresentation()
  useLayoutEffect(() => {
    report(presentation)
  }, [report, presentation])
  useLayoutEffect(() => () => report('inline'), [report])
  return presentation
}

/** A conversation list beside a thread, or in a drawer over it when the
 *  space is narrow. The list reads where it goes from `useChat`
 *  (`sidebarPresentation`, `drawerOpen`); `ChatLayout` is this with the chat
 *  list, and a host with its own list uses it directly. Must be mounted
 *  inside a ChatProvider. */
export function ConversationLayout({
  sidebar,
  children,
  sidebarMode = 'inline',
  drawerBelowPx = DRAWER_BELOW_PX,
  drawerToggle = true,
  drawerBar,
}: {
  sidebar: ReactNode
  children: ReactNode
  sidebarMode?: SidebarMode
  /** The width under which 'auto' shows the drawer. */
  drawerBelowPx?: number
  /** False when the host's own header opens the drawer. */
  drawerToggle?: boolean
  /** Beside the drawer's toggle, while the list is a drawer: what the top of
   *  the list would otherwise keep in view. */
  drawerBar?: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)
  const drawer = useSidebarPresentation(ref, sidebarMode, drawerBelowPx) === 'drawer'
  const { drawerOpen, toggleSidebar } = useChat()
  const { strings } = useChatConfig()

  return (
    <div ref={ref} className={cx('flex h-full', drawer && 'relative overflow-hidden')}>
      {sidebar}
      <main className={cx('flex min-w-0 flex-1 flex-col', CHAT_COLUMN_SCOPE)}>
        {drawer && (drawerToggle || drawerBar) && (
          <div className="flex shrink-0 items-center gap-2 bg-(--theme-panel-bg) px-2 pt-2">
            {drawerToggle && (
              <SidebarToggle
                collapsed={!drawerOpen}
                onToggle={toggleSidebar}
                openLabel={strings.sidebar.openSidebar}
                closeLabel={strings.sidebar.closeSidebar}
              />
            )}
            {drawerBar}
          </div>
        )}
        <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      </main>
    </div>
  )
}

// The chat list in a ConversationLayout; render the active page (empty state,
// thread, or attachments) as children. Must be mounted inside a ChatProvider.
export default function ChatLayout({
  children,
  sidebarActions = true,
  sidebarTop,
  sidebarMode = 'inline',
  drawerBelowPx = DRAWER_BELOW_PX,
  drawerToggle = true,
  drawerBar,
}: {
  children: ReactNode
  sidebarActions?: boolean
  /** Above the conversation list, given whether it is collapsed to the rail. */
  sidebarTop?: ((state: { collapsed: boolean }) => ReactNode) | undefined
  sidebarMode?: SidebarMode
  /** The chat's width under which 'auto' shows the drawer. */
  drawerBelowPx?: number
  /** False when the host's own header opens the drawer. */
  drawerToggle?: boolean
  /** Beside the drawer's toggle, while the list is a drawer. */
  drawerBar?: ReactNode
}) {
  return (
    <KeyboardShortcutsProvider>
      <ConversationLayout
        sidebar={<ChatSidebar actions={sidebarActions} top={sidebarTop} />}
        sidebarMode={sidebarMode}
        drawerBelowPx={drawerBelowPx}
        drawerToggle={drawerToggle}
        drawerBar={drawerBar}
      >
        {children}
      </ConversationLayout>
    </KeyboardShortcutsProvider>
  )
}
