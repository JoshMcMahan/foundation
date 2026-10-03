import { Combobox, ComboboxButton, ComboboxOption, ComboboxOptions } from '@headlessui/react'
import cx from 'classnames'
import { useMemo, useState } from 'react'
import { usePopper } from 'react-popper'
import {
  DropdownCaret,
  filterOption,
  flattenOptions,
  type ICategory,
  type IOptions,
  isCategory,
  isOption,
} from './dropdownUtils'
import { focusOnMount } from './focus'
import { keyedByContent } from './keys'
import { useStrings } from './Provider'

type MultiSelectDropdownProps<T = string> = {
  options: (ICategory<T> | IOptions<T> | string)[]
  value: T[]
  onChange: (next: T[]) => void
  id?: string | undefined
  'aria-labelledby'?: string | undefined
  'aria-describedby'?: string | undefined
  required?: boolean
  className?: string
  wrapperClassName?: string
  textBoxClassName?: string | undefined
  disabled?: boolean
  placeholder?: string | undefined
  loading?: boolean
  searchable?: boolean
  maxTagCount?: number
  /** Custom comparator for object values. Defaults to strict equality. */
  compareBy?: ((a: T, b: T) => boolean) | undefined
}

const strictEqual = (a: unknown, b: unknown) => a === b

export default function MultiSelectDropdown<T = string>({
  options,
  value,
  onChange,
  id,
  'aria-labelledby': labelledBy,
  'aria-describedby': describedBy,
  required,
  className,
  wrapperClassName = 'w-full',
  textBoxClassName,
  disabled = false,
  placeholder,
  loading = false,
  searchable = true,
  maxTagCount = 2,
  compareBy,
}: MultiSelectDropdownProps<T>) {
  const strings = useStrings()
  const [query, setQuery] = useState('')
  const [referenceEl, setReferenceEl] = useState<HTMLDivElement | null>(null)
  const [popperEl, setPopperEl] = useState<HTMLElement | null>(null)

  const { styles, attributes } = usePopper(referenceEl, popperEl, {
    placement: 'bottom-start',
    modifiers: [
      {
        name: 'offset',
        options: { offset: [0, 4] },
      },
    ],
  })

  const allOptions = useMemo(() => flattenOptions(options), [options])

  const compare = compareBy ?? strictEqual

  const selectedOptions = useMemo(() => {
    const result: IOptions<T>[] = []
    for (const val of value) {
      const found = allOptions.find((opt) => isOption(opt) && compare(opt.value, val)) as
        | IOptions<T>
        | undefined
      if (found) {
        result.push(found)
      }
    }
    return result
  }, [value, allOptions, compare])

  const filteredOptions = useMemo(() => {
    if (!searchable || query.trim() === '') {
      return allOptions
    }
    const result: (IOptions<T> | ICategory<T>)[] = []
    for (const opt of allOptions) {
      if (isCategory(opt)) {
        const matchedChildren = opt.options.filter((o) => filterOption(o, query))
        if (matchedChildren.length > 0) {
          result.push(opt, ...matchedChildren)
        }
      } else if (isOption(opt) && filterOption(opt, query)) {
        result.push(opt)
      }
    }
    return result
  }, [allOptions, query, searchable])

  // Overflow past maxTagCount collapses into a +N badge that stays visible while labels truncate, keeping the trigger one line.
  const display = useMemo(() => {
    const shown = selectedOptions.slice(0, maxTagCount)
    return {
      label: shown.map((o) => o.label).join(', '),
      overflow: selectedOptions.length - shown.length,
    }
  }, [selectedOptions, maxTagCount])

  const isDisabled = disabled || loading

  const isEmpty = filteredOptions.length === 0
  return (
    <Combobox
      multiple
      value={Array.isArray(value) ? value : []}
      onChange={onChange}
      disabled={isDisabled}
      onClose={() => setQuery('')}
      by={compare}
    >
      {({ open }) => (
        <div ref={setReferenceEl} className={cx('relative', wrapperClassName)}>
          <ComboboxButton
            as="div"
            id={id}
            aria-labelledby={labelledBy}
            aria-describedby={describedBy}
            aria-required={required || undefined}
            className={cx(
              'theme-input flex items-center cursor-pointer rounded border text-[14px] w-full px-2 pr-8 py-1 min-h-[30px] overflow-hidden',
              isDisabled && 'opacity-50 cursor-not-allowed',
              textBoxClassName,
              className,
            )}
          >
            {loading ? (
              <span className="theme-muted-text">{strings.loading}</span>
            ) : selectedOptions.length > 0 ? (
              <>
                <span className="min-w-0 truncate">{display.label}</span>
                {display.overflow > 0 && (
                  <span className="ml-1 shrink-0 theme-muted-text">+{display.overflow}</span>
                )}
              </>
            ) : (
              <span className="theme-muted-text truncate">{placeholder}</span>
            )}
          </ComboboxButton>
          <DropdownCaret />

          {open && (
            <ComboboxOptions
              // Modal mode inerts everything outside, including Save changes.
              modal={false}
              ref={setPopperEl}
              static
              data-testid="msd-list"
              style={styles['popper']}
              {...attributes['popper']}
              className="theme-panel z-10 max-h-60 w-full overflow-auto rounded-md shadow-lg focus:outline-none"
            >
              {searchable && (
                <div className="sticky top-0 theme-panel p-2 border-b z-10">
                  <input
                    placeholder={placeholder}
                    data-1p-ignore
                    autoComplete="off"
                    type="text"
                    className="theme-input w-full"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    ref={focusOnMount}
                  />
                </div>
              )}

              <div className="py-1">
                {isEmpty ? (
                  <div className="px-4 py-2 text-sm theme-muted-text">
                    {strings.dropdown.noOptionsFound}
                  </div>
                ) : (
                  keyedByContent(filteredOptions, (o) =>
                    isCategory(o)
                      ? `category-${o.category ?? 'uncat'}`
                      : `option-${String((o as IOptions<T>).value)}`,
                  ).map(({ key, item: opt }) => {
                    if (isCategory(opt)) {
                      return (
                        <li
                          role="presentation"
                          key={key}
                          className="px-4 py-2 text-sm font-bold theme-muted-text"
                        >
                          {opt.category}
                        </li>
                      )
                    }
                    const option = opt as IOptions<T>
                    return (
                      <ComboboxOption
                        key={key}
                        value={option.value}
                        disabled={option.disabled ?? false}
                        data-testid={`msd-option-${String(option.value)}`}
                        className={({ focus }) =>
                          cx(
                            'relative cursor-pointer select-none py-2 pl-10 pr-4 text-sm',
                            focus && 'theme-hover',
                            option.disabled && 'cursor-not-allowed opacity-50',
                          )
                        }
                      >
                        {({ selected }) => (
                          <div className="flex items-center">
                            <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                              <input
                                autoComplete="off"
                                type="checkbox"
                                checked={selected}
                                readOnly
                                tabIndex={-1}
                                className="h-4 w-4 cursor-pointer"
                                aria-hidden="true"
                              />
                            </span>
                            {option.icon && (
                              <span className="mr-2 flex items-center">{option.icon}</span>
                            )}
                            <div className="flex flex-col">
                              <span className="block truncate">{option.label}</span>
                            </div>
                          </div>
                        )}
                      </ComboboxOption>
                    )
                  })
                )}
              </div>
            </ComboboxOptions>
          )}
        </div>
      )}
    </Combobox>
  )
}
