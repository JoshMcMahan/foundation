import { AnimatePresence, motion } from 'framer-motion'
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
  id?: string
  children: ReactNode
}) {
  return (
    <AnimatePresence initial={false}>
      {expanded && (
        <motion.div
          key="collapse"
          id={id}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
