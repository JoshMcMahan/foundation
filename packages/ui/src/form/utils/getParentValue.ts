import { checkShowIfObject } from './checkShowIfObject'
import { getValueUsingPath } from './getValueUsingPath'

/** `index` replaces a path's `[index]` placeholder when the field sits in a list row. */
export function getParentValue(
  index: number | undefined,
  targetField: unknown,
  values: object,
  field: { depends_on?: string | undefined },
) {
  const atIndex = (path: string) =>
    index === undefined ? path : path.replace('[index]', `[${index}]`)

  if (typeof targetField === 'object' && targetField !== null && !Array.isArray(targetField)) {
    // Every condition in the object has to hold.
    return !checkShowIfObject(targetField, values, index).includes(false)
  }
  if (field.depends_on) {
    const dependsOnValue = getValueUsingPath(values, atIndex(field.depends_on))
    const dependsOnText =
      dependsOnValue === null || dependsOnValue === undefined ? undefined : String(dependsOnValue)
    if (Array.isArray(targetField)) {
      return targetField.includes(dependsOnValue) || targetField.includes(dependsOnText)
    }
    if (typeof targetField === 'string') {
      return dependsOnText !== undefined && targetField.includes(dependsOnText)
    }
    return targetField === dependsOnValue
  }
  // A bare show_if names the field it depends on.
  return getValueUsingPath(values, typeof targetField === 'string' ? atIndex(targetField) : '')
}
