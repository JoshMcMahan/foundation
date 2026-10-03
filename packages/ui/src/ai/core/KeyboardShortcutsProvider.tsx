import { useKeyboardShortcuts } from './useKeyboardShortcuts'

interface KeyboardShortcutsProviderProps {
  children: React.ReactNode
}

export function KeyboardShortcutsProvider({ children }: KeyboardShortcutsProviderProps) {
  // Initialize keyboard shortcuts
  useKeyboardShortcuts()

  return <>{children}</>
}
