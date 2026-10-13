import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useMemo,
  useRef,
  useSyncExternalStore,
} from 'react'

// The default for UIData.usePersistedState, used when a host doesn't bind its
// own: the browser's storage, as JSON, kept in step across every component and
// tab reading a key.

const listeners = new Map<string, Set<() => void>>()
// Values storage refused, such as in a private window or with the quota full;
// they last until the page closes.
const memory = new Map<string, string>()
const MISSING = Symbol('missing')

function readRaw(key: string): string | null {
  const held = memory.get(key)
  if (held !== undefined) {
    return held
  }
  try {
    return globalThis.localStorage?.getItem(key) ?? null
  } catch {
    return null
  }
}

function writeRaw(key: string, raw: string | null) {
  try {
    if (raw === null) {
      globalThis.localStorage?.removeItem(key)
    } else {
      globalThis.localStorage?.setItem(key, raw)
    }
    memory.delete(key)
  } catch {
    if (raw === null) {
      memory.delete(key)
    } else {
      memory.set(key, raw)
    }
  }
}

function parse(raw: string | null): unknown {
  if (raw === null) {
    return MISSING
  }
  try {
    return JSON.parse(raw)
  } catch {
    // Not written by this hook: start over from the default.
    return MISSING
  }
}

function subscribe(key: string, listener: () => void) {
  let keyListeners = listeners.get(key)
  if (!keyListeners) {
    keyListeners = new Set()
    listeners.set(key, keyListeners)
  }
  keyListeners.add(listener)
  // Another tab's write.
  const onStorage = (e: StorageEvent) => {
    if (e.key === key || e.key === null) {
      listener()
    }
  }
  window.addEventListener('storage', onStorage)
  return () => {
    keyListeners.delete(listener)
    window.removeEventListener('storage', onStorage)
  }
}

export function useLocalPersistedState<T>(
  key: string,
  defaultValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const raw = useSyncExternalStore(
    useCallback((listener: () => void) => subscribe(key, listener), [key]),
    () => readRaw(key),
    () => null,
  )
  const fallback = useRef(defaultValue)
  fallback.current = defaultValue
  // Parsed once per stored string, so the value keeps its identity between renders.
  const stored = useMemo(() => parse(raw), [raw])
  const value = stored === MISSING ? defaultValue : (stored as T)

  const setValue = useCallback<Dispatch<SetStateAction<T>>>(
    (update) => {
      const current = parse(readRaw(key))
      const previous = current === MISSING ? fallback.current : (current as T)
      const next = typeof update === 'function' ? (update as (prev: T) => T)(previous) : update
      writeRaw(key, next === undefined ? null : JSON.stringify(next))
      for (const listener of listeners.get(key) ?? []) {
        listener()
      }
    },
    [key],
  )
  return [value, setValue]
}
