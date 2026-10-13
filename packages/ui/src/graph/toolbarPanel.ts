/** A toolbar button's panel: above the button when there's room, its right edge
 *  lined up with the button's, focused itself so a list doesn't open on one item. */
export const toolbarPanel = {
  side: 'top',
  align: 'end',
  initialFocus: 'popup',
  className: 'w-96 text-xs',
} as const
