import { type ReactNode, useLayoutEffect, useRef, useState } from 'react'
import { cx } from '../cx'
import { RemoveIcon } from '../icons'
import { AppLink } from './AppLink'
import { Popover } from './Popover'
import { useLocale, useStrings } from './Provider'

export interface TagStyle {
  /** Monospace text, for a value read as code, such as a key=value label. */
  mono?: boolean | undefined
  /** Small capitals with wider spacing, for a short code such as a region. */
  caps?: boolean | undefined
}

/** The one tag look: a pill with a hairline border and 11px text. Another component's chip,
 *  such as a picker's chosen value, uses it to look the same. */
export function tagClasses({ mono = false, caps = false }: TagStyle = {}): string {
  return cx(
    'inline-flex h-5 max-w-full min-w-0 shrink-0 items-center gap-1 rounded-full border border-(--theme-border) px-2 text-[11px] leading-none whitespace-nowrap text-(--theme-app)',
    mono ? 'font-mono' : 'font-sans',
    caps && 'text-[10px] font-medium tracking-wide uppercase',
  )
}

export interface TagProps extends TagStyle {
  children: ReactNode
  /** A dot before the text in this color, any CSS color, such as a label's own. */
  color?: string | undefined
  /** Makes the tag a link, through the host's router. */
  href?: string | undefined
  /** Adds an × that removes the tag, named by `removeLabel` ("Remove gpu" by default). */
  onRemove?: (() => void) | undefined
  removeLabel?: string | undefined
  /** A hint on hover, such as the full text of a long tag. */
  title?: string | undefined
  className?: string | undefined
}

/** A tag or label on a thing: a pill with an optional color dot, a link with `href`, and an ×
 *  with `onRemove`. */
export function Tag({
  children,
  color,
  href,
  onRemove,
  removeLabel,
  title,
  mono,
  caps,
  className,
}: TagProps) {
  const { dropdown } = useStrings()
  const content = (
    <>
      {color && (
        <span
          aria-hidden="true"
          className="size-2 shrink-0 rounded-full"
          style={{ background: color }}
        />
      )}
      <span className="min-w-0 truncate py-px">{children}</span>
    </>
  )
  const classes = cx(tagClasses({ mono, caps }), className)
  const hover = 'transition-colors hover:bg-(--theme-hover)'
  if (!onRemove) {
    return href ? (
      <AppLink href={href} title={title} className={cx(classes, hover, 'no-underline')}>
        {content}
      </AppLink>
    ) : (
      <span title={title} className={classes}>
        {content}
      </span>
    )
  }
  const name = removeLabel ?? dropdown.removeValue(typeof children === 'string' ? children : '')
  return (
    <span title={title} className={cx(classes, 'pr-0.5')}>
      {href ? (
        <AppLink
          href={href}
          className="inline-flex min-w-0 items-center gap-1 text-inherit no-underline hover:underline"
        >
          {content}
        </AppLink>
      ) : (
        content
      )}
      <button
        type="button"
        onClick={onRemove}
        aria-label={name.trim()}
        className="flex size-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-(--theme-muted-text-color) hover:bg-(--theme-hover) hover:text-(--theme-app) focus-visible:outline-2 focus-visible:outline-(--theme-focus)"
      >
        <RemoveIcon aria-hidden="true" className="size-2.5" />
      </button>
    </span>
  )
}

/** One tag of a `TagList`: a string is its own key and label. */
export type TagItem =
  | string
  | { key: string; label: ReactNode; color?: string | undefined; href?: string | undefined }

export interface TagListProps extends TagStyle {
  tags: readonly TagItem[]
  /** `wrap`, the default, runs onto more lines; `clip` keeps one line and ends with a "+N"
   *  chip for the tags that don't fit, which lists them on hover or focus. */
  overflow?: 'wrap' | 'clip' | undefined
  /** Shows at most this many, the rest in the "+N" chip. */
  max?: number | undefined
  /** Adds an × to each tag; called with the tag's key. */
  onRemove?: ((key: string) => void) | undefined
  className?: string | undefined
}

interface NormalTag {
  key: string
  label: ReactNode
  color?: string | undefined
  href?: string | undefined
}

const normal = (tag: TagItem): NormalTag =>
  typeof tag === 'string' ? { key: tag, label: tag } : tag

const text = (tag: NormalTag): string => (typeof tag.label === 'string' ? tag.label : tag.key)

/** A thing's tags as a list: wrapped, or on one line ending in "+N" for the rest. */
export function TagList({
  tags,
  overflow = 'wrap',
  max,
  mono,
  caps,
  onRemove,
  className,
}: TagListProps) {
  const items = tags.map(normal)
  const clip = overflow === 'clip'
  const capped = max === undefined ? items.length : Math.max(0, Math.min(max, items.length))
  const [fit, setFit] = useState(capped)
  const list = useRef<HTMLUListElement>(null)
  const measure = useRef<HTMLDivElement>(null)

  // One line: as many tags as fit beside the "+N" chip, measured on a hidden copy of the row
  // so the count doesn't feed back on itself as tags hide.
  const signature = items.map((item) => item.key).join('\n')
  // The signature stands for the items: a new array of the same tags measures nothing new.
  // biome-ignore lint/correctness/useExhaustiveDependencies: signature re-measures on new tags
  useLayoutEffect(() => {
    const row = list.current
    const copy = measure.current
    if (!clip || !row || !copy) {
      return
    }
    const place = () => {
      const width = row.clientWidth
      const chips = [...copy.children] as HTMLElement[]
      const more = chips.pop()
      const gap = 4
      const widths = chips.slice(0, capped).map((chip) => chip.offsetWidth)
      const total = widths.reduce((sum, w, i) => sum + w + (i ? gap : 0), 0)
      if (capped === items.length && total <= width) {
        setFit(capped)
        return
      }
      const room = width - (more?.offsetWidth ?? 0) - gap
      let used = 0
      let count = 0
      for (const w of widths) {
        const next = used + (count ? gap : 0) + w
        if (next > room) {
          break
        }
        used = next
        count++
      }
      setFit(count)
    }
    place()
    if (typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(place)
    observer.observe(row)
    return () => observer.disconnect()
  }, [clip, capped, signature, items.length])

  const shown = items.slice(0, clip ? fit : capped)
  const hidden = items.slice(shown.length)
  const style = { mono, caps }
  const tag = (item: NormalTag) => (
    <Tag
      {...style}
      color={item.color}
      href={item.href}
      onRemove={onRemove ? () => onRemove(item.key) : undefined}
    >
      {item.label}
    </Tag>
  )
  return (
    <div className={cx('relative min-w-0', clip && 'overflow-hidden', className)}>
      <ul
        ref={list}
        className={cx('m-0 flex min-w-0 list-none items-center gap-1 p-0', !clip && 'flex-wrap')}
      >
        {shown.map((item) => (
          <li key={item.key} className="flex min-w-0">
            {tag(item)}
          </li>
        ))}
        {hidden.length > 0 && (
          <li className="flex shrink-0">
            <MoreTags tags={hidden} {...style} />
          </li>
        )}
      </ul>
      {clip && (
        // A copy of the row, never seen or reached, that the fitting measures.
        <div
          ref={measure}
          aria-hidden="true"
          inert
          className="pointer-events-none invisible absolute top-0 left-0 flex h-0 items-center gap-1 overflow-hidden"
        >
          {items.slice(0, capped).map((item) => (
            <span key={item.key} className="flex shrink-0">
              {tag(item)}
            </span>
          ))}
          <span className={tagClasses(style)}>+{items.length}</span>
        </div>
      )}
    </div>
  )
}

/** "+N" for the tags a list leaves out: a button that shows them in a popover, which also
 *  opens while the pointer rests on it, and whose name lists them. */
function MoreTags({ tags, ...style }: { tags: NormalTag[] } & TagStyle) {
  const { common } = useStrings()
  const locale = useLocale()
  const names = tags.map(text)
  const count = new Intl.NumberFormat(locale).format(tags.length)
  return (
    <Popover
      openOnHover
      initialFocus="popup"
      aria-label={common.moreCount(tags.length)}
      className="max-w-64 p-2"
      trigger={
        <button
          type="button"
          aria-label={`${common.moreCount(tags.length)}: ${names.join(', ')}`}
          className={cx(
            tagClasses(style),
            'cursor-pointer text-(--theme-muted-text-color) tabular-nums hover:bg-(--theme-hover) hover:text-(--theme-app) focus-visible:outline-2 focus-visible:outline-(--theme-focus) data-popup-open:bg-(--theme-hover)',
          )}
        >
          +{count}
        </button>
      }
    >
      <ul className="m-0 flex list-none flex-wrap gap-1 p-0">
        {tags.map((tag) => (
          <li key={tag.key} className="flex min-w-0">
            <Tag {...style} color={tag.color} href={tag.href}>
              {tag.label}
            </Tag>
          </li>
        ))}
      </ul>
    </Popover>
  )
}

/** Tags as the strings they hold, from an array or a comma-separated string: trimmed, empty
 *  ones dropped, each once. Anything else is no tags. */
export function normalizeTags(tags: unknown): string[] {
  const list = Array.isArray(tags) ? tags : typeof tags === 'string' ? tags.split(',') : []
  const seen = new Set<string>()
  for (const tag of list) {
    if (typeof tag === 'string' || typeof tag === 'number') {
      const value = String(tag).trim()
      if (value) {
        seen.add(value)
      }
    }
  }
  return [...seen]
}
