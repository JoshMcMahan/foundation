import type { ReactNode } from 'react'
import { KeyboardShortcutsProvider } from '../core/KeyboardShortcutsProvider'
import ChatSidebar from './ChatSidebar'

// Sidebar plus main area; render the active page (empty state, thread, or
// attachments) as children. Must be mounted inside a ChatProvider.
export default function ChatLayout({
  children,
  sidebarActions = true,
}: {
  children: ReactNode
  sidebarActions?: boolean
}) {
  return (
    <KeyboardShortcutsProvider>
      <div className="flex h-full">
        <ChatSidebar actions={sidebarActions} />
        <main className="flex-1 flex flex-col min-w-0">{children}</main>
      </div>
    </KeyboardShortcutsProvider>
  )
}
