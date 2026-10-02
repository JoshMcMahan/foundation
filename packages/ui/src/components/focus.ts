/** A ref that focuses a field once, when it mounts; stable so re-renders never move focus back. */
export function focusOnMount(element: HTMLElement | null): void {
  element?.focus()
}
