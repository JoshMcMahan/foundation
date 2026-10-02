/** Pairs each item with a React key from its content, suffixing repeats so keys stay unique. */
export function keyedByContent<T>(
  items: readonly T[],
  toKey: (item: T) => string,
): { key: string; item: T }[] {
  const seen = new Map<string, number>()
  return items.map((item) => {
    const base = toKey(item)
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return { key: count === 1 ? base : `${base}#${count}`, item }
  })
}

/** Keys for a list whose position is its identity, such as placeholder rows or a fixed grid. */
export function positionKeys(count: number, prefix = 'position'): string[] {
  return Array.from({ length: count }, (_, position) => `${prefix}-${position}`)
}

/** Pairs each item of a list that never reorders with a key from its position. */
export function withPositionKeys<T>(
  items: readonly T[],
  prefix = 'position',
): { key: string; item: T }[] {
  return items.map((item, position) => ({ key: `${prefix}-${position}`, item }))
}
