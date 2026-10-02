/** `placeholder=""` (empty string) intentionally overrides the default; undefined does not. */
export function getPlaceholder<T = string>(
  placeholder: string | undefined,
  defaultValue: T | undefined,
): string {
  // If placeholder is explicitly defined (even as empty string), use it
  if (placeholder !== undefined) {
    return placeholder
  }

  // Otherwise fall back to default value
  if (defaultValue && (typeof defaultValue === 'string' || typeof defaultValue === 'number')) {
    return defaultValue.toString()
  }

  return ''
}
