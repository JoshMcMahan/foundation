import { Fragment } from 'react'
import { Loader } from '../../components/Loader'
import { cx } from '../../cx'
import { formatBytes } from '../../format'
import { FileIcon, RemoveIcon } from '../../icons'
import { useChatConfig } from '../core/config'
import { fencePaste } from '../core/pasteLanguage'
import { splitPastes } from '../core/pastes'
import type { MessagePaste } from '../types'
import Markdown from '../ui/Markdown'

/** A paste sent, or about to be sent, as its saved file. */
export function PasteFileCard({
  id,
  lines,
  bytes,
  saving = false,
  error,
  onRemove,
}: {
  id?: number | undefined
  lines: number
  bytes: number
  saving?: boolean
  error?: string | undefined
  onRemove?: (() => void) | undefined
}) {
  const t = useChatConfig().strings.paste
  const detail = error ?? (saving ? t.saving : `${t.lines(lines)} · ${formatBytes(bytes)}`)
  return (
    <div
      data-testid="paste-file-card"
      className={cx(
        'inline-flex max-w-full items-center gap-2.5 rounded-xl px-3 py-2 align-top whitespace-normal',
        'bg-(--theme-panel-bg)',
        error ? 'border border-(--theme-error)' : 'chat-hairline',
      )}
    >
      <FileIcon className="h-5 w-5 flex-shrink-0 theme-muted-text" />
      <div className="min-w-0 text-left leading-tight">
        <div className="truncate text-sm font-medium theme-text">
          {id ? `paste-${id}.txt` : t.title}
        </div>
        <div
          className={cx(
            'truncate text-xs',
            error ? 'text-(--theme-error-text)' : 'theme-muted-text',
          )}
        >
          {detail}
        </div>
      </div>
      {saving && <Loader inline decorative size={14} color="var(--theme-muted-text-color)" />}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t.remove}
          title={t.remove}
          className="flex-shrink-0 rounded p-0.5 theme-muted-text hover:theme-text"
        >
          <RemoveIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

/** A user message as typed: an inline paste as a code block in the language
 *  it reads as, one sent as its file as a card. The blank lines the composer puts around a
 *  paste would stack on the block's own spacing, so they are dropped. */
export function UserMessageText({
  content,
  pastes,
}: {
  content: string
  pastes?: MessagePaste[] | null | undefined
}) {
  if (!pastes?.length) {
    return <>{content}</>
  }
  const segments = splitPastes(content, pastes)
  // A block keeps its margin wherever something sits on that side of it. CSS
  // first/last selectors cannot do this: they skip the text nodes around it.
  const shows = (seg: (typeof segments)[number]) => typeof seg !== 'string' || seg.trim() !== ''
  const blockSpacing = (i: number) =>
    cx(
      segments.slice(0, i).some(shows) ? 'mt-2.5' : 'mt-0',
      segments.slice(i + 1).some(shows) ? 'mb-2.5' : 'mb-0',
    )
  return (
    <>
      {segments.map((segment, i) => {
        if (typeof segment === 'string') {
          let text = segment
          if (i > 0) {
            text = text.replace(/^\n+/, '')
          }
          if (i < segments.length - 1) {
            text = text.replace(/\n+$/, '')
          }
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
          return text ? <Fragment key={i}>{text}</Fragment> : null
        }
        if (segment.inline && segment.text !== undefined) {
          // Rendered as the assistant's code is, in the language the paste
          // reads as, so a config reads as that config rather than as type.
          return (
            // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
            <span key={i} className={cx('chat-paste-code block', blockSpacing(i))}>
              <Markdown>{fencePaste(segment.text)}</Markdown>
            </span>
          )
        }
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
          <span key={i} className={cx('flex [&>*]:flex-1', blockSpacing(i))}>
            <PasteFileCard id={segment.id} lines={segment.lines} bytes={segment.bytes} />
          </span>
        )
      })}
    </>
  )
}
