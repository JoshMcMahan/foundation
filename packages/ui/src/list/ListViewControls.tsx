import { Menu } from '@base-ui/react/menu'
import { Toggle } from '@base-ui/react/toggle'
import { useState } from 'react'
import { IconButton } from '../components/IconButton'
import { InfoTip } from '../components/InfoTip'
import { MenuCheckboxItem, MenuPopup, MenuSubmenuTrigger } from '../components/Menu'
import { Popover } from '../components/Popover'
import { useStrings } from '../components/Provider'
import { Select } from '../components/Select'
import { Switch } from '../components/Switch'
import { useQueryMatch } from '../components/search'
import { Tooltip } from '../components/Tooltip'
import { cx } from '../cx'
import { ChevronDownIcon, ChevronUpIcon, DisplayIcon, FilterIcon } from '../icons'
import { AddFilterMenu } from './ListFilterBar'
import type { FilterFacet, ListView } from './listView'
import type { ListFilters } from './useListFilters'

/** A toggle pill, for the Display panel's column and pinned-action pickers. */
const pillClassName =
  'whitespace-nowrap rounded-full border border-(--theme-border) px-2.5 py-1 text-[12px] text-(--theme-muted-text-color) transition-colors hover:bg-(--theme-muted-panel-bg) hover:text-(--theme-app) data-pressed:border-transparent data-pressed:bg-(--theme-muted-panel-bg) data-pressed:text-(--theme-app)'

const SECTION_LABEL =
  'mb-2 text-[11px] font-medium uppercase tracking-wide text-(--theme-muted-text-color)'

export function ListDisplayMenu<T>({ view, label }: { view: ListView<T>; label?: string }) {
  const { common, list: t } = useStrings()
  const toggleable = view.columns.filter((c) => !c.alwaysVisible)
  const hasGrouping = view.groupBys.length > 0
  const orderDirLabel = view.orderDir === 'asc' ? t.ascending : t.descending
  return (
    <Popover
      aria-label={label ?? t.displayOptions}
      align="end"
      className="w-72"
      trigger={
        <IconButton variant="outline" icon={<DisplayIcon />} label={label ?? t.displayOptions} />
      }
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
            {common.reset}
          </button>
        </div>
      )}
    </Popover>
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
      onValueChange={onSelect}
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

/** The toolbar's Filter button, which F presses. Beside a chip row (`ListFilterBar`, which
 *  `ListPage` shows), it opens the Add filter menu: picking a field adds its chip and opens its
 *  value picker there. Without one, it keeps a submenu of values for each facet. */
export function ListFilterMenu<T>({
  view,
  filters,
  label,
}: {
  view?: ListView<T> | undefined
  /** For a page whose filters come from `useListFilters` rather than a list view. */
  filters?: ListFilters | undefined
  label?: string
}) {
  const { common, filters: t } = useStrings()
  const state = filters ?? view?.filterState
  if (!state || state.fields.length === 0) {
    return null
  }
  const active = state.count > 0
  const button = (
    <IconButton
      variant="outline"
      icon={<FilterIcon />}
      label={label ?? t.filterButton(state.count)}
      dot={active}
      shortcut="f"
    />
  )
  if (state.barMounted) {
    return <AddFilterMenu filters={state} trigger={button} align="end" />
  }
  if (!view || view.facets.length === 0) {
    return null
  }
  return (
    <Menu.Root>
      <Menu.Trigger render={button} />
      <MenuPopup align="end" className="w-56">
        <div className="flex items-center justify-between px-3 py-1">
          <span className="text-[11px] font-medium uppercase tracking-wide text-(--theme-muted-text-color)">
            {common.filter}
          </span>
          {active && (
            <Menu.Item
              closeOnClick={false}
              onClick={view.clearFilters}
              className="cursor-pointer text-[12px] text-(--theme-muted-text-color) outline-none data-highlighted:text-(--theme-app)"
            >
              {common.clear}
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
                className="w-full bg-transparent text-[13px] text-(--theme-app) outline-none placeholder:text-(--theme-placeholder)"
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
