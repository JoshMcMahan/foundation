export type Json = Record<string, unknown>

/** `value` when it's a plain object, else an empty one, so its keys read without checks. */
export function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}
