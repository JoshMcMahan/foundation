import { dequal } from 'dequal'
import { useEffect, useEffectEvent, useRef } from 'react'
import { useFormContext } from 'react-hook-form'
import type { ComboboxItems } from '../components/Combobox'
import { useFieldValue } from './useFieldValue'
import { type ChoiceItem, itemValue, leaves } from './utils/fieldItems'
import { applySecondaryField } from './utils/secondaryField'

export type { ChoiceItem }

/**
 * A field that picks one of `items`: its value, and the choice the person makes, which also sets the
 * fields its `secondaryField` names from the item's `secondaryValue`.
 *
 * With `autoselect`, the first enabled item is picked whenever the items change; unset, an only item
 * is. A value the form already holds stays on the first pass. The items change when their values or
 * which are enabled do, so a field may rebuild them every render.
 */
export function useChoiceField({
  name,
  items,
  autoselect,
  secondaryField,
  onChange,
}: {
  name: string
  items: ComboboxItems<unknown>
  autoselect?: boolean | undefined
  secondaryField?: string | string[] | undefined
  onChange?: ((value: unknown) => void) | undefined
}): [unknown, (value: unknown) => void] {
  const [value, change] = useFieldValue<unknown>(name)
  const { setValue } = useFormContext()

  const choose = (next: unknown) => {
    const chosen = leaves(items).find(
      (item): item is ChoiceItem => typeof item === 'object' && dequal(item.value, next),
    )
    applySecondaryField(secondaryField, chosen?.secondaryValue, (field, secondary) =>
      setValue(field, secondary, { shouldDirty: true }),
    )
    onChange?.(next)
    change(next)
  }

  const first = useRef(true)
  const select = useEffectEvent(
    (items: ComboboxItems<unknown>, autoselect: boolean | undefined) => {
      const preset = first.current && value != null
      first.current = false
      if (preset || autoselect === false) {
        return
      }
      const all = leaves(items)
      if (all.length === 0 || (autoselect === undefined && all.length !== 1)) {
        return
      }
      if (!autoselect && all.some((item) => dequal(itemValue(item), value))) {
        return
      }
      const pick = all.find((item) => typeof item === 'string' || !item.disabled)
      if (pick !== undefined) {
        choose(itemValue(pick))
      }
    },
  )
  // Rebuilt items (fresh icons, a new array) are the same items unless a value or an enabled
  // state differs, so only that reruns autoselect and never overrides a choice.
  const shape = [
    autoselect,
    leaves(items).map((item) =>
      typeof item === 'string' ? item : [item.value, Boolean(item.disabled)],
    ),
  ]
  const lastShape = useRef<unknown>(undefined)
  useEffect(() => {
    if (dequal(lastShape.current, shape)) {
      return
    }
    lastShape.current = shape
    select(items, autoselect)
  })

  return [value, choose]
}
