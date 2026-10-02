import { getValueUsingPath } from './getValueUsingPath'

export function checkShowIfObject(showIfObject: object, formValues: object, index?: number) {
  const valueList: boolean[] = []
  //go through each key and check if each value is true

  for (let [key, value] of Object.entries(showIfObject)) {
    //check selected value
    if (index !== undefined) {
      key = key.replace('[index]', `[${index}]`)
    }
    const dependsOnValue = getValueUsingPath(formValues, key)
    if (typeof value === 'boolean' || typeof value === 'string' || typeof value === 'number') {
      valueList.push(
        dependsOnValue !== null &&
          dependsOnValue !== undefined &&
          dependsOnValue.toString() === value.toString(),
      )
    } else if (Array.isArray(value)) {
      valueList.push(value.includes(dependsOnValue))
    }
  }
  return valueList
}
