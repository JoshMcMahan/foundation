import { useMemo } from 'react'
import { useFormContext, useWatch } from 'react-hook-form'

/** Options for a field whose list is keyed by another field's value: the list follows whatever is
 * chosen there. A plain list is its own options; a keyed one offers nothing until that field is set. */
export function dependentOptions<T>(
  options: readonly T[] | Record<string, T[]>,
  parentValue: unknown,
): readonly T[] {
  if (Array.isArray(options)) {
    return options
  }
  if (parentValue === undefined || parentValue === null) {
    return []
  }
  return (options as Record<string, T[]>)[String(parentValue)] ?? []
}

/** The value of the field at `path`, rendering again only when it changes; undefined without a path. */
export function useFieldAt(path: string | undefined): unknown {
  const { control } = useFormContext()
  return useWatch({ control, name: path ?? '', disabled: !path })
}

/** A field's options and the value of the field its `depends_on` names, which keys them. */
export function useDependentOptions<T>(
  options: readonly T[] | Record<string, T[]>,
  dependsOn: string | undefined,
): { options: readonly T[]; parentValue: unknown } {
  const parentValue = useFieldAt(dependsOn)
  return useMemo(
    () => ({ options: dependentOptions(options, parentValue), parentValue }),
    [options, parentValue],
  )
}
