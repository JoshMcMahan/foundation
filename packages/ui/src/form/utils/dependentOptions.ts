import { getValueUsingPath } from './getValueUsingPath'

/** Options for a field whose list is keyed by another field's value: with
 * depends_on, the list follows whatever is currently chosen at that path. */
export function dependentOptions<T>(
  options: T[] | Record<string, T[]>,
  dependsOn: string | undefined,
  values: Record<string, unknown>,
): { options: T[]; parentValue: unknown } {
  if (Array.isArray(options)) {
    return { options, parentValue: undefined }
  }
  const parentValue = dependsOn ? getValueUsingPath(values, dependsOn) : undefined
  if (parentValue === undefined || parentValue === null) {
    return { options: [], parentValue }
  }
  return { options: options[String(parentValue)] ?? [], parentValue }
}
