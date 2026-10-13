import { Collapsible } from '@base-ui/react/collapsible'
import type { ReactNode } from 'react'

// Height + opacity reveal for list rows that expand in place: the summary
// sidebar's nested job lists and the tree view's jobs and steps. It clips while
// open too, since these lists have no connector arcs to spill. The graph uses
// Reveal instead — it also animates width and releases overflow so an inline
// subgraph's connectors aren't cut off.
export function Collapse({
  expanded,
  id,
  children,
}: {
  expanded: boolean
  /** The external toggle's aria-controls target. */
  id?: string
  children: ReactNode
}) {
  return (
    <Collapsible.Root open={expanded}>
      <Collapsible.Panel
        id={id}
        className="h-(--collapsible-panel-height) overflow-hidden transition-[height,opacity] duration-200 ease-[cubic-bezier(0.25,0.1,0.25,1)] data-starting-style:h-0 data-starting-style:opacity-0 data-ending-style:h-0 data-ending-style:opacity-0"
      >
        {children}
      </Collapsible.Panel>
    </Collapsible.Root>
  )
}
