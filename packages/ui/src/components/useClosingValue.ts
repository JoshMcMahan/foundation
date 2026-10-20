import { useState } from 'react'

/** The last value that wasn't null or undefined, so a modal or drawer keeps showing what it was
 *  about while it animates closed, after the host has already let go of it:
 *  `<Drawer open={item !== null}>{useClosingValue(item)?.name}</Drawer>`. */
export function useClosingValue<T>(value: T | null | undefined): T | undefined {
  const [last, setLast] = useState<T | undefined>(value ?? undefined)
  // Set while rendering, not in an effect, so the frame that drops the value still shows it.
  if (value !== null && value !== undefined && !Object.is(value, last)) {
    setLast(value)
  }
  return value ?? last
}
