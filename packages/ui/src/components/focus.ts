/** A ref that focuses a field once, when it mounts; stable so re-renders never move focus back. */
export function focusOnMount(element: HTMLElement | null): void {
  element?.focus()
}

// A text box matches :focus-visible when it is clicked too, since it takes typing, so CSS can't
// tell whether focus came from the keyboard. The last key or press on the page tells instead.
let fromKeyboard = false
let listening = false

function onKeyDown(event: KeyboardEvent) {
  // A shortcut such as Cmd+C is not someone moving around by keyboard.
  if (!event.metaKey && !event.ctrlKey && !event.altKey) {
    fromKeyboard = true
  }
}

function onPointerDown() {
  fromKeyboard = false
}

/** Starts telling keyboard focus from pointer focus, for `focusCameFromKeyboard`. Call it once
 *  something needs to know, such as when a component that asks mounts. */
export function trackFocusModality(): void {
  if (listening || typeof document === 'undefined') {
    return
  }
  listening = true
  // Capture, so a handler that stops propagation can't hide the key or press.
  document.addEventListener('keydown', onKeyDown, true)
  document.addEventListener('pointerdown', onPointerDown, true)
}

/** Whether the focus that just landed came from the keyboard rather than a press. */
export function focusCameFromKeyboard(): boolean {
  return fromKeyboard
}
