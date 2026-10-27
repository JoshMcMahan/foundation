import { type ReactNode, useState } from 'react'
import type { Breadcrumb } from '../components/Breadcrumbs'
import { PageHeader } from '../components/PageHeader'
import { useWidth } from '../components/useWidth'
import { cx } from '../cx'

export interface ListDetailProps {
  /** The list, such as a `ListPage`. It fills its pane's height and scrolls itself. */
  list: ReactNode
  /** What the open item shows, or, with nothing open, what the pane says beside the list, such
   *  as how many are unread. It fills its pane; give it its own scroll and padding. */
  detail: ReactNode
  /** Whether an item is open. Where the two panes don't fit side by side, as on a phone, the open
   *  item shows alone at full width in place of the list, and the list shows again when it
   *  closes, where it was scrolled to. */
  open: boolean
  /** The page's trail while the open item shows alone: the list's page, as a link back to it,
   *  then the item, such as `[{ label: 'Inbox', href: '/inbox' }, { label: 'Alert' }]`; name the
   *  item's kind rather than repeating the title its own heading shows. Its
   *  first crumb is the way back to the list; put the open item in the URL so that link and the
   *  browser's back button both close it. Where both panes show, the page keeps its own trail. */
  detailBreadcrumbs: readonly Breadcrumb[]
  /** Names the list's pane for assistive technology. */
  listLabel: string
  /** Names the detail's pane for assistive technology. */
  detailLabel: string
  /** The list's width where both panes show. */
  listWidth?: number | undefined
  /** The narrowest the detail goes beside the list. Narrower than the list and this together,
   *  one pane shows at a time. */
  minDetailWidth?: number | undefined
  className?: string | undefined
}

/** A list beside the item open from it, such as an inbox and the message being read. Where both
 *  don't fit, as on a phone, one shows at a time: the list, then the open item at full width
 *  with the page's trail leading back. It fills its parent's height, so give it one: `flex-1` in
 *  a flex column that has one. */
export function ListDetail({
  list,
  detail,
  open,
  detailBreadcrumbs,
  listLabel,
  detailLabel,
  listWidth = 400,
  minDetailWidth = 320,
  className,
}: ListDetailProps) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const width = useWidth(root)
  const split = width !== null && width >= listWidth + minDetailWidth
  const alone = !split && open

  return (
    <div
      ref={setRoot}
      className={cx('grid min-h-0 flex-1', className)}
      style={{
        gridTemplateColumns: split ? `${listWidth}px minmax(0, 1fr)` : 'minmax(0, 1fr)',
        // One at a time, the panes share one cell, so the list keeps its scroll under the item.
        gridTemplateRows: 'minmax(0, 1fr)',
      }}
    >
      <section
        aria-label={listLabel}
        // Hidden but laid out, not removed: the list comes back where it was scrolled to.
        inert={alone}
        className={cx(
          'flex min-h-0 min-w-0 flex-col',
          split && 'border-r border-(--theme-border)',
          alone && 'invisible',
        )}
        style={split ? undefined : { gridArea: '1 / 1' }}
      >
        {list}
      </section>
      <section
        aria-label={detailLabel}
        className={cx('flex min-h-0 min-w-0 flex-col', !split && !open && 'hidden')}
        style={split ? undefined : { gridArea: '1 / 1' }}
      >
        {detail}
      </section>
      {alone && <PageHeader breadcrumbs={detailBreadcrumbs} />}
    </div>
  )
}
