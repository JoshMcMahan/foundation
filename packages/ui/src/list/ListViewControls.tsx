import cx from 'classnames'
import type { ReactNode } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useStrings } from '../components/Provider'
import { TOOLTIP_ID, TooltipInfo } from '../components/Tooltip'
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  DisplayIcon,
  FilterIcon,
} from '../icons'
import type { FilterFacet, ListView } from './listView'
import { isTextEntryContext } from './textEntry'

/** Shared chrome for the toolbar control buttons (Filter, Display, Search) so
 * they read as a consistent button cluster — matched by ListSearchControl. */
export const listControlButtonClasses =
  'relative flex h-7 w-7 items-center justify-center rounded-md border border-(--theme-border) text-(--theme-muted-text-color) hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app) transition-colors'

const FLYOUT =
  'min-w-44 rounded-lg border border-(--theme-border) bg-(--theme-app-bg) py-1 shadow-lg'

/** Toggle pill shared by the Display menu's column + pinned-action pickers. */
function pillClass(on: boolean) {
  return cx(
    'whitespace-nowrap rounded-full border px-2.5 py-1 text-[12px] transition-colors',
    on
      ? 'border-transparent bg-(--theme-muted-panel-bg) text-(--theme-app)'
      : 'border-(--theme-border) text-(--theme-muted-text-color) hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app)',
  )
}

const SECTION_LABEL =
  'mb-2 text-[11px] font-medium uppercase tracking-wide text-(--theme-muted-text-color)'

/** Portals into .ds-root so the panel escapes the toolbar's overflow clipping. */
function AnchoredPopover({
  icon,
  label,
  active,
  shortcut,
  panelClassName,
  children,
}: {
  icon: ReactNode
  label: string
  active?: boolean
  /** Single-key shortcut (e.g. 'f') that opens the popover; also shown in the
   * tooltip. */
  shortcut?: string
  panelClassName?: string
  children: ReactNode
}) {
  const btnRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ right: number; top: number } | null>(null)
  const close = useCallback(() => setPos(null), [])
  const open = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) {
      setPos({
        right: Math.max(8, Math.round(window.innerWidth - r.right)),
        top: Math.round(r.bottom) + 4,
      })
    }
  }, [])

  useEffect(() => {
    if (!pos) {
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
      }
    }
    const onScroll = (e: Event) => {
      if (e.target instanceof Node && panelRef.current?.contains(e.target)) {
        return
      }
      close()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', close)
    }
  }, [pos, close])

  useEffect(() => {
    if (!shortcut) {
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) {
        return
      }
      if (e.key.toLowerCase() !== shortcut.toLowerCase()) {
        return
      }
      if (isTextEntryContext(e.target)) {
        return
      }
      e.preventDefault()
      open()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shortcut, open])

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => (pos ? close() : open())}
        aria-label={label}
        data-tooltip-id={TOOLTIP_ID}
        data-tooltip-content={label}
        data-tooltip-shortcut={shortcut ? shortcut.toUpperCase() : undefined}
        className={cx(
          listControlButtonClasses,
          active && 'border-(--theme-link) text-(--theme-app)',
        )}
      >
        {icon}
        {active && (
          <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-(--theme-link)" />
        )}
      </button>
      {pos &&
        createPortal(
          <div
            role="none"
            className="fixed inset-0 z-50"
            onMouseDown={close}
            onContextMenu={(e) => {
              e.preventDefault()
              close()
            }}
          >
            <div
              ref={panelRef}
              role="menu"
              onMouseDown={(e) => e.stopPropagation()}
              className={cx(
                'absolute rounded-lg border border-(--theme-border) bg-(--theme-app-bg) shadow-lg',
                panelClassName,
              )}
              style={{ right: pos.right, top: pos.top }}
            >
              {children}
            </div>
          </div>,
          document.querySelector('.ds-root') ?? document.body,
        )}
    </>
  )
}

/** Small on/off switch for the Display menu's boolean options. */
function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean
  onChange: () => void
  label: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cx(
        'relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors',
        checked ? 'bg-(--theme-link)' : 'bg-(--theme-border)',
      )}
    >
      <span
        className={cx(
          'inline-block h-3 w-3 rounded-full bg-white transition-transform',
          checked ? 'translate-x-3.5' : 'translate-x-0.5',
        )}
      />
    </button>
  )
}

export function ListDisplayMenu<T>({ view, label }: { view: ListView<T>; label?: string }) {
  const t = useStrings().list
  const toggleable = view.columns.filter((c) => !c.alwaysVisible)
  const hasGrouping = view.groupBys.length > 0
  const orderDirLabel = view.orderDir === 'asc' ? t.ascending : t.descending
  return (
    <AnchoredPopover
      icon={<DisplayIcon className="h-3.5 w-3.5" />}
      label={label ?? t.displayOptions}
      panelClassName="w-72 p-3"
    >
      {hasGrouping && (
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-(--theme-app)">{t.grouping}</span>
          <GroupingDropdown view={view} />
        </div>
      )}
      {view.orderBys.length > 0 && (
        <div className={cx('flex items-center justify-between gap-3', hasGrouping && 'mt-2.5')}>
          <span className="text-[13px] text-(--theme-app)">{t.ordering}</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={view.toggleOrderDir}
              aria-label={orderDirLabel}
              title={orderDirLabel}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-(--theme-border) text-(--theme-muted-text-color) hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app)"
            >
              {view.orderDir === 'asc' ? (
                <ChevronUpIcon className="h-3 w-3" />
              ) : (
                <ChevronDownIcon className="h-3 w-3" />
              )}
            </button>
            <OrderingDropdown view={view} />
          </div>
        </div>
      )}
      <div
        className={cx(
          'flex items-center justify-between gap-3',
          (hasGrouping || view.orderBys.length > 0) && 'mt-2.5',
        )}
      >
        <span className="text-[13px] text-(--theme-app)">{t.columnHeaders}</span>
        <Switch
          checked={view.showColumnHeaders}
          onChange={view.toggleColumnHeaders}
          label={t.showColumnHeaders}
        />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <span className="text-[13px] text-(--theme-app)">{t.showActions}</span>
        <Switch
          checked={view.showActions}
          onChange={view.toggleShowActions}
          label={t.showRowActions}
        />
      </div>
      {view.showActions && (
        <div className="mt-2.5 flex items-center justify-between gap-3 pl-3">
          <span className="text-[13px] text-(--theme-muted-text-color)">{t.alwaysShowActions}</span>
          <Switch
            checked={view.alwaysShowActions}
            onChange={view.toggleAlwaysShowActions}
            label={t.alwaysShowRowActions}
          />
        </div>
      )}
      {toggleable.length > 0 && (
        <div className="mt-3 border-t border-(--theme-border) pt-3">
          <div className={SECTION_LABEL}>{t.displayProperties}</div>
          <div className="flex flex-wrap gap-1.5">
            {toggleable.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => view.toggleColumn(c.key)}
                className={pillClass(view.isVisible(c.key))}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {view.showActions && view.actions.length > 0 && (
        <div className="mt-3 border-t border-(--theme-border) pt-3">
          <div className={cx(SECTION_LABEL, 'flex items-center gap-1')}>
            {t.pinnedActions}
            <TooltipInfo className="inline-flex" text={t.pinnedActionsHelp} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {view.actions.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => view.togglePinned(a.key)}
                className={pillClass(view.isPinned(a.key))}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {!view.isDisplayDefault && (
        <div className="mt-3 border-t border-(--theme-border) pt-2">
          <button type="button" onClick={view.resetDisplay} className="link text-[12px]">
            {t.reset}
          </button>
        </div>
      )}
    </AnchoredPopover>
  )
}

/** Capture phase: the popover panel stops mousedown propagation, so a
 * bubble-phase listener never sees clicks inside it. */
function useCloseOnOutsideClick(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) {
      return
    }
    const onDown = (e: MouseEvent) => {
      if (e.target instanceof Node && !ref.current?.contains(e.target)) {
        close()
      }
    }
    document.addEventListener('mousedown', onDown, true)
    return () => document.removeEventListener('mousedown', onDown, true)
  }, [open, close])
  return ref
}

function GroupingDropdown<T>({ view }: { view: ListView<T> }) {
  const t = useStrings().list
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useCloseOnOutsideClick(open, close)
  const current = view.groupBys.find((g) => g.value === view.groupBy)
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-(--theme-border) px-2 py-1 text-[12px] text-(--theme-app) hover:bg-(--theme-muted-panel-bg)"
      >
        {current?.label ?? t.none}
        <ChevronDownIcon className="h-2.5 w-2.5 opacity-60" />
      </button>
      {open && (
        <div className={cx('absolute right-0 top-full z-20 mt-1', FLYOUT)}>
          {view.groupBys.map((g) => (
            <button
              key={g.value}
              type="button"
              onClick={() => {
                view.setGroupBy(g.value)
                setOpen(false)
              }}
              className={cx(
                'flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[13px] hover:bg-(--theme-muted-panel-bg)',
                view.groupBy === g.value ? 'text-(--theme-app)' : 'text-(--theme-muted-text-color)',
              )}
            >
              {g.label}
              {view.groupBy === g.value && <CheckIcon className="h-3 w-3" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function OrderingDropdown<T>({ view }: { view: ListView<T> }) {
  const t = useStrings().list
  const [open, setOpen] = useState(false)
  const close = useCallback(() => setOpen(false), [])
  const ref = useCloseOnOutsideClick(open, close)
  const current = view.orderBys.find((o) => o.value === view.orderBy)
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 rounded-md border border-(--theme-border) px-2 py-1 text-[12px] text-(--theme-app) hover:bg-(--theme-muted-panel-bg)"
      >
        {current?.label ?? t.none}
        <ChevronDownIcon className="h-2.5 w-2.5 opacity-60" />
      </button>
      {open && (
        <div className={cx('absolute right-0 top-full z-20 mt-1', FLYOUT)}>
          {view.orderBys.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                view.setOrderBy(o.value)
                setOpen(false)
              }}
              className={cx(
                'flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-[13px] hover:bg-(--theme-muted-panel-bg)',
                view.orderBy === o.value ? 'text-(--theme-app)' : 'text-(--theme-muted-text-color)',
              )}
            >
              {o.label}
              {view.orderBy === o.value && <CheckIcon className="h-3 w-3" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function ListFilterMenu<T>({ view, label }: { view: ListView<T>; label?: string }) {
  const t = useStrings().list
  if (view.facets.length === 0) {
    return null
  }
  return (
    <AnchoredPopover
      icon={<FilterIcon className="h-3.5 w-3.5" />}
      label={label ?? t.filter}
      active={view.activeFilterCount > 0}
      shortcut="f"
      panelClassName="w-56 py-1"
    >
      <FilterMenuBody view={view} />
    </AnchoredPopover>
  )
}

/** Single-open submenu prevents overlapping; resets on panel remount so Filter opens clean. */
function FilterMenuBody<T>({ view }: { view: ListView<T> }) {
  const t = useStrings().list
  const [openKey, setOpenKey] = useState<string | null>(null)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const openFacet = (key: string) => {
    clearTimeout(closeTimer.current)
    setOpenKey(key)
  }
  // Brief delay so leaving the row toward its (flush) submenu doesn't drop it.
  const scheduleClose = () => {
    closeTimer.current = setTimeout(() => setOpenKey(null), 160)
  }
  return (
    <>
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-[11px] font-medium uppercase tracking-wide text-(--theme-muted-text-color)">
          {t.filter}
        </span>
        {view.activeFilterCount > 0 && (
          <button
            type="button"
            onClick={view.clearFilters}
            className="text-[12px] text-(--theme-muted-text-color) hover:text-(--theme-app)"
          >
            {t.clear}
          </button>
        )}
      </div>
      {view.facets.map((facet) => (
        <FilterFacetRow
          key={facet.key}
          view={view}
          facet={facet}
          open={openKey === facet.key}
          onEnter={() => openFacet(facet.key)}
          onLeave={scheduleClose}
        />
      ))}
    </>
  )
}

function FilterFacetRow<T>({
  view,
  facet,
  open,
  onEnter,
  onLeave,
}: {
  view: ListView<T>
  facet: FilterFacet<T>
  open: boolean
  onEnter: () => void
  onLeave: () => void
}) {
  const selected = view.filters[facet.key] ?? []

  return (
    <div
      className="relative"
      role="none"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocus={onEnter}
      onBlur={onLeave}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onEnter}
        className="flex w-full cursor-default items-center justify-between gap-3 px-3 py-1.5 text-[13px] text-(--theme-app) hover:bg-(--theme-muted-panel-bg)"
      >
        <span>{facet.label}</span>
        <span className="flex items-center gap-1.5">
          {selected.length > 0 && (
            <span className="text-[11px] text-(--theme-muted-text-color)">{selected.length}</span>
          )}
          <ChevronRightIcon className="h-3 w-3 opacity-60" />
        </span>
      </button>
      {open && (
        <div className={cx('absolute right-full top-0 z-10 max-h-[70vh] overflow-y-auto', FLYOUT)}>
          {facet.options.map((option) => {
            const checked = selected.includes(option.value)
            return (
              <button
                key={option.value}
                type="button"
                onClick={() =>
                  view.setFacetValues(
                    facet.key,
                    checked
                      ? selected.filter((v) => v !== option.value)
                      : [...selected, option.value],
                  )
                }
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-(--theme-app) hover:bg-(--theme-muted-panel-bg)"
              >
                <span className="flex h-3.5 w-3.5 shrink-0 items-center justify-center text-(--theme-link)">
                  {checked && <CheckIcon className="h-3 w-3" />}
                </span>
                {option.icon}
                {option.label}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
