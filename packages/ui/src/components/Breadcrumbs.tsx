import React, { createContext, useContext, useEffect, useLayoutEffect } from 'react'

export interface IBreadcrumbItem {
  label: string
  href?: string
  newWindow?: boolean
}

interface BreadcrumbContextType {
  breadcrumbs: IBreadcrumbItem[]
  setBreadcrumbs: (breadcrumbs: IBreadcrumbItem[]) => void
  rightsideBreadcrumb?: IBreadcrumbItem | null
  setRightsideBreadcrumb: (breadcrumb: IBreadcrumbItem | null) => void
  hidden: boolean
  setHidden: (hidden: boolean) => void
  /** Null whenever the breadcrumb strip isn't rendered (classic chrome). */
  titleActionSlot: HTMLElement | null
  setTitleActionSlot: (el: HTMLElement | null) => void
  rightActionSlot: HTMLElement | null
  setRightActionSlot: (el: HTMLElement | null) => void
  /** Pathname whose breadcrumbs a page set itself, so layouts leave it alone. */
  claimedPath: React.MutableRefObject<string | null>
}

const BreadcrumbContext = createContext<BreadcrumbContextType>({
  breadcrumbs: [],
  setBreadcrumbs: () => {},
  rightsideBreadcrumb: null,
  setRightsideBreadcrumb: () => {},
  hidden: false,
  setHidden: () => {},
  titleActionSlot: null,
  setTitleActionSlot: () => {},
  rightActionSlot: null,
  setRightActionSlot: () => {},
  claimedPath: { current: null },
})

export const useBreadcrumb = () => useContext(BreadcrumbContext)

export function BreadcrumbProvider({ children }: { children: React.ReactNode }) {
  const [breadcrumbs, setBreadcrumbs] = React.useState<IBreadcrumbItem[]>([])
  const [rightsideBreadcrumb, setRightsideBreadcrumb] = React.useState<IBreadcrumbItem | null>(null)
  const [hidden, setHidden] = React.useState(false)
  const [titleActionSlot, setTitleActionSlot] = React.useState<HTMLElement | null>(null)
  const [rightActionSlot, setRightActionSlot] = React.useState<HTMLElement | null>(null)
  const claimedPath = React.useRef<string | null>(null)
  return (
    <BreadcrumbContext.Provider
      value={{
        breadcrumbs,
        setBreadcrumbs,
        rightsideBreadcrumb,
        setRightsideBreadcrumb,
        hidden,
        setHidden,
        titleActionSlot,
        setTitleActionSlot,
        rightActionSlot,
        setRightActionSlot,
        claimedPath,
      }}
    >
      {children}
    </BreadcrumbContext.Provider>
  )
}
export function useSetBreadcrumbs(getBreadcrumbs: (() => IBreadcrumbItem[]) | IBreadcrumbItem[]) {
  const { setBreadcrumbs, claimedPath } = useBreadcrumb()

  // useLayoutEffect so the new page's breadcrumbs (or an explicit clear) are
  // applied before paint — otherwise we'd briefly show the previous page's
  // breadcrumbs after navigation.
  useLayoutEffect(() => {
    claimedPath.current = window.location.pathname
    setBreadcrumbs(typeof getBreadcrumbs === 'function' ? getBreadcrumbs() : getBreadcrumbs)
  }, [getBreadcrumbs, setBreadcrumbs, claimedPath])
}

/**
 * For layout routes that derive breadcrumbs from the URL: applies them only
 * while no page under the layout has set its own for the current path.
 * Without this, a layout re-running its effect (for example when the
 * organization's display name loads) overwrote the page's breadcrumbs.
 */
export function useSetDefaultBreadcrumbs(
  getBreadcrumbs: (() => IBreadcrumbItem[]) | IBreadcrumbItem[],
) {
  const { setBreadcrumbs, claimedPath } = useBreadcrumb()

  useLayoutEffect(() => {
    if (claimedPath.current === window.location.pathname) {
      return
    }
    setBreadcrumbs(typeof getBreadcrumbs === 'function' ? getBreadcrumbs() : getBreadcrumbs)
  }, [getBreadcrumbs, setBreadcrumbs, claimedPath])
}

const EMPTY_BREADCRUMBS: IBreadcrumbItem[] = []

/** For pages that render their own header instead of the breadcrumb strip. */
export function useClearBreadcrumbs() {
  useSetBreadcrumbs(EMPTY_BREADCRUMBS)
}

export function useHideBreadcrumbs(hidden: boolean) {
  const { setHidden } = useBreadcrumb()

  useEffect(() => {
    setHidden(hidden)
    return () => setHidden(false)
  }, [hidden, setHidden])
}
