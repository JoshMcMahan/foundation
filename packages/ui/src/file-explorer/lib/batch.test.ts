import { chunk, mapWithConcurrency, paginate } from './batch'

type TestPage = { keys: string[]; cursor?: string }

async function collectPages(pages: AsyncGenerator<TestPage>): Promise<TestPage[]> {
  const collected: TestPage[] = []
  for await (const page of pages) {
    collected.push(page)
  }
  return collected
}

describe('paginate', () => {
  it('requests one page when no cursor comes back', async () => {
    const fetchPage = vi.fn(async (_cursor?: string): Promise<TestPage> => ({ keys: ['a'] }))

    const pages = await collectPages(paginate(fetchPage, (page) => page.cursor))

    expect(pages).toEqual([{ keys: ['a'] }])
    expect(fetchPage).toHaveBeenCalledTimes(1)
    expect(fetchPage).toHaveBeenCalledWith(undefined)
  })

  it('passes each cursor to the following request', async () => {
    const fetchPage = vi
      .fn(async (_cursor?: string): Promise<TestPage> => ({ keys: [] }))
      .mockResolvedValueOnce({ keys: ['a'], cursor: 't1' })
      .mockResolvedValueOnce({ keys: ['b'] })

    const pages = await collectPages(paginate(fetchPage, (page) => page.cursor))

    expect(pages.flatMap((page) => page.keys)).toEqual(['a', 'b'])
    expect(fetchPage).toHaveBeenCalledTimes(2)
    expect(fetchPage).toHaveBeenNthCalledWith(2, 't1')
  })

  it('follows a cursor on a page that returned nothing', async () => {
    const fetchPage = vi
      .fn(async (_cursor?: string): Promise<TestPage> => ({ keys: [] }))
      .mockResolvedValueOnce({ keys: [], cursor: 't1' })
      .mockResolvedValueOnce({ keys: ['a'] })

    const pages = await collectPages(paginate(fetchPage, (page) => page.cursor))

    expect(pages).toHaveLength(2)
    expect(pages.flatMap((page) => page.keys)).toEqual(['a'])
  })

  it('stops when a cursor repeats', async () => {
    const fetchPage = vi.fn(
      async (_cursor?: string): Promise<TestPage> => ({
        keys: ['a'],
        cursor: 'same',
      }),
    )

    const pages = await collectPages(paginate(fetchPage, (page) => page.cursor))

    expect(pages).toHaveLength(2)
    expect(fetchPage).toHaveBeenCalledTimes(2)
  })
})

describe('chunk', () => {
  it('splits into full chunks with a partial remainder', () => {
    const items = Array.from({ length: 2500 }, (_, i) => i)

    expect(chunk(items, 1000).map((part) => part.length)).toEqual([1000, 1000, 500])
  })

  it('keeps an exact multiple in whole chunks', () => {
    const items = Array.from({ length: 1000 }, (_, i) => i)

    expect(chunk(items, 1000).map((part) => part.length)).toEqual([1000])
  })

  it('splits one item past the limit into its own chunk', () => {
    const items = Array.from({ length: 1001 }, (_, i) => i)

    expect(chunk(items, 1000).map((part) => part.length)).toEqual([1000, 1])
  })

  it('returns nothing for an empty list', () => {
    expect(chunk([], 1000)).toEqual([])
  })

  it('returns a single chunk when the size exceeds the list', () => {
    expect(chunk(['a', 'b'], 1000)).toEqual([['a', 'b']])
  })
})

describe('mapWithConcurrency', () => {
  it('never runs more workers than the limit', async () => {
    const items = Array.from({ length: 20 }, (_, i) => i)
    let inFlight = 0
    let peak = 0

    await mapWithConcurrency(items, 5, async (item) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await Promise.resolve()
      inFlight--
      return item
    })

    expect(peak).toBe(5)
  })

  it('returns results in input order with each rejection at its own index', async () => {
    const results = await mapWithConcurrency([1, 2, 3], 2, async (item) => {
      if (item === 2) {
        throw new Error('boom')
      }
      return item * 10
    })

    expect(results).toEqual([
      { status: 'fulfilled', value: 10 },
      { status: 'rejected', reason: new Error('boom') },
      { status: 'fulfilled', value: 30 },
    ])
  })

  it('completes every item when the limit exceeds the list', async () => {
    const results = await mapWithConcurrency([1, 2], 50, async (item) => item)

    expect(results).toEqual([
      { status: 'fulfilled', value: 1 },
      { status: 'fulfilled', value: 2 },
    ])
  })

  it('returns nothing for an empty list', async () => {
    expect(await mapWithConcurrency([], 5, async () => 1)).toEqual([])
  })
})
