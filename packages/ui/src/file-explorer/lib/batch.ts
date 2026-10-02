export async function* paginate<TPage>(
  fetchPage: (cursor?: string) => Promise<TPage>,
  nextCursor: (page: TPage) => string | undefined,
): AsyncGenerator<TPage> {
  const seen = new Set<string>()
  let cursor: string | undefined

  while (true) {
    const page = await fetchPage(cursor)
    yield page

    cursor = nextCursor(page)
    // A server that echoes a cursor would loop forever in the user's tab.
    if (!cursor || seen.has(cursor)) {
      return
    }
    seen.add(cursor)
  }
}

export function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size))
  }
  return chunks
}

export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  // Workers share one iterator, so each pulls a distinct item without a counter.
  const queue = items.entries()

  const run = async () => {
    for (const [index, item] of queue) {
      try {
        results[index] = {
          status: 'fulfilled',
          value: await worker(item),
        }
      } catch (reason) {
        results[index] = { status: 'rejected', reason }
      }
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => run())
  await Promise.all(workers)
  return results
}
