import { type ReactNode, useLayoutEffect, useState } from 'react'
import { cx } from '../cx'
import { useSplitter } from './splitter'
import { Tabs } from './Tabs'

// The gap between the two panes, which the handle sits in.
const GAP_PX = 12

export interface SplitViewPane<Value extends string = string> {
  value: Value
  /** Names the pane in the switch. */
  label: string
  icon?: ReactNode
  /** Kept mounted while another pane shows, and as the width crosses the split, so an editor
   *  keeps its cursor and undo. It fills the pane's height. */
  content: ReactNode
}

export interface SplitViewProps<Value extends string> {
  /** Names the switch between the panes for assistive technology. */
  label: string
  /** The first pane is the start pane, such as an editor. The rest take turns beside it, such as
   *  a preview and a form, with a switch between them when there are two or more. */
  panes: [SplitViewPane<Value>, SplitViewPane<Value>, ...SplitViewPane<Value>[]]
  /** The pane shown first: beside the start pane where two fit, alone where they don't. */
  defaultValue?: Value | undefined
  /** Hears the pane the reader picks. */
  onValueChange?: ((value: Value) => void) | undefined
  /** The narrowest a pane goes. Two panes show side by side only where both fit at this width;
   *  narrower, as on a phone, one pane shows at a time at full width. */
  minPaneWidth?: number | undefined
  /** At the switch row's far end, such as an action on what the panes show. */
  end?: ReactNode
  className?: string | undefined
}

function useWidth(el: HTMLElement | null): number | null {
  const [width, setWidth] = useState<number | null>(null)
  useLayoutEffect(() => {
    if (!el) {
      return
    }
    const measure = () => setWidth(el.getBoundingClientRect().width || null)
    measure()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [el])
  return width
}

/** Two panes of one task side by side, such as text and a preview of it, with a handle between
 *  them that resizes them. Where two don't fit, as on a phone, one pane shows at a time at full
 *  width, with a switch between them. It fills its parent's height, so give it one: a fixed
 *  height, or `flex-1` in a flex column that has one. */
export function SplitView<Value extends string>({
  label,
  panes,
  defaultValue,
  onValueChange,
  minPaneWidth = 320,
  end,
  className,
}: SplitViewProps<Value>) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null)
  const width = useWidth(root)
  const [start, ...ends] = panes
  const [shown, setShown] = useState<Value>(defaultValue ?? start.value)
  // The pane beside the start pane; the last one picked, so widening the window keeps it.
  const [beside, setBeside] = useState<Value>(
    ends.some((pane) => pane.value === shown) ? shown : (ends[0]?.value ?? start.value),
  )
  const [chosen, setChosen] = useState<number | null>(null)
  const split = width !== null && width >= minPaneWidth * 2 + GAP_PX
  const room = (width ?? 0) - GAP_PX
  const half = Math.round(room / 2)
  const clamp = (px: number) => Math.max(minPaneWidth, Math.min(px, room - minPaneWidth))
  const splitter = useSplitter({
    width: clamp(chosen ?? half),
    onWidthChange: setChosen,
    min: minPaneWidth,
    max: () => room - minPaneWidth,
    side: 'left',
    defaultWidth: half,
  })

  const pick = (value: Value) => {
    setShown(value)
    if (value !== start.value) {
      setBeside(value)
    }
    onValueChange?.(value)
  }
  const visible = (value: Value) =>
    split ? value === start.value || value === beside : value === shown

  return (
    <div ref={setRoot} className={cx('flex min-h-0 flex-1 flex-col gap-3', className)}>
      <Tabs
        label={label}
        variant="segmented"
        fill={!split}
        items={(split ? ends : panes).map(({ value, label: name, icon }) => ({
          value,
          label: name,
          icon,
        }))}
        value={split ? beside : shown}
        onValueChange={pick}
        end={end}
        // One pane at a time, the switch spans the width, each pane's name a wide target.
        className={split ? 'justify-end' : '[&>[role=tablist]]:flex-1'}
      />
      <div className="flex min-h-0 flex-1">
        {panes.flatMap((pane, index) => {
          const isStart = index === 0
          const out = [
            <section
              key={pane.value}
              aria-label={pane.label}
              className={cx(
                'flex min-h-0 min-w-0 flex-col',
                split && !isStart ? 'shrink-0' : 'flex-1',
                !visible(pane.value) && 'hidden',
              )}
              style={split && !isStart ? { width: splitter.width } : undefined}
            >
              {pane.content}
            </section>,
          ]
          if (isStart && split) {
            out.push(
              <div key="split-view-handle" className="relative shrink-0" style={{ width: GAP_PX }}>
                <div
                  {...splitter.separatorProps}
                  className={cx(splitter.separatorProps.className, 'left-0.75 rounded-full')}
                />
                <div
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-1/2 h-8 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-(--theme-border)"
                />
              </div>,
            )
          }
          return out
        })}
      </div>
    </div>
  )
}
