import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { buttonClasses } from '../components/buttonClasses'
import { ariaKeyShortcuts } from '../components/Kbd'
import { useLocale, usePersistedState, useStrings } from '../components/Provider'
import { isTextEntryContext } from '../components/shortcutKey'
import { Tooltip } from '../components/Tooltip'
import { formatInteger } from '../format'
import { CloseIcon, RemoveIcon, SearchIcon } from '../icons'

const NO_TERMS: string[] = []

/** Pass `enabled: false` to suspend the global ⌘F/`/` hijack (e.g. when search isn't shown and browser Find should stay active). */
export function useListSearch(enabled = true, storageKey?: string) {
  const [filter, setFilter] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [storedTerms, setStoredTerms] = usePersistedState<string[]>(
    `${storageKey ?? 'list'}:searchTerms`,
    NO_TERMS,
  )
  const terms = storageKey ? storedTerms : NO_TERMS
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (searchOpen) {
      inputRef.current?.focus()
    }
  }, [searchOpen])

  useEffect(() => {
    if (!enabled) {
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (isTextEntryContext(e.target)) {
        return
      }
      if ((e.key === 'f' || e.key === 'F') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setSearchOpen(true)
      } else if (e.key === '/') {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])

  const openSearch = useCallback(() => setSearchOpen(true), [])
  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    setFilter('')
  }, [])

  const addTerm = useCallback(
    (term: string) => {
      const trimmed = term.trim()
      if (!storageKey || !trimmed) {
        return
      }
      setStoredTerms((prev) =>
        prev.some((t) => t.toLowerCase() === trimmed.toLowerCase()) ? prev : [...prev, trimmed],
      )
      setFilter('')
    },
    [storageKey, setStoredTerms],
  )

  const removeTerm = useCallback(
    (term: string) => setStoredTerms((prev) => prev.filter((t) => t !== term)),
    [setStoredTerms],
  )

  const clearSearch = useCallback(() => {
    if (storageKey) {
      setStoredTerms(NO_TERMS)
    }
    setSearchOpen(false)
    setFilter('')
  }, [storageKey, setStoredTerms])

  const trimmedFilter = filter.trim()
  const queries = trimmedFilter ? [...terms, trimmedFilter] : terms

  return {
    filter,
    setFilter,
    searchOpen,
    openSearch,
    closeSearch,
    clearSearch,
    terms,
    addTerm,
    removeTerm,
    queries,
    inputRef,
  }
}

export type ListSearch = ReturnType<typeof useListSearch>

export function ListSearchControl({
  search,
  placeholder,
  label: labelProp,
}: {
  search: ListSearch
  placeholder: string
  label?: string | undefined
}) {
  const { common, list } = useStrings()
  const label = labelProp ?? common.search
  if (search.searchOpen || search.terms.length > 0) {
    return (
      <div className="flex min-h-7 w-72 max-w-[55vw] flex-wrap items-center gap-1.5 rounded-md border border-(--theme-border) bg-(--theme-muted-panel-bg) px-2 py-0.5">
        <SearchIcon className="w-3.5 h-3.5 shrink-0 text-(--theme-muted-text-color)" />
        {search.terms.map((term) => (
          <span
            key={term}
            className="flex max-w-40 items-center gap-1 rounded border border-(--theme-border) bg-(--theme-app-bg) px-1.5 py-px text-[12px] text-(--theme-app)"
          >
            <span className="truncate">{term}</span>
            <button
              type="button"
              onClick={() => search.removeTerm(term)}
              aria-label={list.removeSearchTerm(term)}
              className="shrink-0 rounded p-0.5 text-(--theme-muted-text-color) hover:text-(--theme-app) transition-colors"
            >
              <RemoveIcon className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        <input
          ref={search.inputRef}
          value={search.filter}
          onChange={(e) => search.setFilter(e.target.value)}
          onFocus={search.openSearch}
          aria-label={label}
          onKeyDown={(e) => {
            // Escape belongs to the field, not the window: a dialog or menu
            // open over the list closes on its own Escape and keeps the search.
            if (e.key === 'Escape' && search.searchOpen) {
              e.preventDefault()
              search.closeSearch()
            } else if (e.key === 'Enter') {
              e.preventDefault()
              search.addTerm(search.filter)
            } else if (e.key === 'Backspace' && !search.filter) {
              const lastTerm = search.terms.at(-1)
              if (lastTerm) {
                search.removeTerm(lastTerm)
              }
            }
          }}
          placeholder={placeholder}
          className="min-w-24 flex-1 bg-transparent text-[13px] text-(--theme-app) placeholder:text-(--theme-placeholder) focus:outline-none"
        />
        <button
          type="button"
          onClick={search.clearSearch}
          aria-label={common.clearSearch}
          className="shrink-0 rounded p-0.5 text-(--theme-muted-text-color) hover:text-(--theme-app) transition-colors"
        >
          <CloseIcon className="w-3 h-3" />
        </button>
      </div>
    )
  }
  return (
    <Tooltip content={label} shortcut="/">
      <button
        type="button"
        onClick={search.openSearch}
        aria-label={label}
        aria-keyshortcuts={`/ ${ariaKeyShortcuts('Mod+F')}`}
        className={buttonClasses({ variant: 'outline', size: 'sm', iconOnly: true })}
      >
        <SearchIcon />
      </button>
    </Tooltip>
  )
}

/** What a list's count needs: how many there are, how many a search or filter leaves, and the
 *  noun in both numbers. */
export interface ListCountProps {
  total: number
  matches: number
  filterActive: boolean
  noun: string
  nounPlural: string
}

/** True inside a `ListPage` that shows its count under its rows, so a count placed in its toolbar
 *  by hand gives way rather than showing twice. */
export const ListFooterCountContext = createContext(false)

/** True where a toolbar shares a line with the list's filter chips, at its end: a `ListToolbar`
 *  there drops its own row's height and padding. */
export const ListToolbarInlineContext = createContext(false)

/** The count's words, "7 tokens" or "2 of 7 tokens", as a status so a screen reader hears the
 *  count change as a filter narrows it. */
export function ListCountText({ total, matches, filterActive, noun, nounPlural }: ListCountProps) {
  const { list: t } = useStrings()
  // Grouped in the host's locale: 1,204 or 1.204.
  const locale = useLocale()
  const count = (n: number) => formatInteger(n, locale)
  return (
    <span role="status" className="text-[13px] text-(--theme-muted-text-color)">
      {filterActive
        ? t.matchCount(count(matches), count(total), nounPlural)
        : t.count(count(total), total === 1 ? noun : nounPlural)}
    </span>
  )
}

/** A list's count, placed by hand.
 *  @deprecated Give `ListPage` a `count` instead (with its `total` and `matches`): it shows the
 *  count under the last row, beside a `pager`, and hides it while the list shows its empty or
 *  no-matches state. Inside a `ListPage` that shows its own count, this renders nothing. */
export function ListCount(props: ListCountProps) {
  // The page shows the count under its rows; a placeholder keeps a toolbar's
  // `justify-between` setting its controls at the end.
  if (useContext(ListFooterCountContext)) {
    return <span aria-hidden="true" />
  }
  return (
    <div className="flex items-center h-8">
      <ListCountText {...props} />
    </div>
  )
}
