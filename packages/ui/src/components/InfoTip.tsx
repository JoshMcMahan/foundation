import { Popover } from '@base-ui/react/popover'
import { clsx as cx } from 'clsx'
import { Fragment, type ReactNode } from 'react'
import { TooltipIcon } from '../icons'
import { portalContainer, positionerClassName, tipArrowClassName, tipClassName } from './floating'
import { keyedByContent } from './keys'
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
      <a
        key={match.index}
        href={match[2]}
        target="_blank"
        rel="noopener noreferrer"
        className="underline"
      >
        {match[1]}
      </a>,
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

interface InfoTipProps {
  text: string
  side?: TooltipSide
  className?: string | undefined
  /** Replaces the info icon as the trigger, such as a status label the text explains. */
  children?: ReactNode
}

/** Extra detail behind an info trigger. A popover that also opens on hover, so
 *  touch and screen reader users can reach it and its links. */
export function InfoTip({ text, side = 'top', className, children }: InfoTipProps) {
  const t = useStrings().common
  if (!text) {
    return children ? <span className={className}>{children}</span> : null
  }
  return (
    <Popover.Root>
      <Popover.Trigger
        openOnHover
        aria-label={children ? undefined : t.moreInfo}
        className={cx('inline-flex items-center cursor-help', !children && 'tooltip', className)}
      >
        {children ?? <TooltipIcon aria-hidden="true" />}
      </Popover.Trigger>
      <Popover.Portal container={portalContainer()}>
        <Popover.Positioner side={side} sideOffset={8} className={positionerClassName}>
          <Popover.Popup className={cx('max-w-sm text-left', tipClassName)}>
            <Popover.Arrow className={tipArrowClassName} />
            {formatInfoTipContent(text)}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}
