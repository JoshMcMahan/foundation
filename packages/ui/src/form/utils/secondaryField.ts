type SecondaryOption = {
  value?: unknown
  secondaryValue?: unknown
  options?: unknown[]
}

export function findSecondaryOption(
  options: unknown[],
  value: unknown,
): SecondaryOption | undefined {
  for (const candidate of options) {
    if (!candidate || typeof candidate !== 'object') {
      continue
    }
    const option = candidate as SecondaryOption
    if (option.value === value) {
      return option
    }
    if (Array.isArray(option.options)) {
      const nestedOption = findSecondaryOption(option.options, value)
      if (nestedOption) {
        return nestedOption
      }
    }
  }
  return undefined
}

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
