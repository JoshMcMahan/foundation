import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocalStorage } from 'usehooks-ts'
import { TOOLTIP_ID } from '../components/Tooltip'
import { SearchIcon, XIcon } from '../icons'
import { listControlButtonClasses } from './ListViewControls'
import { isTextEntryContext } from './textEntry'

const NO_TERMS: string[] = []

/** Pass `enabled: false` to suspend the global ⌘F/`/` hijack (e.g. when search isn't shown and browser Find should stay active). */
export function useListSearch(enabled = true, storageKey?: string) {
  const [filter, setFilter] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [storedTerms, setStoredTerms] = useLocalStorage<string[]>(
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
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false)
        setFilter('')
        return
      }
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
  }, [searchOpen, enabled])

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
  label = 'Search',
}: {
  search: ListSearch
  placeholder: string
  label?: string
}) {
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
              aria-label={`Remove filter ${term}`}
              className="shrink-0 rounded p-0.5 text-(--theme-muted-text-color) hover:text-(--theme-app) transition-colors"
            >
              <XIcon className="w-2.5 h-2.5" />
            </button>
          </span>
        ))}
        <input
          ref={search.inputRef}
          value={search.filter}
          onChange={(e) => search.setFilter(e.target.value)}
          onFocus={search.openSearch}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
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
          className="min-w-24 flex-1 bg-transparent text-[13px] text-(--theme-app) placeholder:text-(--theme-muted-text-color) focus:outline-none"
        />
        <button
          type="button"
          onClick={search.clearSearch}
          aria-label="Clear search"
          className="shrink-0 rounded p-0.5 text-(--theme-muted-text-color) hover:text-(--theme-app) transition-colors"
        >
          <XIcon className="w-3 h-3" />
        </button>
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={search.openSearch}
      aria-label={label}
      data-tooltip-id={TOOLTIP_ID}
      data-tooltip-content={label}
      data-tooltip-shortcut="⌘+F"
      className={listControlButtonClasses}
    >
      <SearchIcon className="w-3.5 h-3.5" />
    </button>
  )
}

export function ListCount({
  total,
  matches,
  filterActive,
  noun,
  nounPlural,
}: {
  total: number
  matches: number
  filterActive: boolean
  noun: string
  nounPlural: string
}) {
  return (
    <div className="flex items-center h-9">
      <span className="text-[13px] text-(--theme-muted-text-color)">
        {filterActive
          ? `${matches} of ${total} ${nounPlural}`
          : `${total} ${total === 1 ? noun : nounPlural}`}
      </span>
    </div>
  )
}
