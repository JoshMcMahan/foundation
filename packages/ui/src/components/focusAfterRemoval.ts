/** What can take focus in a row. A row's controls can sit out of the tab order, as in a grid
 *  that moves its cursor with the arrow keys, and still take focus. */
const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
  '[contenteditable="true"]',
].join(', ')

/** An element on the way up from the row, and its siblings nearest first. */
interface Level {
  element: Element
  after: Element[]
  before: Element[]
}

/** What a dialog notes as it opens about the row its action may remove: what was around it,
 *  which a removed row no longer knows, and what in it opened the dialog. */
export interface RemovalPlan {
  row: Element
  /** The row, its list and so on up, so a row that goes with its list, such as the last in a
   *  group, still finds the next group's rows. */
  levels: Level[]
  opener: HTMLElement | null
  /** The opener's place among the row's controls, to find its match in another row. */
  slot: number
  /** The kind of popup the opener opens, such as `menu`, which matches more surely than a
   *  place when rows hold different controls. */
  popup: string | null
}

function controls(element: Element): HTMLElement[] {
  return [...element.querySelectorAll<HTMLElement>(FOCUSABLE)]
}

/** Above the rows, the controls in rows like the removed one, so a run's own control, such as
 *  the button in a group's heading that folds it, is passed by while a row is left to land on. */
function rowControls(plan: RemovalPlan, run: Element): HTMLElement[] {
  const found = controls(run)
  const inRows = found.filter((control) => {
    const row = control.closest(plan.row.localName)
    return row !== null && run.contains(row)
  })
  return inRows.length > 0 ? inRows : found
}

/** Notes, as the dialog opens, where focus goes if `row` is gone once it closes. */
export function planRemoval(row: Element): RemovalPlan {
  const active = row.ownerDocument.activeElement
  // From the row's menu, focus is in the menu, and the row's button is the one still open.
  const opener =
    active instanceof HTMLElement && row.contains(active)
      ? active
      : row.querySelector<HTMLElement>('[aria-expanded="true"]')
  const levels: Level[] = []
  for (let at: Element | null = row; at && at !== at.ownerDocument.body; at = at.parentElement) {
    const after: Element[] = []
    const before: Element[] = []
    for (let next = at.nextElementSibling; next; next = next.nextElementSibling) {
      after.push(next)
    }
    for (let prev = at.previousElementSibling; prev; prev = prev.previousElementSibling) {
      before.push(prev)
    }
    levels.push({ element: at, after, before })
  }
  return {
    row,
    levels,
    opener,
    slot: opener ? controls(row).indexOf(opener) : -1,
    popup: opener?.getAttribute('aria-haspopup') ?? null,
  }
}

/** In a row, the control that matches the opener, else its first. In a run of rows further
 *  up, the first match after the removed row or the last before it. */
function pick(plan: RemovalPlan, neighbor: Element, row: boolean, last: boolean) {
  if (!neighbor.isConnected) {
    return undefined
  }
  if (row && plan.opener === plan.row && neighbor.matches(FOCUSABLE)) {
    return neighbor as HTMLElement
  }
  const found = row ? controls(neighbor) : rowControls(plan, neighbor)
  const matches = plan.popup
    ? found.filter((control) => control.getAttribute('aria-haspopup') === plan.popup)
    : row && found[plan.slot]
      ? [found[plan.slot] as HTMLElement]
      : []
  const pool = matches.length > 0 ? matches : found
  const target = (last && !row ? pool.at(-1) : pool[0]) ?? neighbor
  // A row with nothing to focus, such as a spacer or a heading, isn't one to land on.
  return target.matches(FOCUSABLE) ? (target as HTMLElement) : undefined
}

/** What takes focus once the row is gone: the nearest row left, after it first, then before;
 *  else what held it, such as the list. Null while the row is still there, or when nothing
 *  that held it is left. */
export function removalTarget(plan: RemovalPlan): HTMLElement | null {
  if (plan.row.isConnected) {
    return null
  }
  for (const [depth, level] of plan.levels.entries()) {
    if (level.element.isConnected) {
      const holder = level.element as HTMLElement
      // What it holds now came after the dialog opened, as when the list was drawn again.
      const inside = controls(holder)[0]
      if (inside) {
        return inside
      }
      if (!holder.matches(FOCUSABLE)) {
        holder.tabIndex = -1
        // Only while it holds focus: left on, a click anywhere in it would focus it.
        holder.addEventListener('blur', () => holder.removeAttribute('tabindex'), { once: true })
      }
      return holder
    }
    const row = depth === 0
    for (const neighbor of level.after) {
      const target = pick(plan, neighbor, row, false)
      if (target) {
        return target
      }
    }
    for (const neighbor of level.before) {
      const target = pick(plan, neighbor, row, true)
      if (target) {
        return target
      }
    }
  }
  return null
}

/** Moves focus on as `removalTarget` would if the row goes after the dialog has closed, as when
 *  the list updates on a later fetch, and focus fell with it. It lets go once focus leaves the
 *  row. Returns a function that lets go. */
export function focusOnRemoval(plan: RemovalPlan): () => void {
  const doc = plan.row.ownerDocument
  const observer = new MutationObserver(() => {
    if (plan.row.isConnected) {
      return
    }
    stop()
    // A removed element drops focus to the body; anything else the reader chose.
    const active = doc.activeElement
    if (active === null || active === doc.body) {
      // As the dialog returns focus, without scrolling a list the reader may be scrolling.
      removalTarget(plan)?.focus({ preventScroll: true })
    }
  })
  const onFocusIn = (event: FocusEvent) => {
    if (!(event.target instanceof Node && plan.row.contains(event.target))) {
      stop()
    }
  }
  // A click on plain text moves focus to the body with no focusin. Checked once the event is
  // done, since a row that goes can take focus with it, which the observer handles.
  const onFocusOut = (event: FocusEvent) => {
    if (event.target instanceof Node && plan.row.contains(event.target)) {
      queueMicrotask(() => {
        if (plan.row.isConnected && !plan.row.contains(doc.activeElement)) {
          stop()
        }
      })
    }
  }
  const stop = () => {
    observer.disconnect()
    doc.removeEventListener('focusin', onFocusIn)
    doc.removeEventListener('focusout', onFocusOut)
  }
  // The whole document, since the row can go with its list.
  observer.observe(doc.body, { childList: true, subtree: true })
  doc.addEventListener('focusin', onFocusIn)
  doc.addEventListener('focusout', onFocusOut)
  return stop
}
