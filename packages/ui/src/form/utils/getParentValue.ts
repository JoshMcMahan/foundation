import { checkShowIfObject } from './checkShowIfObject'
import { getValueUsingPath } from './getValueUsingPath'

export function getParentValue(
  index: number | undefined,

  targetField: unknown,
  values: object,
  dependentPath: string,

  field: { depends_on?: string | undefined },
) {
  let parentValue: unknown
  if (typeof targetField === 'object' && targetField !== null && !Array.isArray(targetField)) {
    const valueList = checkShowIfObject(targetField, values, index)
    //if all values are true, set parentValue to true, else false
    parentValue = !valueList.includes(false)
  } else if (field.depends_on) {
    dependentPath = field.depends_on
    // if index is present, replace [index] with the actual index
    if (index !== undefined) {
      dependentPath = field.depends_on.replace('[index]', `[${index}]`)
    }
    const dependsOnValue = getValueUsingPath(values, dependentPath)
    const dependsOnText =
      dependsOnValue === null || dependsOnValue === undefined ? undefined : String(dependsOnValue)
    if (Array.isArray(targetField)) {
      parentValue = targetField.includes(dependsOnValue) || targetField.includes(dependsOnText)
    } else if (typeof targetField === 'string') {
      parentValue = dependsOnText !== undefined && targetField.includes(dependsOnText)
    } else {
      parentValue = targetField === dependsOnValue
    }
  } else {
    //single show_if without depends_on
    dependentPath = typeof targetField === 'string' ? targetField : ''
    if (index !== undefined && typeof targetField === 'string') {
      dependentPath = targetField.replace('[index]', `[${index}]`)
    }
    parentValue = getValueUsingPath(values, dependentPath)
  }
  return parentValue
}
