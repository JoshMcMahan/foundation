import cx from 'classnames'
import { Fragment } from 'react'
import { FileIcon, RunningIcon, XIcon } from '../../icons'
import { useChatConfig } from '../core/config'
import { splitPastes } from '../core/pastes'
import type { MessagePaste } from '../types'
import { formatFileSize } from '../utils'

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
  const detail = error ?? (saving ? t.saving : `${t.lines(lines)} · ${formatFileSize(bytes)}`)
  return (
    <div
      data-testid="paste-file-card"
      className={cx(
        'inline-flex max-w-full items-center gap-2.5 rounded-xl border px-3 py-2 align-top whitespace-normal',
        'bg-(--theme-muted-panel-bg)',
        error ? 'border-red-500' : 'theme-border',
      )}
    >
      <FileIcon className="h-5 w-5 flex-shrink-0 theme-muted-text" />
      <div className="min-w-0 text-left leading-tight">
        <div className="truncate text-sm font-medium theme-text">
          {id ? `paste-${id}.txt` : t.title}
        </div>
        <div className={cx('truncate text-xs', error ? 'text-red-500' : 'theme-muted-text')}>
          {detail}
        </div>
      </div>
      {saving && (
        <RunningIcon className="h-3.5 w-3.5 flex-shrink-0 animate-spin theme-muted-text" />
      )}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={t.remove}
          title={t.remove}
          className="flex-shrink-0 rounded p-0.5 theme-muted-text hover:theme-text"
        >
          <XIcon className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

/** A user message as typed: an inline paste as its text, one sent as its file as a card. */
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
  return (
    <>
      {splitPastes(content, pastes).map((segment, i) => {
        if (typeof segment === 'string') {
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
          return <Fragment key={i}>{segment}</Fragment>
        }
        if (segment.inline && segment.text !== undefined) {
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
          return <Fragment key={i}>{segment.text}</Fragment>
        }
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
          <span key={i} className="my-1 block">
            <PasteFileCard id={segment.id} lines={segment.lines} bytes={segment.bytes} />
          </span>
        )
      })}
    </>
  )
}
