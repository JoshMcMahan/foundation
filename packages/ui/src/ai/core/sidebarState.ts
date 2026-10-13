import { createContext, useCallback, useContext, useRef, useState } from 'react'
import { usePersistedState } from '../../components/Provider'

/** The conversation list beside the thread: full width, a rail of icons, or
 *  not shown at all (the host offers its own way back). */
export type SidebarState = 'expanded' | 'collapsed' | 'hidden'

/** How the layout shows the list right now: as a column beside the thread,
 *  or as a drawer over it. */
export type SidebarPresentation = 'inline' | 'drawer'

/** The reader's own choice between the column and the rail, remembered through
 *  the host's persisted state. Hiding the list is the host's call, so it lasts
 *  only for the page that made it. */
export function useOwnSidebar(): readonly [SidebarState, (state: SidebarState) => void] {
  const [remembered, remember] = usePersistedState<SidebarState>('aiChat.sidebar', 'expanded')
  const [hidden, setHidden] = useState(false)
  const set = useCallback(
    (state: SidebarState) => {
      setHidden(state === 'hidden')
      if (state !== 'hidden') {
        remember(state)
      }
    },
    [remember],
  )
  return [hidden ? 'hidden' : remembered === 'collapsed' ? 'collapsed' : 'expanded', set]
}

/** A value the host may own through a prop. Without the prop the provider
 *  keeps it in `own`; either way the change callback hears every change. The
 *  ref reads the latest value from callbacks that should not re-create. */
export function useControllable<T>(
  controlled: T | undefined,
  own: readonly [T, (value: T) => void],
  onChange: ((value: T) => void) | undefined,
) {
  const [ownValue, setOwn] = own
  const value = controlled === undefined ? ownValue : controlled
  const latest = useRef({ value, controlled: controlled !== undefined, onChange, setOwn })
  latest.current = { value, controlled: controlled !== undefined, onChange, setOwn }

  const set = useCallback((next: T) => {
    const l = latest.current
    if (Object.is(next, l.value)) {
      return
    }
    if (!l.controlled) {
      l.setOwn(next)
    }
    l.onChange?.(next)
  }, [])

  return [value, set, latest] as const
}

// ChatLayout reports how it shows the list; kept off useChat because only
// the layout should set it.
export const ReportSidebarPresentationContext = createContext<
  (presentation: SidebarPresentation) => void
>(() => {})

export function useReportSidebarPresentation() {
  return useContext(ReportSidebarPresentationContext)
}
