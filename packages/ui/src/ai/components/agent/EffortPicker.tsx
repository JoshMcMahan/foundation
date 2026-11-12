import { Slider as BaseSlider } from '@base-ui/react/slider'
import { type CSSProperties, useState } from 'react'
import { Popover } from '../../../components/Popover'
import { cx } from '../../../cx'
import { ChevronDownIcon } from '../../../icons'
import { EFFORT_LEVELS, type EffortLevel, isEffortLevel } from '../../agent/effort'
import { useChatConfig } from '../../core/config'
import { chipClassName } from '../../ui/chip'

type EffortStop = EffortLevel | ''

// The model's own default sits before the lowest level, so leaving it to the model is the first stop.
const STOPS: readonly EffortStop[] = ['', ...EFFORT_LEVELS]
const LAST = STOPS.length - 1

const percentAt = (index: number) => (index / LAST) * 100

// The groove reaches past the end stops by its own radius, so their dots sit inside its round ends;
// the fill stops under the thumb's center, measured along the stops rather than the groove.
const GROOVE_OVERHANG = '0.25rem'
const fillEnd = (index: number) =>
  index === 0
    ? '0px'
    : `calc(${GROOVE_OVERHANG} + (100% - 2 * ${GROOVE_OVERHANG}) * ${index / LAST})`

// The ring takes the scale's color under it. The model's default isn't a level, so it stays neutral.
function ringColor(index: number): string {
  if (index === 0) {
    return 'var(--theme-border-strong)'
  }
  const at = percentAt(index)
  return at <= 50
    ? `color-mix(in oklch, var(--effort-fast) ${100 - at * 2}%, var(--effort-mid))`
    : `color-mix(in oklch, var(--effort-mid) ${200 - at * 2}%, var(--effort-smart))`
}

const onlyValue = (value: number | readonly number[]) =>
  typeof value === 'number' ? value : (value[0] ?? 0)

// Steps from a key or a press on the track glide; a drag follows the pointer.
const glide =
  'transition-[inset-inline-start] duration-150 ease-out group-data-dragging:transition-none motion-reduce:transition-none'

/** How hard the model thinks, as a toolbar chip: it opens a slider from the
 *  model's own default through every level, faster to smarter. A level it
 *  doesn't know shows as it was given. */
export default function EffortPicker({
  effort,
  onPick,
  disabled = false,
  className,
}: {
  /** The level set; empty or unset leaves it to the model. */
  effort: string | null | undefined
  /** With the level picked, or an empty string for the model's default: once when a drag ends
   *  and once per key press, never while the slider is still moving. */
  onPick: (effort: EffortStop) => void
  disabled?: boolean | undefined
  /** The chip's classes, for a toolbar whose chips are drawn differently. */
  className?: string | undefined
}) {
  const t = useChatConfig().strings.effort
  const [moving, setMoving] = useState<number | null>(null)
  const set: EffortStop = isEffortLevel(effort) ? effort : ''
  const index = moving ?? STOPS.indexOf(set)
  const label = (stop: EffortStop) => (stop === '' ? t.default : t[stop])
  const shown = effort && !isEffortLevel(effort) ? effort : label(set)
  const heading = moving === null ? shown : label(STOPS[index] ?? '')

  return (
    <Popover
      aria-label={t.choose}
      side="top"
      className="w-72"
      onOpenChange={(open) => {
        if (!open) {
          setMoving(null)
        }
      }}
      trigger={
        <button type="button" className={className ?? chipClassName} disabled={disabled}>
          <span className="truncate">{shown}</span>
          <ChevronDownIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
        </button>
      }
    >
      <p className="text-center font-semibold">{heading}</p>
      <BaseSlider.Root
        value={index}
        min={0}
        max={LAST}
        step={1}
        disabled={disabled}
        onValueChange={(value) => setMoving(onlyValue(value))}
        onValueCommitted={(value) => {
          setMoving(null)
          onPick(STOPS[onlyValue(value)] ?? '')
        }}
        className="effort-scale group mt-2 w-full"
        style={{ '--effort-ring': ringColor(index) } as CSSProperties}
      >
        <BaseSlider.Control className="flex w-full cursor-pointer touch-none select-none items-center px-2.5 py-2 data-disabled:cursor-not-allowed data-disabled:opacity-50">
          <BaseSlider.Track className="relative h-2 w-full">
            <span
              aria-hidden="true"
              className="effort-scale-fill absolute inset-y-0 -inset-x-1 overflow-hidden rounded-full"
            >
              <span
                className={cx('absolute inset-y-0 end-0 bg-(--theme-border)', glide)}
                style={{ insetInlineStart: fillEnd(index) }}
              />
            </span>
            {STOPS.map((stop, at) => (
              <span
                key={stop || 'default'}
                aria-hidden="true"
                className={cx(
                  'absolute top-1/2 size-1 -translate-1/2 rounded-full',
                  at < index ? 'bg-(--theme-app-bg)/60' : 'bg-(--theme-border-strong)',
                )}
                style={{ insetInlineStart: `${percentAt(at)}%` }}
              />
            ))}
            <BaseSlider.Thumb
              aria-label={t.choose}
              getAriaValueText={(_, value) => label(STOPS[value] ?? '')}
              // The thumb holds the range input, so focus shows on it when the input has it.
              className={cx(
                'size-5 rounded-full border-2 border-(--effort-ring) bg-(--effort-thumb) shadow-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--theme-focus)',
                glide,
              )}
            />
          </BaseSlider.Track>
        </BaseSlider.Control>
      </BaseSlider.Root>
      <div className="mt-1 flex justify-between px-1 text-[11px] theme-muted-text">
        <span>{t.faster}</span>
        <span>{t.smarter}</span>
      </div>
    </Popover>
  )
}
