import { pressedToast } from './Toast'

interface CloseDetails {
  reason: string
  event: Event
  cancel: () => void
}

/** The `onOpenChange` of a modal or drawer that the host opens and closes:
 *  Escape and a press outside close it unless it's not `dismissible`, and a
 *  press on a toast never does, since the toast sits above the backdrop. */
export function closeHandler(dismissible: boolean, onClose: () => void) {
  return (next: boolean, details: CloseDetails) => {
    if (next) {
      return
    }
    if (
      (!dismissible && details.reason === 'escape-key') ||
      (details.reason === 'outside-press' && pressedToast(details.event))
    ) {
      details.cancel()
      return
    }
    onClose()
  }
}

/** The row of a dialog's actions along its bottom edge, ruled off from its body. */
export const dialogFooterClassName =
  'flex shrink-0 items-center justify-end gap-2 border-t border-(--theme-border) px-5 py-3'
