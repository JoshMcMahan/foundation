import {
  createContext,
  type KeyboardEvent as ReactKeyboardEvent,
  type Ref,
  use,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { createPortal } from 'react-dom'
import { buttonClasses } from '../components/buttonClasses'
import { HeaderActionsFitContext } from '../components/headerActionsFit'
import { ariaKeyShortcuts } from '../components/Kbd'
import {
  useCharacterKeyShortcuts,
  useLocale,
  usePersistedState,
  useStrings,
} from '../components/Provider'
import { isTextEntryContext, useShortcutKey } from '../components/shortcutKey'
import { Tooltip } from '../components/Tooltip'
import { cx } from '../cx'
import { formatInteger } from '../format'
import { CloseIcon, RemoveIcon, SearchIcon } from '../icons'

const NO_TERMS: string[] = []

/** Pass `enabled: false` to suspend the global ⌘F/`/` hijack (e.g. when search isn't shown and browser Find should stay active).
 *  `/` is off too while UIProvider's `characterKeyShortcuts` is. */
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
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [enabled])

  const openSearch = useCallback(() => setSearchOpen(true), [])
  useShortcutKey(enabled ? '/' : undefined, openSearch)
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
  fill = false,
}: {
  search: ListSearch
  placeholder: string
  label?: string | undefined
  /** On a phone, the open field takes the rest of its line rather than keep a desktop's width:
   *  for a search on a line of its own, such as a list's toolbar. In a page header's actions it
   *  has no effect, as the bar decides there. */
  fill?: boolean | undefined
}) {
  const { common, list } = useStrings()
  const label = labelProp ?? common.search
  // In a page header's actions, the bar says whether an open search fits beside the trail or
  // takes the whole bar.
  const fit = use(HeaderActionsFitContext)
  useSyncExternalStore(fit?.subscribe ?? subscribeNever, fit?.getVersion ?? zero, zero)
  const covers = fit?.searchCovers() ?? false
  const coverNode = fit?.coverNode() ?? null
  const covering = covers && search.searchOpen && coverNode !== null
  // Where the search takes the bar, it shows as its button until it opens, even while terms
  // narrow the list; elsewhere the terms keep the field open.
  const field = covering || (!covers && (search.searchOpen || search.terms.length > 0))
  const active = search.terms.length > 0 || search.filter.trim() !== ''
  const id = useId()
  useLayoutEffect(() => {
    fit?.setCovering(id, covering)
  }, [fit, id, covering])
  useLayoutEffect(() => (fit ? () => fit.setCovering(id, false) : undefined), [fit, id])

  // Closing the field from inside it hands focus back to the button that opened it, rather than
  // dropping it to the page.
  const button = useRef<HTMLButtonElement>(null)
  const returnFocus = useRef(false)
  useLayoutEffect(() => {
    if (!field && returnFocus.current) {
      returnFocus.current = false
      // After the bar has re-rendered, so a button it covered is no longer inert.
      queueMicrotask(() => button.current?.focus())
    }
  })
  // The field moves between the bar's row and the layer over it as the bar resizes; it keeps
  // focus when it does.
  const { inputRef, searchOpen } = search
  const wasCovering = useRef(covering)
  useLayoutEffect(() => {
    if (wasCovering.current === covering) {
      return
    }
    wasCovering.current = covering
    if (!searchOpen) {
      return
    }
    // Once the bar has re-rendered: taking it makes the control that opened the search inert.
    queueMicrotask(() => {
      const focused = document.activeElement
      if (!focused || focused === document.body || coverNode?.parentElement?.contains(focused)) {
        inputRef.current?.focus()
      }
    })
  })

  if (field) {
    const close = () => {
      returnFocus.current = true
      search.clearSearch()
    }
    // Escape belongs to the field, not the window: a dialog or menu open over the list closes on
    // its own Escape and keeps the search.
    const closeOnEscape = (e: ReactKeyboardEvent<HTMLElement>) => {
      if (e.key === 'Escape' && search.searchOpen) {
        e.preventDefault()
        // The terms keep the field in place, and focus with it.
        returnFocus.current = covering || search.terms.length === 0
        search.closeSearch()
        return true
      }
      return false
    }
    const box = (
      <div
        className={cx(
          'flex flex-wrap items-center gap-1.5 rounded-md border border-(--theme-border) bg-(--theme-muted-panel-bg) px-2 py-0.5',
          covering ? 'pointer-events-auto min-h-8 w-full' : 'min-h-7 w-72 max-w-[55vw]',
          // A phone's line is too narrow to leave space beside a field of a fixed width.
          fill && !fit && 'max-sm:max-w-none max-sm:flex-1',
        )}
      >
        <SearchIcon className="w-3.5 h-3.5 shrink-0 text-(--theme-muted-text-color)" />
        {search.terms.map((term) => (
          <span
            key={term}
            className="flex max-w-40 items-center gap-1 rounded border border-(--theme-border) bg-(--theme-app-bg) px-1.5 py-px text-[12px] text-(--theme-app)"
          >
            <span className="truncate">{term}</span>
            <button
              type="button"
              onClick={() => {
                // The button goes with its term, so focus goes to the box rather than to the page.
                search.inputRef.current?.focus()
                search.removeTerm(term)
              }}
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
            if (closeOnEscape(e)) {
              return
            }
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
          className="min-w-24 flex-1 bg-transparent text-[13px] text-(--theme-app) placeholder:text-(--theme-placeholder) focus:outline-none"
        />
        <button
          type="button"
          onClick={close}
          onKeyDown={closeOnEscape}
          aria-label={common.clearSearch}
          className={cx(
            'shrink-0 rounded text-(--theme-muted-text-color) hover:text-(--theme-app) transition-colors',
            // A finger's target where the field has the bar.
            covering ? '-me-1 inline-flex size-6 items-center justify-center' : 'p-0.5',
          )}
        >
          <CloseIcon className="w-3 h-3" />
        </button>
      </div>
    )
    if (covering && coverNode) {
      // The button keeps its place in the covered row, so the bar's layout doesn't move.
      return (
        <>
          <span data-header-search="" className="contents">
            <SearchButton
              label={label}
              name={active ? list.searchActive(label) : label}
              active={active}
              onOpen={search.openSearch}
            />
          </span>
          {createPortal(box, coverNode)}
        </>
      )
    }
    return fit ? (
      <span data-header-search="" className="contents">
        {box}
      </span>
    ) : (
      box
    )
  }
  const control = (
    <SearchButton
      ref={button}
      label={label}
      name={active ? list.searchActive(label) : label}
      active={active}
      onOpen={search.openSearch}
    />
  )
  return fit ? (
    <span data-header-search="" className="contents">
      {control}
    </span>
  ) : (
    control
  )
}

const subscribeNever = () => () => {}
const zero = () => 0

/** The search closed: a button, with a dot while a query it holds narrows the list. */
function SearchButton({
  ref,
  label,
  name = label,
  active,
  onOpen,
}: {
  ref?: Ref<HTMLButtonElement>
  label: string
  name?: string
  active: boolean
  onOpen: () => void
}) {
  const slash = useCharacterKeyShortcuts()
  return (
    <Tooltip content={label} shortcut={slash ? '/' : 'Mod+F'}>
      <button
        ref={ref}
        type="button"
        onClick={onOpen}
        aria-label={name}
        aria-keyshortcuts={`${slash ? '/ ' : ''}${ariaKeyShortcuts('Mod+F')}`}
        className={buttonClasses({ variant: 'outline', size: 'sm', iconOnly: true })}
      >
        <SearchIcon />
        {active && (
          <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-(--theme-link)" />
        )}
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
export function ListCountText(props: ListCountProps) {
  return <ListCountStatus count={props} />
}

/** A list's count as a status that can say nothing yet: kept mounted while its text is empty, so
 *  a screen reader hears the count when it arrives, as it would not from a status that mounts
 *  with its text already in. */
export function ListCountStatus({
  count,
  className = 'text-[13px] text-(--theme-muted-text-color)',
}: {
  count: ListCountProps | undefined
  className?: string | undefined
}) {
  const { list: t } = useStrings()
  // Grouped in the host's locale: 1,204 or 1.204.
  const locale = useLocale()
  const n = (value: number) => formatInteger(value, locale)
  let words = ''
  if (count) {
    const { total, matches, filterActive, noun, nounPlural } = count
    words = filterActive
      ? t.matchCount(n(matches), n(total), nounPlural)
      : t.count(n(total), total === 1 ? noun : nounPlural)
  }
  return (
    <span role="status" className={className}>
      {words}
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
