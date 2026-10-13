export function applySecondaryField(
  secondaryField: string | string[] | undefined,
  secondaryValue: unknown,
  setFieldValue: (field: string, value: unknown) => void,
) {
  if (secondaryField === undefined || secondaryValue === undefined) {
    return
  }
  const fields = Array.isArray(secondaryField) ? secondaryField : [secondaryField]
  const values = Array.isArray(secondaryValue) ? secondaryValue : [secondaryValue]
  fields.forEach((field, index) => {
    setFieldValue(field, values[index])
  })
}
