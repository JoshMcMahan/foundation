function isPlain(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * `next`, reusing every part of `prev` it equals, so whatever didn't change keeps its identity: a
 * schema parsed again because one input changed hands each field that input left alone back as it
 * was, and a field that renders from it can skip the render.
 */
export function shareEqual<T>(prev: unknown, next: T): T {
  if (Object.is(prev, next)) {
    return prev as T
  }
  if (Array.isArray(prev) && Array.isArray(next)) {
    let same = prev.length === next.length
    const shared = next.map((item, i) => {
      const kept = shareEqual(prev[i], item)
      same &&= kept === prev[i]
      return kept
    })
    return (same ? prev : shared) as T
  }
  if (isPlain(prev) && isPlain(next)) {
    // Key order is part of a schema: it orders the fields.
    const keys = Object.keys(next)
    const before = Object.keys(prev)
    let same = keys.length === before.length
    const shared: Record<string, unknown> = {}
    keys.forEach((key, i) => {
      const kept = shareEqual(prev[key], next[key])
      same &&= before[i] === key && kept === prev[key]
      shared[key] = kept
    })
    return (same ? prev : shared) as T
  }
  return next
}
