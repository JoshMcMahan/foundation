import { useEffect, useRef, useState } from 'react'
import { Loader } from '../../../components/Loader'
import { useElapsed } from '../../../components/relativeTime'
import { cx } from '../../../cx'
import { formatCount, formatDuration } from '../../../format'
import { StopIcon } from '../../../icons'
import { useChatConfig } from '../../core/config'

/** The agent status words: one is picked per turn and held until it ends. */
export const activityWords = [
  'Thinking',
  'Cogitating',
  'Pondering',
  'Percolating',
  'Ruminating',
  'Noodling',
  'Conjuring',
  'Simmering',
  'Marinating',
  'Tinkering',
  'Scheming',
  'Brewing',
  'Wrangling',
  'Finagling',
  'Spelunking',
  'Puttering',
  'Composing',
  'Synthesizing',
  'Deliberating',
  'Mulling',
  'Contemplating',
  'Vibing',
  'Whittling',
  'Concocting',
  'Formulating',
  'Hatching',
  'Herding',
  'Ideating',
  'Manifesting',
  'Moseying',
  'Musing',
  'Percussing',
  'Reticulating',
  'Schlepping',
  'Stewing',
  'Transmuting',
  'Wibbling',
  'Crunching',
  'Forging',
  'Cooking',
] as const

function randomActivityWord(): string {
  return activityWords[Math.floor(Math.random() * activityWords.length)] ?? activityWords[0]
}

/** A status word held for the whole turn and re-rolled when a new one starts. */
function useTurnWord(startedAt: string | null | undefined): string {
  const [word, setWord] = useState(randomActivityWord)
  const turn = useRef(startedAt)
  useEffect(() => {
    if (turn.current !== startedAt) {
      turn.current = startedAt
      setWord(randomActivityWord())
    }
  }, [startedAt])
  return word
}

/** The terminal's "it's working" line for a running turn: spinner, status
 *  word, how long the turn has run, its token counts so far, and a way to
 *  stop it. */
export default function ActivityLine({
  startedAt,
  inputTokens,
  outputTokens,
  onStop,
  stopping = false,
  word,
  testId,
}: {
  startedAt: string | null | undefined
  inputTokens?: number | undefined
  outputTokens?: number | undefined
  onStop?: (() => void) | undefined
  stopping?: boolean
  /** Replaces the turn's word, the way a running hook names itself. */
  word?: string | undefined
  testId?: string
}) {
  const { strings } = useChatConfig()
  const elapsed = useElapsed(startedAt)
  const turnWord = useTurnWord(startedAt)
  const meta: string[] = []
  if (elapsed !== null) {
    meta.push(formatDuration(elapsed))
  }
  if (inputTokens || outputTokens) {
    meta.push(
      strings.activity.tokens(formatCount(inputTokens ?? 0), formatCount(outputTokens ?? 0)),
    )
  }
  return (
    <div data-testid={testId} className="flex min-h-8 items-center gap-2 px-1 text-sm">
      <Loader inline decorative size={14} color="var(--theme-element)" />
      <span
        data-testid={testId ? `${testId}-word` : undefined}
        className="min-w-0 truncate text-(--theme-element)"
      >
        {word ?? turnWord}…
      </span>
      {meta.length > 0 && (
        <span
          data-testid={testId ? `${testId}-meta` : undefined}
          className="shrink-0 text-xs tabular-nums theme-muted-text"
        >
          ({meta.join(' · ')})
        </span>
      )}
      {onStop && (
        <button
          type="button"
          onClick={onStop}
          disabled={stopping}
          aria-label={strings.input.stopGenerating}
          title={strings.input.stopGenerating}
          className={cx(
            'ml-auto inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs theme-muted-text transition-colors',
            'hover:theme-hover hover:theme-text disabled:cursor-not-allowed disabled:opacity-50',
          )}
        >
          <StopIcon className="h-3 w-3" />
          {strings.activity.stop}
        </button>
      )}
    </div>
  )
}
