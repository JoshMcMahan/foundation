import { Fragment } from 'react'
import { Tooltip as BaseTooltip, type PlacesType } from 'react-tooltip'
import { TooltipIcon } from '../icons'
import { keyedByContent } from './keys'

export const TOOLTIP_ID = 'global-tooltip'

/** Anchor props that reveal `content` only while the text is ellipsized; `measure` picks the clipped descendant when it isn't the anchor. */
export function truncationTooltipProps(
  content: string,
  measure?: (anchor: HTMLElement) => HTMLElement | null,
) {
  return {
    role: 'none' as const,
    'data-tooltip-id': TOOLTIP_ID,
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
      const anchor = event.currentTarget
      const measured = measure ? measure(anchor) : anchor
      if (measured && measured.scrollWidth > measured.clientWidth) {
        anchor.setAttribute('data-tooltip-content', content)
      } else {
        anchor.removeAttribute('data-tooltip-content')
      }
    },
  }
}

const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g

function formatLine(line: string) {
  const nodes: React.ReactNode[] = []
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

/** Tooltip text can come from untrusted sources (workflow YAML), so all markup is literal text — only `[text](url)` links and newlines are parsed. */
export function formatTooltipContent(content: React.ReactNode) {
  if (typeof content !== 'string') {
    return content || null
  }
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

function KbdShortcut({ keys }: { keys: string }) {
  const parts = keys
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {keyedByContent(parts, (p) => p).map(({ key, item: part }, idx) => (
        <Fragment key={key}>
          {idx > 0 && <span className="opacity-60 text-[11px]">+</span>}
          <kbd className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded border border-white/30 bg-white/10 font-sans text-[11px] font-semibold leading-none">
            {part}
          </kbd>
        </Fragment>
      ))}
    </span>
  )
}

const globalCloseEvents = { escape: true }

/** Singleton rendered at layout root; anchors opt in via data-tooltip-id={TOOLTIP_ID}, data-tooltip-content, and data-tooltip-shortcut. */
export function GlobalTooltip() {
  return (
    <BaseTooltip
      id={TOOLTIP_ID}
      className="max-w-lg break-words config-tips normal-case text-left z-[10000]"
      place="top"
      globalCloseEvents={globalCloseEvents}
      render={({ content, activeAnchor }) => {
        const body = formatTooltipContent(content)
        const shortcut = activeAnchor?.getAttribute('data-tooltip-shortcut')
        if (!shortcut) {
          return body
        }
        return (
          <span className="inline-flex items-center gap-2">
            {body}
            <KbdShortcut keys={shortcut} />
          </span>
        )
      }}
    />
  )
}

interface ITooltipInfo {
  text: string
  className?: string | undefined
  place?: PlacesType
  children?: React.ReactNode
  tabIndex?: number
}

export function TooltipInfo({
  text,
  className = '',
  children,
  place = 'top',
  tabIndex,
}: ITooltipInfo) {
  const anchorProps = {
    'data-tooltip-id': TOOLTIP_ID,
    'data-tooltip-content': text,
    'data-tooltip-place': place,
    className,
  }
  if (children || !text) {
    return (
      <div {...anchorProps} tabIndex={tabIndex}>
        {children || <TooltipIcon className="tooltip" />}
      </div>
    )
  }
  return (
    <div {...anchorProps} role="img" aria-label={text} tabIndex={tabIndex ?? 0}>
      <TooltipIcon className="tooltip" />
    </div>
  )
}
