import type { TStorageObject } from './types'
import { ensureTrailingSlash, getNodeName } from './utils'

/** Both providers already cap an unqualified list at 1,000, so stating it leaves
 *  single-page directories byte-identical. */
export const LIST_PAGE_SIZE = 1000

export type TListPageRequest = {
  cursor?: string
  /** Overridable so a test can page without seeding 2,000 objects. */
  pageSize?: number
}

/** Keyed by tree path. */
export type TDirectoryListing = {
  /** Present ⇒ more entries exist and the provider can resume from here. */
  cursor?: string | undefined
  /** 0 ⇒ never listed, which is what tells "empty" apart from "not asked yet". */
  pagesLoaded: number
  /** Not `loadingPaths`, which swaps the whole table for a skeleton and would blank
   *  the rows being read. */
  loadingMore: boolean
  /** The storage-level error surfaces only on an empty folder, so without this a
   *  failure mid-folder is invisible. */
  error?: string | undefined
  /** A new array per page, never mutated: the builder reuses work by identity. */
  entries: readonly TStorageObject[]
}

/** Uncapped, opening a 200k-object folder and scrolling would walk all of it. */
export const MAX_AUTO_PAGES = 5

export type TListings = ReadonlyMap<string, TDirectoryListing>

export function isListed(listings: TListings, path: string): boolean {
  return (listings.get(path)?.pagesLoaded ?? 0) > 0
}

/** True even while a request is in flight, so the sentinel stays put. */
export function hasMore(listings: TListings, path: string): boolean {
  return !!listings.get(path)?.cursor
}

/** A failed page needs an explicit retry, so it stops auto-loading here. */
function canLoadMore(listings: TListings, path: string): boolean {
  const listing = listings.get(path)
  return !!listing?.cursor && !listing.loadingMore && !listing.error
}

/** Auto-load stops at the cap; past it the user asks for each page. */
export function canAutoLoadMore(listings: TListings, path: string): boolean {
  return canLoadMore(listings, path) && (listings.get(path)?.pagesLoaded ?? 0) < MAX_AUTO_PAGES
}

export function isLoadingMore(listings: TListings, path: string): boolean {
  return listings.get(path)?.loadingMore === true
}

export function loadMoreError(listings: TListings, path: string): string | undefined {
  return listings.get(path)?.error
}

export function beginLoadingMore(listings: TListings, path: string): TListings {
  const listing = listings.get(path)
  if (!listing) {
    return listings
  }
  return new Map(listings).set(path, {
    ...listing,
    loadingMore: true,
    error: undefined,
  })
}

type TListPage = {
  cursor?: string | undefined
  entries: readonly TStorageObject[]
}

export function advanceListing(listings: TListings, path: string, page: TListPage): TListings {
  const listing = listings.get(path)
  return new Map(listings).set(path, {
    cursor: page.cursor,
    pagesLoaded: (listing?.pagesLoaded ?? 0) + 1,
    loadingMore: false,
    entries: [...(listing?.entries ?? []), ...page.entries],
  })
}

/** Subfolders the page no longer names lose their records, or a re-created folder
 *  would show old contents; the rest keep theirs, since a refresh lists them
 *  alongside this one and a parent landing later must not undo a child's page. */
export function replaceListing(listings: TListings, path: string, page: TListPage): TListings {
  const prefix = ensureTrailingSlash(path)
  const subfolders = new Set(
    page.entries.filter((entry) => entry.type === 'directory').map(getNodeName),
  )
  const next = new Map(listings)
  next.delete(path)
  for (const key of listings.keys()) {
    if (!key.startsWith(prefix)) {
      continue
    }
    if (!subfolders.has(key.slice(prefix.length).split('/')[0] ?? '')) {
      next.delete(key)
    }
  }
  return advanceListing(next, path, page)
}

/** `pagesLoaded` stays put, so a failed first page still reads as unlisted. */
export function recordListingError(listings: TListings, path: string, error: string): TListings {
  const listing = listings.get(path)
  return new Map(listings).set(path, {
    cursor: listing?.cursor,
    pagesLoaded: listing?.pagesLoaded ?? 0,
    loadingMore: false,
    error,
    entries: listing?.entries ?? [],
  })
}

/** Keeps the cursor and pages, so a retry resumes paging instead of starting over. */
export function clearListingError(listings: TListings, path: string): TListings {
  const listing = listings.get(path)
  if (!listing) {
    return listings
  }
  return new Map(listings).set(path, { ...listing, error: undefined })
}

export function clearListingsUnder(listings: TListings, path: string): TListings {
  // Without the slash, `logs` would also cover `logs-archive/`.
  const prefix = ensureTrailingSlash(path)
  const next = new Map(listings)
  for (const key of listings.keys()) {
    if (key === path || key.startsWith(prefix)) {
      next.delete(key)
    }
  }
  return next
}

/** Tree paths whose children should keep arrival order, since sorting them would
 *  reshuffle rows under the user mid-scroll. */
export function incompletePaths(listings: TListings): Set<string> {
  const paths = new Set<string>()
  for (const [path, listing] of listings) {
    if (listing.cursor) {
      paths.add(path)
    }
  }
  return paths
}

/** Reached only when the target is deep inside a directory of well over 20,000
 *  entries, where the alternative is draining it all. */
export const MAX_HYDRATION_PAGES = 20

type THydrationStep =
  /** List this directory's first page. */
  | { kind: 'fetch'; path: string }
  /** Pull another page; the target is not in what we have. */
  | { kind: 'more'; path: string }
  /** The deepest directory reached. */
  | { kind: 'stuck'; path: string }
  /** Either resolved, or a request is already in flight. */
  | { kind: 'done' }

/** What a deep link needs next. Pure so the walk is table-testable. */
export function nextHydrationStep({
  targetResolved,
  ancestors,
  isListableDir,
  listings,
  inFlight,
  pagesPulled,
}: {
  targetResolved: boolean
  /** Directory paths from the storage root down to the target.  */
  ancestors: readonly string[]
  /** False above the storage root, and false for a directory a page has not
   *  introduced yet. */
  isListableDir: (path: string) => boolean
  listings: TListings
  /** Must not be a state value: it would lag the claim by a render and make an
   *  in-flight ancestor read as stuck. */
  inFlight: { has(path: string): boolean }
  pagesPulled: number
}): THydrationStep {
  for (const path of ancestors) {
    // Above the storage root, or introduced by a page not pulled yet; the tail of
    // this function handles the latter.
    if (!isListableDir(path)) {
      continue
    }
    if (inFlight.has(path)) {
      return { kind: 'done' }
    }
    // A record with no pages is a first page that failed; it is not asked again.
    if (!listings.has(path)) {
      return { kind: 'fetch', path }
    }
  }

  if (targetResolved) {
    return { kind: 'done' }
  }
  const deepest = [...ancestors].reverse().find(isListableDir)
  if (!deepest) {
    return { kind: 'done' }
  }
  if (!hasMore(listings, deepest)) {
    return { kind: 'stuck', path: deepest }
  }
  // A failed page needs an explicit retry here too. Without this the walk re-runs on
  // the very `listings` change the failure produced, and each retry clears the error,
  // so a failing directory is hammered until the page bound stops it.
  if (loadMoreError(listings, deepest)) {
    return { kind: 'stuck', path: deepest }
  }
  if (pagesPulled >= MAX_HYDRATION_PAGES) {
    return { kind: 'stuck', path: deepest }
  }
  return isLoadingMore(listings, deepest) ? { kind: 'done' } : { kind: 'more', path: deepest }
}
