import { AnimatePresence, motion } from 'framer-motion'
import { type ReactNode, useState } from 'react'

// Height + opacity reveal for the summary sidebar's expandable regions (a
// subworkflow step's nested job list). Overflow is clipped while animating; the
// sidebar passes releaseOverflow={false} so it keeps clipping (it has no connector
// arcs to spill). The graph uses Reveal instead — it also animates width and its
// overflow releases so an inline subgraph's connectors aren't cut off.
export function Collapse({
  expanded,
  children,
  releaseOverflow = true,
}: {
  expanded: boolean
  children: ReactNode
  releaseOverflow?: boolean
}) {
  const [overflowVisible, setOverflowVisible] = useState(false)
  return (
    <AnimatePresence initial={false}>
      {expanded && (
        <motion.div
          key="collapse"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
          style={{ overflow: overflowVisible ? 'visible' : 'hidden' }}
          onAnimationStart={() => setOverflowVisible(false)}
          onAnimationComplete={() => {
            if (expanded && releaseOverflow) {
              setOverflowVisible(true)
            }
          }}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
