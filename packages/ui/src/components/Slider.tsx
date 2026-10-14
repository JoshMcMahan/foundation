import { Slider as BaseSlider } from '@base-ui/react/slider'
import { cx } from '../cx'

export interface SliderProps {
  value: number
  onValueChange: (value: number) => void
  min: number
  max: number
  step?: number | undefined
  disabled?: boolean | undefined
  /** How the value reads to assistive technology, as Intl formats numbers. */
  format?: Intl.NumberFormatOptions | undefined
  /** The thumb's name; a slider beside a field's own box shares the field's label. */
  'aria-label'?: string | undefined
  className?: string | undefined
}

/** A number picked by dragging along a range, or with the arrow keys. Pair it with a
 *  NumberInput when the exact value matters. */
export function Slider({
  value,
  onValueChange,
  min,
  max,
  step = 1,
  disabled = false,
  format,
  'aria-label': ariaLabel,
  className,
}: SliderProps) {
  return (
    <BaseSlider.Root
      value={value}
      onValueChange={(next) => onValueChange(Array.isArray(next) ? (next[0] ?? min) : next)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      format={format}
      className={cx('w-full', className)}
    >
      <BaseSlider.Control className="flex w-full touch-none select-none items-center py-2 data-disabled:cursor-not-allowed data-disabled:opacity-50">
        <BaseSlider.Track className="h-1 w-full rounded-full bg-(--theme-border)">
          <BaseSlider.Indicator className="rounded-full bg-(--theme-accent)" />
          <BaseSlider.Thumb
            aria-label={ariaLabel}
            // The thumb holds the range input, so focus shows on it when the input has it.
            className="size-4 rounded-full border-2 border-(--theme-accent) bg-(--theme-panel-bg) shadow-sm has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-(--theme-focus)"
          />
        </BaseSlider.Track>
      </BaseSlider.Control>
    </BaseSlider.Root>
  )
}
