import {
  advanceListing,
  beginLoadingMore,
  canAutoLoadMore,
  clearListingError,
  clearListingsUnder,
  hasMore,
  incompletePaths,
  isListed,
  isLoadingMore,
  loadMoreError,
  MAX_AUTO_PAGES,
  MAX_HYDRATION_PAGES,
  nextHydrationStep,
  recordListingError,
  replaceListing,
  type TDirectoryListing,
  type TListings,
} from './paging'
import type { TStorageObject } from './types'

const listings = (entries: Record<string, Partial<TDirectoryListing>>): TListings =>
  new Map(
    Object.entries(entries).map(([path, listing]) => [
      path,
      { pagesLoaded: 1, loadingMore: false, entries: [], ...listing },
    ]),
  )

const obj = (path: string): TStorageObject => ({ path, type: 'file' })
const folder = (path: string): TStorageObject => ({
  path,
  type: 'directory',
})

describe('isListed', () => {
  it('separates a listed-but-empty directory from one never asked about', () => {
    const map = listings({ 'b/empty/': { pagesLoaded: 1 } })

    expect(isListed(map, 'b/empty/')).toBe(true)
    expect(isListed(map, 'b/unknown/')).toBe(false)
  })

  it('treats a directory recorded with zero pages as unlisted', () => {
    expect(isListed(listings({ 'b/x/': { pagesLoaded: 0 } }), 'b/x/')).toBe(false)
  })
})

describe('hasMore and canAutoLoadMore', () => {
  it('both hold for a directory with a cursor and nothing in flight', () => {
    const map = listings({ 'b/x/': { cursor: 't1' } })

    expect(hasMore(map, 'b/x/')).toBe(true)
    expect(canAutoLoadMore(map, 'b/x/')).toBe(true)
  })

  it('keeps hasMore true while a page is in flight so the sentinel stays put', () => {
    const map = listings({ 'b/x/': { cursor: 't1', loadingMore: true } })

    expect(hasMore(map, 'b/x/')).toBe(true)
    expect(canAutoLoadMore(map, 'b/x/')).toBe(false)
    expect(isLoadingMore(map, 'b/x/')).toBe(true)
  })

  it('neither holds for a complete directory', () => {
    const map = listings({ 'b/x/': {} })

    expect(hasMore(map, 'b/x/')).toBe(false)
    expect(canAutoLoadMore(map, 'b/x/')).toBe(false)
  })
})

describe('beginLoadingMore', () => {
  it('leaves the map untouched for a directory it has never seen', () => {
    const map = listings({})

    expect(beginLoadingMore(map, 'b/x/')).toBe(map)
  })

  it('drops a previous failure so a retry does not render as still failed', () => {
    const map = listings({
      'b/x/': { cursor: 't1', error: 'Access denied', entries: [obj('b/x/a')] },
    })

    expect(beginLoadingMore(map, 'b/x/').get('b/x/')).toEqual({
      cursor: 't1',
      pagesLoaded: 1,
      loadingMore: true,
      entries: [obj('b/x/a')],
    })
  })
})

describe('advanceListing', () => {
  it('records the first page of a directory it has not seen', () => {
    const next = advanceListing(listings({}), 'b/x/', {
      cursor: 't1',
      entries: [obj('b/x/a')],
    })

    expect(next.get('b/x/')).toEqual({
      cursor: 't1',
      pagesLoaded: 1,
      loadingMore: false,
      entries: [obj('b/x/a')],
    })
  })

  it('appends a page behind the entries already there so rows keep their positions', () => {
    const pageOne = [obj('b/x/a')]
    const map = listings({
      'b/x/': { cursor: 't1', loadingMore: true, entries: pageOne },
    })
    const next = advanceListing(map, 'b/x/', { entries: [obj('b/x/b')] })

    expect(next.get('b/x/')).toEqual({
      pagesLoaded: 2,
      loadingMore: false,
      entries: [obj('b/x/a'), obj('b/x/b')],
    })
  })
})

describe('replaceListing', () => {
  it('starts the directory over from the new first page', () => {
    const map = listings({
      'b/x/': {
        cursor: 't3',
        pagesLoaded: 3,
        loadingMore: true,
        error: 'boom',
        entries: [obj('b/x/old')],
      },
    })
    const next = replaceListing(map, 'b/x/', {
      cursor: 't1',
      entries: [obj('b/x/new')],
    })

    expect(next.get('b/x/')).toEqual({
      cursor: 't1',
      pagesLoaded: 1,
      loadingMore: false,
      entries: [obj('b/x/new')],
    })
  })

  // A refresh lists a folder and its expanded subfolders together, so a parent
  // landing after a child must not throw the child's page away.
  it('drops the records under subfolders the page no longer names and keeps the rest', () => {
    const map = listings({
      'b/x/': {},
      'b/x/keep/': {},
      'b/x/keep/deeper/': {},
      'b/x/gone/': {},
      'b/x/gone/deeper/': {},
      'b/x-other/': {},
    })
    const next = replaceListing(map, 'b/x/', {
      entries: [folder('b/x/keep/'), obj('b/x/gone')],
    })

    expect([...next.keys()].sort()).toEqual(['b/x-other/', 'b/x/', 'b/x/keep/', 'b/x/keep/deeper/'])
  })
})

describe('clearListingError', () => {
  it('keeps the cursor and the pages already pulled so a retry resumes paging', () => {
    const entries = [obj('b/x/a')]
    const map = listings({
      'b/x/': { cursor: 't1', pagesLoaded: 3, error: 'boom', entries },
    })
    const next = clearListingError(map, 'b/x/')

    expect(next.get('b/x/')).toEqual({
      cursor: 't1',
      pagesLoaded: 3,
      loadingMore: false,
      entries,
    })
    expect(loadMoreError(next, 'b/x/')).toBeUndefined()
  })
})

describe('recordListingError', () => {
  it('releases the flag and keeps the reason, so paging stops until a retry', () => {
    const entries = [obj('b/x/a')]
    const map = listings({
      'b/x/': { cursor: 't1', loadingMore: true, entries },
    })
    const next = recordListingError(map, 'b/x/', 'Access denied')

    expect(next.get('b/x/')).toEqual({
      cursor: 't1',
      pagesLoaded: 1,
      loadingMore: false,
      error: 'Access denied',
      entries: [obj('b/x/a')],
    })
    expect(canAutoLoadMore(next, 'b/x/')).toBe(false)
    expect(hasMore(next, 'b/x/')).toBe(true)
    expect(loadMoreError(next, 'b/x/')).toBe('Access denied')
  })

  // The hydration walk only re-runs when `listings` changes, so a failed first page
  // has to land in the map. Otherwise a deep link waits on a page never coming.
  it('records a first-page failure as a new entry that is still unlisted', () => {
    const before = listings({})
    const next = recordListingError(before, 'b/x/', 'boom')

    expect(next).not.toBe(before)
    expect(next.get('b/x/')).toEqual({
      pagesLoaded: 0,
      loadingMore: false,
      error: 'boom',
      entries: [],
    })
    expect(isListed(next, 'b/x/')).toBe(false)
    expect(hasMore(next, 'b/x/')).toBe(false)
    expect([...incompletePaths(next)]).toEqual([])
  })
})

describe('canAutoLoadMore', () => {
  it('stops at the cap so the user asks for each further page', () => {
    const map = listings({
      'b/x/': { cursor: 't1', pagesLoaded: MAX_AUTO_PAGES },
    })

    expect(canAutoLoadMore(map, 'b/x/')).toBe(false)
    expect(hasMore(map, 'b/x/')).toBe(true)
  })
})

describe('clearListingsUnder', () => {
  it('leaves a sibling that merely shares a name prefix', () => {
    const next = clearListingsUnder(listings({ 'b/logs/': {}, 'b/logs-archive/': {} }), 'b/logs/')

    expect([...next.keys()]).toEqual(['b/logs-archive/'])
  })

  it('slash-terminates a path given without one', () => {
    const next = clearListingsUnder(
      listings({ 'b/logs': {}, 'b/logs/2026/': {}, 'b/logs-archive/': {} }),
      'b/logs',
    )

    expect([...next.keys()]).toEqual(['b/logs-archive/'])
  })
})

describe('incompletePaths', () => {
  it('collects only the directories that still have a cursor', () => {
    const paths = incompletePaths(
      listings({
        'b/paging/': { cursor: 't1' },
        'b/done/': {},
        'b/also-paging/': { cursor: 't2', loadingMore: true },
      }),
    )

    expect([...paths].sort()).toEqual(['b/also-paging/', 'b/paging/'])
  })
})

describe('nextHydrationStep', () => {
  // 'user/' is above the storage root, so it is never a listable node.
  const chain = ['user/', 'user/b/', 'user/b/logs/']
  const step = (over: {
    targetResolved?: boolean
    known?: string[]
    listings?: TListings
    inFlight?: Set<string>
    pagesPulled?: number
  }) => {
    const known = new Set(over.known ?? ['user/b/', 'user/b/logs/'])
    return nextHydrationStep({
      targetResolved: over.targetResolved ?? false,
      ancestors: chain,
      isListableDir: (path) => known.has(path),
      listings: over.listings ?? listings({}),
      inFlight: over.inFlight ?? new Set(),
      pagesPulled: over.pagesPulled ?? 0,
    })
  }

  // 'user/' leads the chain and is not a node, so this also pins that the walk
  // steps over paths above the storage root rather than stopping there.
  it('lists the shallowest directory that has never been listed', () => {
    expect(step({})).toEqual({ kind: 'fetch', path: 'user/b/' })
  })

  // Checked before the failed-record rule, so an ancestor being listed again
  // after a failure is not read as tried-and-idle.
  it('waits while a listing is already in flight', () => {
    expect(
      step({
        known: ['user/b/'],
        listings: listings({ 'user/b/': { pagesLoaded: 0, error: 'boom' } }),
        inFlight: new Set(['user/b/']),
      }),
    ).toEqual({ kind: 'done' })
  })

  it('does not re-list a directory whose first page failed', () => {
    expect(
      step({
        listings: listings({ 'user/b/': { pagesLoaded: 0, error: 'boom' } }),
      }),
    ).toEqual({ kind: 'fetch', path: 'user/b/logs/' })
  })

  // Once the attempt has finished and left nothing behind, giving up is right.
  it('gives up when the only ancestor failed and is no longer in flight', () => {
    expect(
      step({
        known: ['user/b/'],
        listings: listings({ 'user/b/': { pagesLoaded: 0, error: 'boom' } }),
      }),
    ).toEqual({ kind: 'stuck', path: 'user/b/' })
  })

  it('moves down to the next unlisted directory once one is listed', () => {
    expect(step({ listings: listings({ 'user/b/': {} }) })).toEqual({
      kind: 'fetch',
      path: 'user/b/logs/',
    })
  })

  it('stops once the target is in the tree', () => {
    expect(
      step({
        targetResolved: true,
        listings: listings({ 'user/b/': {}, 'user/b/logs/': {} }),
      }),
    ).toEqual({ kind: 'done' })
  })

  it('pulls another page when the target sits past the pages loaded so far', () => {
    expect(
      step({
        known: ['user/b/'],
        listings: listings({ 'user/b/': { cursor: 't1' } }),
      }),
    ).toEqual({ kind: 'more', path: 'user/b/' })
  })

  // The walk re-runs on the same `listings` change the failure produced, and a retry
  // clears the error, so without this a failing directory is hammered to the bound.
  it('gives up on a page that failed rather than retrying it', () => {
    expect(
      step({
        known: ['user/b/'],
        listings: listings({
          'user/b/': { cursor: 't1', error: 'Access denied' },
        }),
      }),
    ).toEqual({ kind: 'stuck', path: 'user/b/' })
  })

  it('pulls from the deepest listed directory, not the root', () => {
    expect(
      step({
        listings: listings({
          'user/b/': {},
          'user/b/logs/': { cursor: 't1' },
        }),
      }),
    ).toEqual({ kind: 'more', path: 'user/b/logs/' })
  })

  it('reports stuck once the deepest directory is fully listed', () => {
    expect(
      step({
        listings: listings({ 'user/b/': {}, 'user/b/logs/': {} }),
      }),
    ).toEqual({ kind: 'stuck', path: 'user/b/logs/' })
  })

  it('waits rather than stacking page requests', () => {
    expect(
      step({
        known: ['user/b/'],
        listings: listings({
          'user/b/': { cursor: 't1', loadingMore: true },
        }),
      }),
    ).toEqual({ kind: 'done' })
  })

  it('gives up at the page bound instead of draining the directory', () => {
    expect(
      step({
        known: ['user/b/'],
        listings: listings({ 'user/b/': { cursor: 't1' } }),
        pagesPulled: MAX_HYDRATION_PAGES,
      }),
    ).toEqual({ kind: 'stuck', path: 'user/b/' })
  })

  it('does nothing when no ancestor is a listable node', () => {
    expect(step({ known: [] })).toEqual({ kind: 'done' })
  })
})
