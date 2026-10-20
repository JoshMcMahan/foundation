import { type RefObject, useSyncExternalStore } from 'react'

// The element the reader last pressed, pointed at, focused or typed in. Whatever
// popup they open next opens from it, whether its trigger is a shared component's
// or a host's own, so it stands in for the trigger.
let lastTarget: Element | null = null
let tracking = false

const remember = (event: Event) => {
  if (event.target instanceof Element) {
    lastTarget = event.target
  }
}

function track() {
  if (tracking) {
    return
  }
  tracking = true
  for (const type of ['pointerdown', 'pointerover', 'focusin', 'keydown', 'contextmenu']) {
    document.addEventListener(type, remember, { capture: true, passive: true })
  }
}

function subscribe(onChange: () => void) {
  track()
  document.addEventListener('fullscreenchange', onChange)
  return () => document.removeEventListener('fullscreenchange', onChange)
}

function fullscreenElement(): HTMLElement | undefined {
  const element = document.fullscreenElement
  return element instanceof HTMLElement ? element : undefined
}

/** The innermost `<dialog>` shown with `showModal()` that holds the node. */
function modalDialogAround(node: Element | null): HTMLDialogElement | undefined {
  for (
    let dialog = node?.closest('dialog');
    dialog;
    dialog = dialog.parentElement?.closest('dialog')
  ) {
    if (dialog.open && dialog.matches(':modal')) {
      return dialog
    }
  }
  return undefined
}

/** Where a popup opening now from `trigger` belongs. A modal dialog sits in the
 *  browser's top layer, above any z-index, and leaves the rest of the page inert,
 *  so a popup portaled to the body would open under it, out of reach. Focus stays
 *  inside the dialog, so it also places a popup opened by code rather than by the
 *  reader. A fullscreen element is all the browser shows. Null keeps the default:
 *  the popup it opened from, or the body. */
export function popupContainerFor(trigger: Element | null): HTMLElement | null {
  return (
    modalDialogAround(trigger?.isConnected ? trigger : null) ??
    modalDialogAround(document.activeElement) ??
    fullscreenElement() ??
    null
  )
}

export interface PopupPortalProps {
  /** Read when the portal mounts, which is when its popup opens. */
  container: RefObject<HTMLElement | null>
  className: string
}

// Inside a dialog the portal is a fixed point at the viewport's corner: a modal
// dialog scrolls its overflow, which would clip a popup placed within its box.
const portalClassName =
  '[dialog>&]:fixed [dialog>&]:top-0 [dialog>&]:left-0 [dialog>&]:z-(--layer-popover)'

function portalProps(): PopupPortalProps {
  return {
    container: {
      get current() {
        return popupContainerFor(lastTarget)
      },
    },
    className: portalClassName,
  }
}

// A portal finds its container again only when the prop changes, so each
// fullscreen element gets its own props, and a popup open as the page enters or
// leaves fullscreen moves with it.
const onPage = portalProps()
const inFullscreen = new WeakMap<HTMLElement, PopupPortalProps>()

/** Props for a popup's portal. The popup opens inside the innermost open modal
 *  `<dialog>` that holds its trigger, or else the fullscreen element, or else
 *  the body, so it shows above whatever the trigger sits in. */
export function usePopupContainer(): PopupPortalProps {
  const fullscreen = useSyncExternalStore(subscribe, fullscreenElement, () => undefined)
  if (!fullscreen) {
    return onPage
  }
  let props = inFullscreen.get(fullscreen)
  if (!props) {
    props = portalProps()
    inFullscreen.set(fullscreen, props)
  }
  return props
}
