import { use, useCallback } from 'react'
import { useController, useFormContext } from 'react-hook-form'
import { filled, RequiredFieldContext } from './validation'

/**
 * A field's value in the form, and how the person changes it. The field renders again when its own
 * value changes, not when another field's does. A change marks the field touched as well as dirty: the
 * form stops writing a computed default into a field once the person has set it, and a pick from a list
 * sets a value without the blur that would otherwise mark it.
 *
 * It also gives the form the field's rules, such as needing a value, so a field component binds its
 * value here rather than with its own `useController`.
 */
export function useFieldValue<T>(name: string): [T, (value: T) => void] {
  const required = use(RequiredFieldContext)
  const message = required?.name === name ? required.message : undefined
  const { field } = useController({
    name,
    rules:
      message === undefined
        ? {}
        : { validate: { required: (value: unknown) => filled(value) || message } },
  })
  const { setValue, getFieldState, trigger } = useFormContext()
  const change = useCallback(
    (value: T) => {
      setValue(name, value, { shouldDirty: true, shouldTouch: true })
      // A field showing an error checks again with each change, so the error goes once it is answered.
      if (getFieldState(name).invalid) {
        void trigger(name)
      }
    },
    [name, setValue, getFieldState, trigger],
  )
  return [field.value as T, change]
}
