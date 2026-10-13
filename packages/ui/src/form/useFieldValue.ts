import { useCallback } from 'react'
import { useController, useFormContext } from 'react-hook-form'

/**
 * A field's value in the form, and how the person changes it. The field renders again when its own
 * value changes, not when another field's does. A change marks the field touched as well as dirty: the
 * form stops writing a computed default into a field once the person has set it, and a pick from a list
 * sets a value without the blur that would otherwise mark it.
 */
export function useFieldValue<T>(name: string): [T, (value: T) => void] {
  const { field } = useController({ name })
  const { setValue } = useFormContext()
  const change = useCallback(
    (value: T) => setValue(name, value, { shouldDirty: true, shouldTouch: true }),
    [name, setValue],
  )
  return [field.value as T, change]
}
