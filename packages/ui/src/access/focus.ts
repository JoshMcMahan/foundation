import { useCallback, useEffect, useRef } from 'react'

type Find = () => HTMLElement | null | undefined

/** Parks focus on the drawer itself before a change takes away the control that has it. When
 *  the focused control goes away, the drawer pulls focus back to itself, then again a frame
 *  later, which would undo wherever focus is sent next; parked, nothing is lost and it doesn't. */
export function holdFocus(): void {
  const active = document.activeElement
  const dialog =
    active instanceof HTMLElement ? active.closest<HTMLElement>('[role="dialog"]') : null
  if (dialog && dialog !== active) {
    dialog.focus({ preventScroll: true })
  }
}

/** Returns a function that sends focus to what `find` returns once the change it goes with
 *  has rendered. A save resolves on its own time, so the next commit is the moment to look,
 *  not the next frame. */
export function useFocusAfterRender(): (find: Find) => void {
  const pending = useRef<Find | undefined>(undefined)
  useEffect(() => {
    const find = pending.current
    pending.current = undefined
    find?.()?.focus()
  })
  return useCallback((find: Find) => {
    holdFocus()
    pending.current = find
  }, [])
}
