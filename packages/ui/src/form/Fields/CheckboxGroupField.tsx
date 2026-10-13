import { clsx as cx } from 'clsx'
import { useState } from 'react'
import { FieldWrapper } from '../FieldWrapper'
import type { FieldComponentProps } from '../types/fieldComponentTypes'
import type { BaseField } from '../types/fieldTypes'
import { useFieldValue } from '../useFieldValue'
import { fieldOption } from './fieldOption'

export interface ICheckboxGroupField extends BaseField {
  type: 'checkbox-group'
  options?: Array<
    string | number | { label?: string; value: string | number; description?: string }
  >
  /**
   * Maps a value to the values it forces on. While the key is selected, each
   * listed value is checked and locked (disabled) to show the implication.
   * Deselecting the key clears the implied values unless the user had also
   * selected them independently.
   */
  implies?: Record<string, string[]>
}

function impliedFrom(values: string[], implies: Record<string, string[]> = {}): Set<string> {
  const result = new Set<string>()
  for (const value of values) {
    for (const target of implies[value] ?? []) {
      result.add(target)
    }
  }
  return result
}

function union(manual: string[], forced: Set<string>): string[] {
  return [...manual, ...[...forced].filter((v) => !manual.includes(v))]
}

export default function CheckboxGroupField({
  field,
  label,
  labelPosition,
  missing,
  disabled,
  onChange,
  tooltipComponent,
  spaceCompact,
}: FieldComponentProps<ICheckboxGroupField>) {
  // The form names every field before it renders one.
  const [value, change] = useFieldValue<Array<string | number> | undefined>(field.name ?? '')
  const implies = field.implies
  const rawOf = new Map(
    (field.options ?? []).map((choice) => {
      const option = fieldOption(choice)
      return [option.value, option.raw] as const
    }),
  )

  // Track only the user's direct picks; implied values are derived from these.
  // This lets us drop an implied value when its trigger is unchecked, while
  // keeping it if the user had also picked it directly.
  const [manual, setManual] = useState<string[]>(() => {
    const saved = (value || []).map(String)
    const impliedBySaved = impliedFrom(saved, implies)
    return saved.filter((v) => !impliedBySaved.has(v))
  })

  const forced = impliedFrom(manual, implies)

  const handleToggle = (value: string) => {
    if (disabled) {
      return
    }
    const nextManual = manual.includes(value)
      ? manual.filter((v) => v !== value)
      : [...manual, value]
    // Picks match as text; the value keeps each option's own type, so a numeric option stays a number.
    const next = union(nextManual, impliedFrom(nextManual, implies)).map((v) => rawOf.get(v) ?? v)
    setManual(nextManual)
    change(next)
    onChange?.(next)
  }

  return (
    <FieldWrapper
      optional={field.optional}
      label={label}
      tooltipComponent={tooltipComponent}
      labelPosition={labelPosition}
      spaceCompact={spaceCompact}
    >
      {({ labelId, describedBy }) => (
        <fieldset
          aria-labelledby={labelId}
          aria-describedby={describedBy}
          className="flex min-w-0 max-w-lg flex-col gap-1"
        >
          {field.options?.map((raw) => {
            const option = fieldOption(raw)
            const locked = forced.has(option.value)
            const optionDisabled = disabled || locked
            return (
              <label
                key={field.name + option.value}
                className={cx(
                  // Negative inset so the row's hover fill bleeds past the
                  // text while the checkbox stays flush with the field label.
                  '-mx-2 flex items-start gap-2.5 rounded-md px-2 py-1.5 transition-colors',
                  optionDisabled
                    ? 'cursor-not-allowed opacity-60'
                    : 'cursor-pointer hover:bg-(--theme-hover) has-[:focus-visible]:bg-(--theme-hover)',
                )}
              >
                <input
                  type="checkbox"
                  checked={manual.includes(option.value) || locked}
                  disabled={optionDisabled}
                  onChange={() => handleToggle(option.value)}
                  className={cx(
                    // min-h-0: the base input rule's 20px minimum would sit the box below the label's line.
                    'h-4 min-h-0 w-4 rounded accent-(--theme-link)',
                    optionDisabled ? 'cursor-not-allowed' : 'cursor-pointer',
                    missing && 'invalid',
                  )}
                />
                <div className="flex min-w-0 flex-col">
                  <span className="font-medium leading-tight theme-text">{option.label}</span>
                  {option.description && (
                    <span className="mt-0.5 text-xs leading-snug theme-muted-text">
                      {option.description}
                    </span>
                  )}
                </div>
              </label>
            )
          })}
        </fieldset>
      )}
    </FieldWrapper>
  )
}
