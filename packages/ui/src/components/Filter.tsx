import cx from 'classnames'
import { FilterIcon } from '../icons'

interface FilterPill {
  label: string
  value: string
}

interface FilterProps {
  filter: string
  setFilter: (value: string) => void
  placeholder?: string
  /** Optional filter pills rendered before the search input */
  pills?: FilterPill[]
  activePill?: string
  onPillChange?: (value: string) => void
}

export default function Filter({
  filter,
  setFilter,
  placeholder = 'Filter...',
  pills,
  activePill,
  onPillChange,
}: FilterProps) {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex items-center">
        <input
          placeholder={placeholder}
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value.toLowerCase())}
          className="shadow-sm focus:ring-1 block w-full pr-3 sm:text-sm theme-border rounded-md py-1.5 pl-8"
        />
        <div className="absolute inset-y-0 left-0 flex py-2.5 pl-2">
          <FilterIcon />
        </div>
      </div>
      {pills && onPillChange && (
        <div className="flex gap-1">
          {pills.map((pill) => (
            <button
              key={pill.value}
              type="button"
              onClick={() => onPillChange(pill.value)}
              className={cx(
                'px-2.5 py-1 text-xs rounded-full transition-colors border',
                activePill === pill.value
                  ? 'bg-(--theme-element) text-(--theme-element-text) border-transparent'
                  : 'theme-border theme-text hover:theme-hover',
              )}
            >
              {pill.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
