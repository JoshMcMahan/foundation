import { useCallback, useMemo, useRef, useState } from 'react'
import { usePersistedState } from '../components/Provider'
import {
  type ActiveFilter,
  applyFilterList,
  type FilterField,
  type FilterOperator,
  fieldOperators,
  fromStored,
  isComplete,
  type QuickFilter,
  type StoredFilters,
  sameFilters,
  toStored,
} from './filterModel'

/** Where filters live besides what the list remembers, such as the page's URL. */
export interface FilterStore {
  /** The filters it holds, or `null` when it holds none, such as a URL with no filter params,
   *  so the remembered filters apply. */
  value: readonly ActiveFilter[] | null
  onChange: (next: ActiveFilter[]) => void
}

export interface ListFiltersConfig<T> {
  /** Remembers the filters under `${storageKey}:filters`, through the host's persisted state
   *  (the browser's storage unless the host binds its own, such as an account preference). */
  storageKey: string
  /** Fields marked `shared` keep one value under `${sharedFiltersKey}:sharedFilters`. */
  sharedFiltersKey?: string | undefined
  fields: readonly FilterField<T>[]
  /** What the page shows before the reader changes anything, and what Reset returns to. */
  defaultFilters?: readonly ActiveFilter[] | undefined
  /** Filters held outside the list, such as the URL. Its filters win while it has any, and
   *  every change goes to it and to what the list remembers. */
  store?: FilterStore | undefined
  /** False leaves remembering to the store alone. */
  remember?: boolean | undefined
  /** Fields whose values also show as toggles above the chips. */
  quick?: readonly QuickFilter[] | undefined
}

/** A request for a chip to open one of its pickers, which the chip clears once it has. */
export interface FilterEditRequest {
  field: string
  part: 'value' | 'field' | 'operator'
  id: number
}

/** A list's filters, the state behind the chip row and the Filter menu. */
export interface ListFilters {
  // biome-ignore lint/suspicious/noExplicitAny: the row type stays with the page; the chip row only needs the fields' shape
  fields: readonly FilterField<any>[]
  /** Fields whose values also show as toggles above the chips. */
  quick: readonly QuickFilter[]
  /** The filters in effect, in the order they were added. */
  active: readonly ActiveFilter[]
  /** The chips to show: the filters in effect, then one being added that has no value yet. */
  chips: readonly ActiveFilter[]
  /** The field of a chip just added and still waiting for its value. */
  draft: string | null
  /** Starts a filter: a chip for the field appears and its value picker opens. A field
   *  already in use opens its chip's picker instead. */
  begin: (field: string) => void
  add: (field: string, op?: FilterOperator, values?: readonly string[]) => void
  update: (field: string, patch: Partial<Omit<ActiveFilter, 'field'>>) => void
  /** Swaps a chip's field for another, keeping its values when the kinds match. */
  replaceField: (field: string, next: string) => void
  remove: (field: string) => void
  /** Drops the chip being added, if it never got a value. */
  discardDraft: () => void
  /** Empties every filter but the required ones. */
  clear: () => void
  /** Returns to the page's default filters. */
  reset: () => void
  hasDefaults: boolean
  isDefault: boolean
  /** How many filters narrow the list. */
  count: number
  apply: <R>(rows: readonly R[]) => R[]
  editRequest: FilterEditRequest | null
  requestEdit: (field: string, part?: FilterEditRequest['part']) => void
  clearEditRequest: (id: number) => void
  /** Set by a mounted chip row, so the Filter menu knows a new chip has somewhere to show. */
  barMounted: boolean
  registerBar: () => () => void
}

const NONE: readonly ActiveFilter[] = []
const NO_QUICK: readonly QuickFilter[] = []

/** A list's active filters: which, in what order, where they are remembered and how rows
 *  match them. `useListView` builds one from its facets and fields; a page not on it, or
 *  filtering on the server, can call this alone. */
export function useListFilters<T>({
  storageKey,
  sharedFiltersKey,
  fields,
  defaultFilters = NONE,
  store,
  remember = true,
  quick = NO_QUICK,
}: ListFiltersConfig<T>): ListFilters {
  const sharedKeys = useMemo(
    () => new Set(fields.filter((f) => f.shared).map((f) => f.key)),
    [fields],
  )
  const defaults = useMemo(
    () => defaultFilters.filter((f) => !sharedKeys.has(f.field)),
    [defaultFilters, sharedKeys],
  )
  const sharedDefaults = useMemo(
    () => defaultFilters.filter((f) => sharedKeys.has(f.field)),
    [defaultFilters, sharedKeys],
  )
  const [localStored, setLocalStored] = usePersistedState<StoredFilters>(
    `${storageKey}:filters`,
    toStored(defaults),
  )
  const [sharedStored, setSharedStored] = usePersistedState<StoredFilters>(
    `${sharedFiltersKey ?? storageKey}:sharedFilters`,
    toStored(sharedDefaults),
  )

  const known = useMemo(() => new Set(fields.map((f) => f.key)), [fields])
  const remembered = useMemo(() => {
    const local = fromStored(localStored).filter((f) => !sharedKeys.has(f.field))
    const shared = fromStored(sharedStored).filter((f) => sharedKeys.has(f.field))
    return [...local, ...shared]
  }, [localStored, sharedStored, sharedKeys])
  const source = store?.value ?? (remember ? remembered : defaultFilters)
  const active = useMemo(
    () => source.filter((f) => known.has(f.field) && isComplete(f)),
    [source, known],
  )

  // The newest state, so two changes in one event build on each other.
  const latest = useRef(active)
  latest.current = active

  const write = useCallback(
    (next: ActiveFilter[]) => {
      latest.current = next
      if (remember) {
        // Values a shared field held stay with the other pages until this one changes them.
        setLocalStored(toStored(next.filter((f) => !sharedKeys.has(f.field))))
        if (sharedKeys.size > 0) {
          setSharedStored((prev) => {
            const kept: StoredFilters = {}
            for (const [key, value] of Object.entries(prev ?? {})) {
              if (!sharedKeys.has(key)) {
                kept[key] = value
              }
            }
            return { ...kept, ...toStored(next.filter((f) => sharedKeys.has(f.field))) }
          })
        }
      }
      store?.onChange(next)
    },
    [remember, setLocalStored, setSharedStored, sharedKeys, store],
  )

  // A chip with no value yet, and where it sits among the others.
  const [draftState, setDraftStateRaw] = useState<{ filter: ActiveFilter; index: number } | null>(
    null,
  )
  const draftRef = useRef(draftState)
  const setDraft = useCallback((filter: ActiveFilter | null, index?: number) => {
    const next = filter ? { filter, index: index ?? Number.POSITIVE_INFINITY } : null
    draftRef.current = next
    setDraftStateRaw(next)
  }, [])
  const draft =
    draftState && !active.some((f) => f.field === draftState.filter.field) ? draftState : null
  const [editRequest, setEditRequest] = useState<FilterEditRequest | null>(null)
  const nextId = useRef(0)
  const requestEdit = useCallback((field: string, part: FilterEditRequest['part'] = 'value') => {
    nextId.current += 1
    setEditRequest({ field, part, id: nextId.current })
  }, [])
  const clearEditRequest = useCallback(
    (id: number) => setEditRequest((prev) => (prev?.id === id ? null : prev)),
    [],
  )

  const fieldOf = useCallback((key: string) => fields.find((f) => f.key === key), [fields])

  const add = useCallback(
    (key: string, op?: FilterOperator, values: readonly string[] = []) => {
      const field = fieldOf(key)
      if (!field) {
        return
      }
      const filter: ActiveFilter = {
        field: key,
        op: op ?? fieldOperators(field)[0] ?? 'is',
        values: field.kind === 'boolean' && values.length === 0 ? ['true'] : values,
      }
      const rest = latest.current.filter((f) => f.field !== key)
      if (!isComplete(filter)) {
        if (rest.length !== latest.current.length) {
          write(rest)
        }
        setDraft(filter)
        return
      }
      if (draftRef.current?.filter.field === key) {
        setDraft(null)
      }
      write([...rest, filter])
    },
    [fieldOf, write, setDraft],
  )

  const update = useCallback(
    (key: string, patch: Partial<Omit<ActiveFilter, 'field'>>) => {
      const index = latest.current.findIndex((f) => f.field === key)
      const current = latest.current[index]
      if (!current) {
        // The chip being added: it joins the filters, where it sits, once it has a value.
        const held = draftRef.current
        if (held?.filter.field !== key) {
          // A required or pinned chip still reading "Any".
          const field = fieldOf(key)
          const next: ActiveFilter = {
            field: key,
            op: patch.op ?? (field ? fieldOperators(field)[0] : undefined) ?? 'is',
            values: patch.values ?? [],
          }
          if (field && isComplete(next)) {
            write([...latest.current, next])
          }
          return
        }
        const next = { ...held.filter, ...patch }
        if (isComplete(next)) {
          setDraft(null)
          const at = Math.min(held.index, latest.current.length)
          write([...latest.current.slice(0, at), next, ...latest.current.slice(at)])
        } else {
          setDraft(next, held.index)
        }
        return
      }
      const next = { ...current, ...patch }
      if (isComplete(next)) {
        write(latest.current.map((f) => (f.field === key ? next : f)))
        return
      }
      const field = fieldOf(key)
      if (!field?.required && !field?.pinned) {
        // Emptied, as by unticking its last value: the chip stays in place, waiting for one.
        setDraft(next, index)
      }
      write(latest.current.filter((f) => f.field !== key))
    },
    [fieldOf, write, setDraft],
  )

  const remove = useCallback(
    (key: string) => {
      if (draftRef.current?.filter.field === key) {
        setDraft(null)
      }
      if (latest.current.some((f) => f.field === key)) {
        write(latest.current.filter((f) => f.field !== key))
      }
    },
    [write, setDraft],
  )

  const replaceField = useCallback(
    (key: string, nextKey: string) => {
      const from = fieldOf(key)
      const to = fieldOf(nextKey)
      const index = latest.current.findIndex((f) => f.field === key)
      const held = draftRef.current?.filter.field === key ? draftRef.current : undefined
      const current = latest.current[index] ?? held?.filter
      if (!from || !to || !current || key === nextKey) {
        return
      }
      const ops = fieldOperators(to)
      const op = ops.includes(current.op) ? current.op : (ops[0] ?? 'is')
      // Values carry over where they mean the same: a date to a date, or options the new
      // field also has.
      const listed = from.kind === 'enum' || from.kind === 'people'
      const carries =
        from.kind === to.kind &&
        (!listed || current.values.every((v) => to.options?.some((o) => o.value === v) ?? false))
      const next: ActiveFilter = {
        field: nextKey,
        op,
        values: to.kind === 'boolean' ? ['true'] : carries ? current.values : [],
      }
      const rest = latest.current.filter((f) => f.field !== nextKey)
      const at = index >= 0 ? rest.findIndex((f) => f.field === key) : (held?.index ?? rest.length)
      const without = rest.filter((f) => f.field !== key)
      if (isComplete(next)) {
        setDraft(null)
        const pos = Math.min(Math.max(at, 0), without.length)
        write([...without.slice(0, pos), next, ...without.slice(pos)])
      } else {
        if (without.length !== latest.current.length) {
          write(without)
        }
        setDraft(next, at)
        requestEdit(nextKey)
      }
    },
    [fieldOf, write, setDraft, requestEdit],
  )

  const begin = useCallback(
    (key: string) => {
      const field = fieldOf(key)
      if (!field) {
        return
      }
      if (latest.current.some((f) => f.field === key) || field.required || field.pinned) {
        requestEdit(key)
        return
      }
      add(key)
      if (field.kind !== 'boolean') {
        requestEdit(key)
      }
    },
    [fieldOf, add, requestEdit],
  )

  const discardDraft = useCallback(() => setDraft(null), [setDraft])

  const clear = useCallback(() => {
    setDraft(null)
    write(latest.current.filter((f) => fieldOf(f.field)?.required))
  }, [fieldOf, write, setDraft])

  const reset = useCallback(() => {
    setDraft(null)
    write([...defaultFilters])
  }, [defaultFilters, write, setDraft])

  const [bars, setBars] = useState(0)
  const registerBar = useCallback(() => {
    setBars((n) => n + 1)
    return () => setBars((n) => n - 1)
  }, [])

  const apply = useCallback(
    <R>(rows: readonly R[]) =>
      applyFilterList(rows, active, fields as unknown as readonly FilterField<R>[]),
    [active, fields],
  )

  const chips = useMemo(() => {
    if (!draft) {
      return active
    }
    const at = Math.min(draft.index, active.length)
    return [...active.slice(0, at), draft.filter, ...active.slice(at)]
  }, [active, draft])

  return {
    fields,
    quick,
    active,
    chips,
    draft: draft?.filter.field ?? null,
    begin,
    add,
    update,
    replaceField,
    remove,
    discardDraft,
    clear,
    reset,
    hasDefaults: defaultFilters.length > 0,
    isDefault: sameFilters(active, defaultFilters),
    count: active.length,
    apply,
    editRequest,
    requestEdit,
    clearEditRequest,
    barMounted: bars > 0,
    registerBar,
  }
}
