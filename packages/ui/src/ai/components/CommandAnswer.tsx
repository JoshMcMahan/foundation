import { Disclosure } from '../../components/Disclosure'
import { withPathBreaks } from '../../components/pathBreaks'
import { cx } from '../../cx'
import type { CommandAnswer as Answer } from '../types'
import Markdown from '../ui/Markdown'
import { chatProseClasses } from '../ui/prose'

/** What a command the person ran answered, hung under their message as a
 *  terminal draws it rather than drawn as a reply. A document the command
 *  showed, such as a plan, sits under it in a box, so it reads as a
 *  document and not as something the agent said. */
export default function CommandAnswer({
  answer,
  alignEnd,
}: {
  answer: Answer
  /** Under a message drawn at the end of the row, as the reader's own are. */
  alignEnd: boolean
}) {
  const line = (
    <span className="flex min-w-0 gap-1.5 text-start">
      {/* biome-ignore lint/style/noJsxLiterals: a gutter glyph, not words */}
      <span aria-hidden="true">⎿</span>
      <span className="min-w-0 whitespace-pre-wrap wrap-break-word">
        {withPathBreaks(answer.text)}
      </span>
    </span>
  )
  return (
    <>
      <div
        className={cx('max-w-[80%] text-sm theme-muted-text', alignEnd && 'self-end')}
        data-testid="command-answer"
      >
        {answer.detail ? (
          <Disclosure
            summary={line}
            summaryClassName="hover:theme-text"
            panelClassName="ml-5 mt-1 text-sm"
          >
            <Markdown>{answer.detail}</Markdown>
          </Disclosure>
        ) : (
          line
        )}
      </div>
      {answer.document && (
        <div
          className={cx(
            chatProseClasses,
            'mt-2 w-full self-stretch rounded-lg border theme-border px-4 py-3 text-start',
          )}
          data-testid="command-document"
        >
          <Markdown>{answer.document}</Markdown>
        </div>
      )}
    </>
  )
}
