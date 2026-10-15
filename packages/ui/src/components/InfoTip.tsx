import { Fragment, type ReactNode } from 'react'
import { cx } from '../cx'
import { HelpIcon } from '../icons'
import { ExternalLink } from './ExternalLink'
import { keyedByContent } from './keys'
import { Popover } from './Popover'
import { useStrings } from './Provider'
import type { TooltipSide } from './Tooltip'

const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g

function formatLine(line: string) {
  const nodes: ReactNode[] = []
  let last = 0
  for (const match of line.matchAll(linkRegex)) {
    if (match.index > last) {
      nodes.push(line.slice(last, match.index))
    }
    nodes.push(
      <ExternalLink key={match.index} href={match[2]} className="underline">
        {match[1]}
      </ExternalLink>,
    )
    last = match.index + match[0].length
  }
  if (last < line.length) {
    nodes.push(line.slice(last))
  }
  return nodes
}

/** Infotip text can come from untrusted sources (workflow YAML), so all markup is literal text — only `[text](url)` links and newlines are parsed. */
export function formatInfoTipContent(content: string): ReactNode {
  if (!content) {
    return null
  }
  return keyedByContent(content.split(/<br\s*\/?>|\n/i), (l) => l).map(
    ({ key, item: line }, idx) => (
      <Fragment key={key}>
        {idx > 0 && <br />}
        {formatLine(line)}
      </Fragment>
    ),
  )
}

const hasLink = (content: string) => new RegExp(linkRegex.source).test(content)

interface InfoTipProps {
  text: string
  side?: TooltipSide
  className?: string | undefined
  /** Replaces the info icon as the trigger, such as a status label the text explains. */
  children?: ReactNode
  /** The text is also a control's description, which assistive technology reads with the
   *  control, so the ? is hidden from it and skipped by Tab rather than offering the text twice.
   *  Text with a link keeps the ? reachable, as the only way to the link from the keyboard. */
  describesControl?: boolean | undefined
  /** Opens it from outside as well as on hover and press, such as while the described control
   *  has keyboard focus. Pair it with `onOpenChange`. */
  open?: boolean | undefined
  onOpenChange?: ((open: boolean) => void) | undefined
  /** Stays on `side` rather than flipping where it doesn't fit, as while the control it
   *  describes is typed in, which a flipped tip would cover. */
  keepSide?: boolean | undefined
  /** Placed against this element rather than the ?, such as beside the control it describes. */
  anchor?: Element | null | undefined
}

/** Extra detail behind an info trigger. A popover that also opens on hover, so
 *  touch and screen reader users can reach it and its links. */
export function InfoTip({
  text,
  side = 'top',
  className,
  children,
  describesControl = false,
  open,
  onOpenChange,
  keepSide = false,
  anchor,
}: InfoTipProps) {
  const t = useStrings().common
  if (!text) {
    return children ? <span className={className}>{children}</span> : null
  }
  const hidden = describesControl && !hasLink(text)
  return (
    <Popover
      variant="tip"
      openOnHover
      side={side}
      keepSide={keepSide}
      anchor={anchor}
      {...(open === undefined ? {} : { open })}
      {...(onOpenChange ? { onOpenChange } : {})}
      // Opened while its control has focus, the tip must leave focus in the control, and a
      // hidden ? has nothing to take focus back to when it closes.
      {...(describesControl && { initialFocus: 'none' as const })}
      {...(hidden && { finalFocus: false })}
      trigger={
        <button
          type="button"
          {...(hidden && { tabIndex: -1, 'aria-hidden': true })}
          aria-label={children || hidden ? undefined : t.moreInfo}
          className={cx('inline-flex items-center cursor-help', !children && 'tooltip', className)}
        >
          {children ?? <HelpIcon aria-hidden="true" />}
        </button>
      }
    >
      {formatInfoTipContent(text)}
    </Popover>
  )
}
