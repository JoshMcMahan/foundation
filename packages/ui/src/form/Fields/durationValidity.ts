// Invalid duration text never reaches Formik (the value stays last-valid), so
// save-time validation needs this registry to know a field holds invalid text.
const invalidPaths = new Set<string>()

export function setDurationValidity(path: string, valid: boolean): void {
  if (valid) {
    invalidPaths.delete(path)
  } else {
    invalidPaths.add(path)
  }
}

export function getInvalidDurationPaths(): string[] {
  return [...invalidPaths]
}
