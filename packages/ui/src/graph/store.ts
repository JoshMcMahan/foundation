import { useSyncExternalStore } from 'react'

/** State components read part of, each re-rendering only when its part changes. */
export class Store {
  /** Counts changes, so what follows the whole of a store can tell one happened. */
  version = 0
  private readonly listeners = new Set<() => void>()

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  protected notify() {
    this.version++
    for (const listener of this.listeners) {
      listener()
    }
  }
}

const noSubscription = () => () => {}

/** What `read` takes from `store`, re-rendering when it changes; `none` without a store. */
export function useStore<S extends Store, T extends string | number>(
  store: S | null,
  read: (store: S) => T,
  none: T,
): T {
  return useSyncExternalStore(
    store?.subscribe ?? noSubscription,
    () => (store ? read(store) : none),
    () => none,
  )
}
