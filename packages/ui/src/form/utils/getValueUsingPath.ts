export function getValueUsingPath(obj: unknown, path: string): unknown {
  if (typeof path !== 'string' || !path) {
    return undefined
  }
  const keys = path.split('.')
  let current = obj

  for (const key of keys) {
    if (!current || typeof current !== 'object') {
      return undefined
    }
    const container = current as Record<string, unknown>

    if (key.includes('[')) {
      const [arrayKey = '', indexStr = ''] = key.split('[')
      const index = parseInt(indexStr.slice(0, -1), 10)
      const list = container[arrayKey]
      if (!Array.isArray(list) || Number.isNaN(index)) {
        return undefined
      }
      current = list[index]
    } else {
      if (!(key in container)) {
        return undefined
      }
      current = container[key]
    }
  }

  return current
}
