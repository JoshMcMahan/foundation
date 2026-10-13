import { Combobox } from '@base-ui/react/combobox'
import { useCallback } from 'react'

// Hyphens fold away so "us-east" and "useast" match; the collator ignores case and accents.
const fold = (text: string) => text.replaceAll('-', '')

/** Whether a query matches any of the texts, the way every picker in the package searches. */
export function useQueryMatch() {
  const { contains } = Combobox.useFilter()
  return useCallback(
    (query: string, ...texts: (string | undefined)[]) => {
      const q = fold(query)
      return texts.some((text) => text !== undefined && contains(fold(text), q))
    },
    [contains],
  )
}
