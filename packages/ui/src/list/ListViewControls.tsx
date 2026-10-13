import { Menu } from '@base-ui/react/menu'
import { Popover } from '@base-ui/react/popover'
import { Toggle } from '@base-ui/react/toggle'
import { clsx as cx } from 'clsx'
import type { ReactNode } from 'react'
import { useEffect, useRef, useState } from 'react'
import { panelClassName, portalContainer, positionerClassName } from '../components/floating'
import { InfoTip } from '../components/InfoTip'
import { MenuCheckboxItem, MenuPopup, MenuSubmenuTrigger } from '../components/Menu'
import { useStrings } from '../components/Provider'
import { Select } from '../components/Select'
import { Switch } from '../components/Switch'
import { useQueryMatch } from '../components/search'
import { Tooltip } from '../components/Tooltip'
import { ChevronDownIcon, ChevronUpIcon, DisplayIcon, FilterIcon } from '../icons'
import type { FilterFacet, ListView } from './listView'
import { isTextEntryContext } from './textEntry'

/** Shared chrome for the toolbar control buttons (Filter, Display, Search) so
 * they read as a consistent button cluster — matched by ListSearchControl. */
export const listControlButtonClasses =
  'relative flex h-7 w-7 items-center justify-center rounded-md border border-(--theme-border) text-(--theme-muted-text-color) hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app) transition-colors'

const activeButtonClassName = 'border-(--theme-link) text-(--theme-app)'

/** A toggle pill, for the Display panel's column and pinned-action pickers. */
const pillClassName =
  'whitespace-nowrap rounded-full border border-(--theme-border) px-2.5 py-1 text-[12px] text-(--theme-muted-text-color) transition-colors hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app) data-pressed:border-transparent data-pressed:bg-(--theme-muted-panel-bg) data-pressed:text-(--theme-app)'

const SECTION_LABEL =
  'mb-2 text-[11px] font-medium uppercase tracking-wide text-(--theme-muted-text-color)'

/** Calls `onPress` on a single key, such as F to filter, unless the key goes to a text field. */
function useShortcutKey(key: string | undefined, onPress: () => void) {
  const press = useRef(onPress)
  press.current = onPress
  useEffect(() => {
    if (!key) {
      return
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.key.toLowerCase() !== key.toLowerCase()) {
        return
      }
      if (isTextEntryContext(e.target)) {
        return
      }
      e.preventDefault()
      press.current()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [key])
}

/** Marks a control whose panel has narrowed or changed the list. */
function ActiveDot() {
  return <span className="absolute right-0 top-0 h-1.5 w-1.5 rounded-full bg-(--theme-link)" />
}

/** A header-strip button that opens a panel under it. The panel is a
 *  non-modal dialog named by the button, not a menu: it holds switches,
 *  pills and text rather than menu items. */
export function AnchoredPopover({
  icon,
  label,
  active,
  shortcut,
  panelClassName: panelClass,
  children,
}: {
  icon: ReactNode
  label: string
  active?: boolean
  /** Single-key shortcut (e.g. 'd') that opens the popover; also shown in the
   * tooltip. */
  shortcut?: string
  panelClassName?: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  useShortcutKey(shortcut, () => setOpen(true))
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Tooltip content={label} shortcut={shortcut?.toUpperCase()} disabled={open}>
        <Popover.Trigger
          aria-label={label}
          className={cx(listControlButtonClasses, active && activeButtonClassName)}
        >
          {icon}
          {active && <ActiveDot />}
        </Popover.Trigger>
      </Tooltip>
      <Popover.Portal container={portalContainer()}>
        <Popover.Positioner
          side="bottom"
          align="end"
          sideOffset={4}
          className={positionerClassName}
        >
          <Popover.Popup aria-label={label} className={cx(panelClassName, panelClass)}>
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
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
          <OptionSelect
            label={t.grouping}
            options={view.groupBys}
            value={view.groupBy}
            onSelect={view.setGroupBy}
          />
        </div>
      )}
      {view.orderBys.length > 0 && (
        <div className={cx('flex items-center justify-between gap-3', hasGrouping && 'mt-2.5')}>
          <span className="text-[13px] text-(--theme-app)">{t.ordering}</span>
          <div className="flex items-center gap-1">
            <Tooltip content={orderDirLabel}>
              <button
                type="button"
                onClick={view.toggleOrderDir}
                aria-label={orderDirLabel}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-(--theme-border) text-(--theme-muted-text-color) hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app)"
              >
                {view.orderDir === 'asc' ? (
                  <ChevronUpIcon className="h-3 w-3" />
                ) : (
                  <ChevronDownIcon className="h-3 w-3" />
                )}
              </button>
            </Tooltip>
            <OptionSelect
              label={t.ordering}
              options={view.orderBys}
              value={view.orderBy}
              onSelect={view.setOrderBy}
            />
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
          size="sm"
          checked={view.showColumnHeaders}
          onCheckedChange={view.toggleColumnHeaders}
          aria-label={t.showColumnHeaders}
        />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-3">
        <span className="text-[13px] text-(--theme-app)">{t.showActions}</span>
        <Switch
          size="sm"
          checked={view.showActions}
          onCheckedChange={view.toggleShowActions}
          aria-label={t.showRowActions}
        />
      </div>
      {view.showActions && (
        <div className="mt-2.5 flex items-center justify-between gap-3 pl-3">
          <span className="text-[13px] text-(--theme-muted-text-color)">{t.alwaysShowActions}</span>
          <Switch
            size="sm"
            checked={view.alwaysShowActions}
            onCheckedChange={view.toggleAlwaysShowActions}
            aria-label={t.alwaysShowRowActions}
          />
        </div>
      )}
      {toggleable.length > 0 && (
        <div className="mt-3 border-t border-(--theme-border) pt-3">
          <div className={SECTION_LABEL}>{t.displayProperties}</div>
          <div className="flex flex-wrap gap-1.5">
            {toggleable.map((c) => (
              <Toggle
                key={c.key}
                pressed={view.isVisible(c.key)}
                onPressedChange={() => view.toggleColumn(c.key)}
                className={pillClassName}
              >
                {c.label}
              </Toggle>
            ))}
          </div>
        </div>
      )}
      {view.showActions && view.actions.length > 0 && (
        <div className="mt-3 border-t border-(--theme-border) pt-3">
          <div className={cx(SECTION_LABEL, 'flex items-center gap-1')}>
            {t.pinnedActions}
            <InfoTip text={t.pinnedActionsHelp} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {view.actions.map((a) => (
              <Toggle
                key={a.key}
                pressed={view.isPinned(a.key)}
                onPressedChange={() => view.togglePinned(a.key)}
                className={pillClassName}
              >
                {a.label}
              </Toggle>
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

/** Single-choice picker for the Display panel's grouping and ordering rows. */
function OptionSelect({
  label,
  options,
  value,
  onSelect,
}: {
  label: string
  options: { value: string; label: string }[]
  value: string
  onSelect: (value: string) => void
}) {
  const t = useStrings().list
  const current = options.find((o) => o.value === value)
  return (
    <Select
      aria-label={label}
      items={options}
      value={value}
      onValueChange={(next) => {
        if (next !== null) {
          onSelect(next)
        }
      }}
      trigger={
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md border border-(--theme-border) px-2 py-1 text-[12px] text-(--theme-app) hover:bg-(--theme-muted-panel-bg)"
        >
          {current?.label ?? t.none}
          <ChevronDownIcon className="h-2.5 w-2.5 opacity-60" />
        </button>
      }
    />
  )
}

/** The Filter button's menu: a submenu for each facet, whose options toggle
 *  without closing it. F opens it. */
export function ListFilterMenu<T>({ view, label }: { view: ListView<T>; label?: string }) {
  const t = useStrings().list
  const [open, setOpen] = useState(false)
  const hasFacets = view.facets.length > 0
  useShortcutKey(hasFacets ? 'f' : undefined, () => setOpen(true))
  if (!hasFacets) {
    return null
  }
  const name = label ?? t.filter
  const active = view.activeFilterCount > 0
  return (
    <Menu.Root open={open} onOpenChange={setOpen}>
      <Tooltip content={name} shortcut="F" disabled={open}>
        <Menu.Trigger
          aria-label={name}
          className={cx(listControlButtonClasses, active && activeButtonClassName)}
        >
          <FilterIcon className="h-3.5 w-3.5" />
          {active && <ActiveDot />}
        </Menu.Trigger>
      </Tooltip>
      <MenuPopup align="end" className="w-56">
        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-(--theme-muted-text-color)">
            {t.filter}
          </span>
          {active && (
            <Menu.Item
              closeOnClick={false}
              onClick={view.clearFilters}
              className="cursor-pointer text-[12px] text-(--theme-muted-text-color) outline-none data-highlighted:text-(--theme-app)"
            >
              {t.clear}
            </Menu.Item>
          )}
        </div>
        {view.facets.map((facet) => (
          <FacetSubmenu key={facet.key} view={view} facet={facet} />
        ))}
      </MenuPopup>
    </Menu.Root>
  )
}

function FacetSubmenu<T>({ view, facet }: { view: ListView<T>; facet: FilterFacet<T> }) {
  const strings = useStrings()
  const matches = useQueryMatch()
  const [query, setQuery] = useState('')
  const selected = view.filters[facet.key] ?? []
  const needle = query.trim()
  // A checked option stays listed while typing, so it can still be unchecked.
  const options = needle
    ? facet.options.filter((o) => selected.includes(o.value) || matches(needle, o.label))
    : facet.options
  const rows = options.map((option) => {
    const checked = selected.includes(option.value)
    return (
      <MenuCheckboxItem
        key={option.value}
        checked={checked}
        closeOnClick={false}
        onCheckedChange={() =>
          view.setFacetValues(
            facet.key,
            checked ? selected.filter((v) => v !== option.value) : [...selected, option.value],
          )
        }
      >
        {option.icon}
        {option.label}
      </MenuCheckboxItem>
    )
  })
  const submenu = (
    <Menu.SubmenuRoot>
      <MenuSubmenuTrigger>
        {facet.label}
        {selected.length > 0 && (
          <span className="ml-auto text-[11px] text-(--theme-muted-text-color)">
            {selected.length}
          </span>
        )}
      </MenuSubmenuTrigger>
      {/* Toward the page, since the Filter button sits at the end of the strip. */}
      <MenuPopup side="inline-start">
        {facet.searchable ? (
          <>
            <div className="sticky top-0 z-[1] border-b border-(--theme-border) bg-(--theme-app-bg) px-3 pb-1.5 pt-0.5">
              <Menu.Input
                placeholder={strings.list.searchOptions}
                aria-label={strings.list.searchOptions}
                className="w-full bg-transparent text-[13px] text-(--theme-app) outline-none placeholder:text-(--theme-muted-text-color)"
              />
            </div>
            <Menu.List>{rows}</Menu.List>
          </>
        ) : (
          rows
        )}
        {options.length === 0 && (
          <div className="px-3 py-1.5 text-[13px] text-(--theme-muted-text-color)">
            {strings.dropdown.noOptionsFound}
          </div>
        )}
      </MenuPopup>
    </Menu.SubmenuRoot>
  )
  // The facet filters its own options, keeping the checked ones in view.
  return facet.searchable ? (
    <Menu.FilterProvider filter={null} value={query} onValueChange={setQuery}>
      {submenu}
    </Menu.FilterProvider>
  ) : (
    submenu
  )
}
