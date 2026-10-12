import { createContext } from 'react'

/**
 * The page each wizard of a form being edited shows, keyed by its list's path as JSON (`[]` for the
 * form's own), so the editor can turn its pages as well as the wizard's own controls.
 */
export interface WizardPages {
  page: (wizard: string) => number
  setPage: (wizard: string, index: number) => void
  /** How many pages the wizard draws, a repeated page's copies included, once it has drawn. */
  count: (wizard: string) => number | undefined
  setCount: (wizard: string, count: number) => void
}

export const WizardPagesContext = createContext<WizardPages | null>(null)
