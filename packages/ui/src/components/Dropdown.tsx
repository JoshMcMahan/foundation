import {
  Combobox,
  ComboboxButton,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
} from '@headlessui/react'
import cx from 'classnames'
import deepEqual from 'fast-deep-equal'
import { type SetStateAction, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { usePopper } from 'react-popper'
import { CaretDownIcon } from '../icons'
import {
  DropdownCaret,
  type FlatDisplayOption,
  flattenDisplayOptions,
  type ICategory,
  type IOptions,
  isCategory,
  toggleSetMember,
} from './dropdownUtils'
import { useStrings } from './Provider'
import { truncationTooltipProps } from './Tooltip'

type PopperState = NonNullable<ReturnType<typeof usePopper>['state']>

const defaultCollapsedLabel = (count: number) => `${count} more`

export interface IProps {
  options: (ICategory | IOptions | string)[]
  onActiveChange?: (option: unknown) => void
  onChange: React.Dispatch<SetStateAction<unknown>>
  value: IOptions | string | Record<string, unknown>
  id?: string | undefined
  ariaLabel?: string | undefined
  'aria-describedby'?: string | undefined
  required?: boolean | undefined
  className?: string
  wrapperClassName?: string
  textBoxClassName?: string
  disabled?: boolean
  placeholder?: string | undefined
  loading?: boolean
  allowCustomValue?: boolean
  customValueLabel?: string | undefined
  /** Label for the toggle row hiding a category's collapsible options. */
  collapsedLabel?: (count: number) => string
  // If provided, the dropdown options will be rendered in a portal element
  portalEl?: HTMLElement
  /** Smaller option rows and text, for dense toolbars. */
  compact?: boolean | undefined
}

// A value missing from the options keeps its object and shows its name when it
// has one, such as a saved resource reference the options no longer list.
function isNamedValue(value: unknown): value is { name: string } {
  return (
    typeof value === 'object' && value !== null && 'name' in value && typeof value.name === 'string'
  )
}

const checkEquals = (val: unknown, opt: unknown) => {
  if (typeof val === 'object' && !Array.isArray(val)) {
    return deepEqual(val, opt)
  }
  return val === opt
}

function getOptionFromValue(value: unknown, options: (ICategory | IOptions | string)[]): IOptions {
  if (value === undefined) {
    return { label: '', value: '' }
  }

  // find option from options
  const found = options.find((option) => {
    if (typeof option === 'string') {
      return checkEquals(value, option)
    } else if (isCategory(option)) {
      return option.options.find((opt) => checkEquals(value, opt.value))
    } else {
      return checkEquals(value, option.value)
    }
  })
  if (found) {
    if (typeof found === 'string') {
      return { label: found, value: found }
    } else if (isCategory(found)) {
      const foundOption = found.options.find((opt) => checkEquals(value, opt.value))
      return foundOption || { label: JSON.stringify(value), value: value }
    } else {
      return found
    }
  }
  const isNamedObject = isNamedValue(value)
  const fallbackLabel =
    typeof value === 'string' ? value : isNamedObject ? value.name : JSON.stringify(value)
  return {
    label: fallbackLabel,
    value: isNamedObject ? value : fallbackLabel,
  }
}

export default function Dropdown(props: IProps) {
  const { onChange, value, options, ...others } = props

  const val = useMemo(() => {
    return getOptionFromValue(value, options)
  }, [value, options])

  const wrapperOnchange = (value: FlatDisplayOption | null) => {
    onChange(value?.value)
  }

  // Transform options that are strings into IOptions format
  const transformedOptions = useMemo(() => {
    return options.map((item) => {
      if (isCategory(item)) {
        return {
          ...item,
          options: item.options.map((opt) => {
            if (typeof opt === 'string') {
              return {
                label: opt,
                value: opt,
              } as IOptions
            }
            return opt
          }),
        }
      } else if (typeof item === 'string') {
        return {
          label: item,
          value: item,
        } as IOptions
      }
      return item
    })
  }, [options])

  return (
    <DropdownHelper
      value={val}
      onChange={wrapperOnchange}
      options={transformedOptions}
      {...others}
    />
  )
}

function ActiveWatcher({
  active,
  onChange,
}: {
  active: FlatDisplayOption | null
  onChange?: ((option: unknown) => void) | undefined
}) {
  const prev = useRef<FlatDisplayOption | null>(null)
  useEffect(() => {
    if (prev.current !== active) {
      onChange?.(active?.value)
      prev.current = active
    }
  }, [active, onChange])
  return null
}

function OptionContent({
  label,
  description,
  icon,
}: {
  label: string
  description: string | undefined
  icon: React.ReactNode
}) {
  return (
    <span
      className={cx('flex gap-1.5', description ? 'items-start min-w-0' : 'items-center truncate')}
      {...truncationTooltipProps(label, (anchor) => anchor.lastElementChild as HTMLElement | null)}
    >
      {icon}
      {description ? (
        <span className="flex flex-col min-w-0">
          <span className="truncate">{label}</span>
          <span className="text-(--theme-muted-text-color) text-xs leading-snug">
            {description}
          </span>
        </span>
      ) : (
        <span className="truncate">{label}</span>
      )}
    </span>
  )
}

function ToggleOption({
  option,
  category,
  expanded,
  onToggle,
  // The virtual list positions rows by cloneElement-injecting style/aria props
  // into whatever the render prop returns; forward them or the row renders
  // unpositioned at the top of the list.
  ...virtualRowProps
}: {
  option: FlatDisplayOption
  category: string
  expanded: boolean
  onToggle: (category: string) => void
} & Omit<React.HTMLAttributes<HTMLElement>, 'onToggle'>) {
  return (
    <ComboboxOption
      {...virtualRowProps}
      data-testid="combobox-toggle"
      value={option}
      className="w-full h-10 flex items-center pl-3"
    >
      <button
        type="button"
        aria-expanded={expanded}
        className="flex items-center gap-1.5 cursor-pointer text-(--theme-muted-text-color) hover:text-(--theme-app)"
        // preventDefault keeps the input focused so the panel stays open; the
        // row is a disabled option, so no selection fires.
        onMouseDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onToggle(category)
        }}
      >
        <CaretDownIcon className={cx('w-3 h-3', !expanded && '-rotate-90')} />
        {option.label}
      </button>
    </ComboboxOption>
  )
}

function DropdownHelper({
  wrapperClassName = 'w-full',
  className,
  textBoxClassName = 'w-full',
  options = [],
  onChange,
  onActiveChange,
  value,
  id,
  ariaLabel,
  'aria-describedby': describedBy,
  required,
  disabled = false,
  placeholder = '',
  loading = false,
  allowCustomValue = false,
  customValueLabel = 'Use',
  collapsedLabel = defaultCollapsedLabel,
  portalEl,
  compact = false,
}: Omit<IProps, 'options' | 'value' | 'onChange'> & {
  options: (ICategory | IOptions)[]
  value: FlatDisplayOption
  onChange: (value: FlatDisplayOption | null) => void
}) {
  const DEBOUNCE_MS = 500
  const t = useStrings().dropdown

  const [query, setQuery] = useState('')
  const [selectedIconWidth, setSelectedIconWidth] = useState(0)
  const selectedIconRef = useCallback((node: HTMLSpanElement | null) => {
    setSelectedIconWidth(node?.offsetWidth ?? 0)
  }, [])
  const selectedIcon = query === '' ? value?.icon : undefined
  const [referenceElement, setReferenceElement] = useState<HTMLElement | null>(null)
  const [popperElement, setPopperElement] = useState<HTMLElement | null>(null)
  const [boundaryEl, setBoundaryEl] = useState<HTMLElement | null>(null)
  useEffect(() => {
    if (!referenceElement) {
      setBoundaryEl(null)
      return
    }
    const ref = referenceElement
    const dialog = ref.closest('[role="dialog"]')
    if (!dialog) {
      setBoundaryEl(null)
      return
    }
    // Walk from reference up to dialog, use nearest scrollable ancestor as
    // popper's boundary so flip/preventOverflow can see the modal panel's
    // bottom edge instead of the viewport's.
    let node: HTMLElement | null = ref.parentElement
    while (node) {
      const style = getComputedStyle(node)
      if (/(auto|scroll|hidden)/.test(`${style.overflowX} ${style.overflowY}`)) {
        setBoundaryEl(node)
        return
      }
      if (node === dialog) {
        break
      }
      node = node.parentElement
    }
    setBoundaryEl(dialog as HTMLElement)
  }, [referenceElement])
  const sameWidthModifier = useMemo(
    () => ({
      name: 'sameWidth',
      enabled: true,
      phase: 'beforeWrite' as const,
      requires: ['computeStyles'],
      fn: ({ state }: { state: PopperState }) => {
        const popperStyles = state.styles['popper']
        if (popperStyles) {
          popperStyles.width = `${state.rects.reference.width}px`
        }
      },
      effect: ({ state }: { state: PopperState }) => {
        const { popper, reference } = state.elements
        if (reference instanceof HTMLElement) {
          popper.style.width = `${reference.offsetWidth}px`
        }
      },
    }),
    [],
  )
  const popperModifiers = useMemo(
    () =>
      boundaryEl
        ? [
            sameWidthModifier,
            { name: 'flip', options: { boundary: boundaryEl } },
            { name: 'preventOverflow', options: { boundary: boundaryEl } },
          ]
        : [sameWidthModifier],
    [boundaryEl, sameWidthModifier],
  )
  const { styles, attributes } = usePopper(referenceElement, popperElement, {
    strategy: 'fixed',
    modifiers: popperModifiers,
  })
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())

  const selectedCategory = useMemo(
    () =>
      options.find(
        (o): o is ICategory =>
          isCategory(o) && o.options.some((opt) => checkEquals(value.value, opt.value)),
      )?.category,
    [options, value],
  )

  // Each selection change leaves only that selection's category expanded, so the
  // selection never hides behind a toggle row. Recorded only once the category
  // resolves (options can load after the value) and gated on real selection
  // changes so refetches don't re-expand a category the user collapsed.
  const lastAutoExpandedValue = useRef<unknown>(undefined)
  useEffect(() => {
    if (!selectedCategory || checkEquals(lastAutoExpandedValue.current, value.value)) {
      return
    }
    lastAutoExpandedValue.current = value.value
    setExpandedCategories((prev) =>
      prev.size === 1 && prev.has(selectedCategory) ? prev : new Set([selectedCategory]),
    )
  }, [selectedCategory, value])

  const toggleCategory = (category: string) =>
    setExpandedCategories((prev) => toggleSetMember(prev, category))

  const flushCustomValue = useCallback(
    (val: string) => {
      onChange({ label: val, value: val })
    },
    [onChange],
  )

  const onQueryChange = (val: string) => {
    // Update query immediately for responsive filtering
    setQuery(val)

    if (allowCustomValue) {
      // Debounce the onChange callback (same pattern as FormikCustomInput)
      if (debounceRef.current) {
        clearTimeout(debounceRef.current)
      }
      debounceRef.current = setTimeout(() => {
        flushCustomValue(val)
        debounceRef.current = null
      }, DEBOUNCE_MS)
    }
  }

  const onInputBlur = () => {
    // Flush any pending debounce immediately on blur. The ref doubles as
    // "fire is pending" — null after a timer fires or after we cancel it,
    // so blurs that happen post-fire or post-selection don't re-flush.
    if (allowCustomValue && debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
      flushCustomValue(query)
    }
    setQuery('')
  }

  const onComboboxChange = (val: FlatDisplayOption | null) => {
    // Selecting an option cancels any pending custom-value flush so the
    // timer can't fire after selection and overwrite the chosen value.
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    onChange(val)
  }

  const flattenedOptions = useMemo<FlatDisplayOption[]>(
    () =>
      flattenDisplayOptions({
        options,
        query,
        expandedCategories,
        collapsedLabel,
        selectedValue: value?.value,
        allowCustomValue,
        customValueLabel,
      }),
    [options, query, expandedCategories, collapsedLabel, value, allowCustomValue, customValueLabel],
  )

  const comboOptions = (
    <ComboboxOptions
      // Modal mode inerts everything outside, including Save changes.
      modal={false}
      ref={setPopperElement}
      style={styles['popper']}
      className={cx(
        'bg-(--theme-input-bg) border-(--theme-border) text-(--theme-app) max-h-60! empty:invisible border overflow-auto rounded-md shadow-lg focus:outline-hidden z-9999 data-[popper-reference-hidden=true]:invisible data-[popper-reference-hidden=true]:pointer-events-none',
        compact ? 'text-xs' : 'sm:text-sm',
      )}
      {...attributes['popper']}
    >
      {({ option }) => {
        const optionLabel = typeof option === 'string' ? option : option.label
        const optionDescription = typeof option !== 'string' ? option.description : undefined
        const isCategoryRow = typeof option !== 'string' && Boolean(option.category)
        const toggleTarget = typeof option !== 'string' ? option.toggle : undefined
        const isPinned = typeof option !== 'string' && Boolean(option.pinned)
        if (toggleTarget !== undefined) {
          return (
            <ToggleOption
              option={option}
              category={toggleTarget}
              expanded={expandedCategories.has(toggleTarget)}
              onToggle={toggleCategory}
            />
          )
        }
        return (
          <ComboboxOption
            data-testid="combobox-option"
            value={option}
            className={cx(
              'w-full group relative flex',
              optionDescription ? 'min-h-10 py-2' : compact ? 'h-8' : 'h-10',
              isCategoryRow
                ? 'text-[14px] font-bold pl-1 items-center'
                : 'data-disabled:text-(--theme-muted-text-color) data-disabled:bg-(--theme-muted-panel-bg) data-disabled:cursor-not-allowed cursor-pointer items-center pr-9 pl-3 leading-5 data-focus:bg-(--theme-muted-panel-bg) data-focus:text-(--theme-app) data-focus:outline-hidden',
              'data-selected:border-l-2 data-selected:border-(--theme-link) data-selected:bg-(--theme-muted-panel-bg) data-selected:text-(--theme-app)',
              isPinned && 'border-t border-(--theme-border) font-medium',
            )}
          >
            <OptionContent
              label={optionLabel}
              description={optionDescription}
              icon={typeof option !== 'string' && option.icon}
            />
          </ComboboxOption>
        )
      }}
    </ComboboxOptions>
  )

  return (
    <div className={cx('relative rounded-md flex items-center', wrapperClassName)}>
      <Combobox
        data-testid="combobox"
        className={cx('relative w-full', className)}
        as="div"
        by={checkEquals}
        value={value}
        onChange={onComboboxChange}
        onClose={() => {
          setQuery('')
          // Discard the session's expansions; the selection's category is
          // re-expanded by the effect above.
          setExpandedCategories(new Set(selectedCategory ? [selectedCategory] : []))
        }}
        immediate
        virtual={{
          options: flattenedOptions,
          disabled: (option: FlatDisplayOption) => Boolean(option.disabled),
        }}
        disabled={disabled}
      >
        {({ activeOption, open }) => (
          <>
            {onActiveChange && <ActiveWatcher active={activeOption} onChange={onActiveChange} />}

            {selectedIcon && (
              <span
                key={value.label}
                ref={selectedIconRef}
                className="pointer-events-none absolute inset-y-0 left-3 z-10 flex items-center"
              >
                {selectedIcon}
              </span>
            )}
            <ComboboxInput
              id={id}
              aria-label={ariaLabel || undefined}
              aria-describedby={describedBy}
              aria-required={required || undefined}
              placeholder={loading ? 'Loading...' : placeholder}
              onBlur={onInputBlur}
              ref={setReferenceElement}
              // Reopen the panel when clicking the (already-focused) input.
              // Guard on `open` so a first click doesn't toggle the panel right back closed.
              onClick={() => {
                if (!open) {
                  buttonRef.current?.click()
                }
              }}
              style={
                selectedIcon && selectedIconWidth > 0
                  ? { paddingLeft: selectedIconWidth + 18 }
                  : undefined
              }
              className={cx(
                'placeholder:text-xs bg-(--theme-input-bg) border-(--theme-border) text-(--theme-app) focus:border-(--theme-element) focus:outline-none focus:ring-1 focus:ring-(--theme-element) w-full h-full text-ellipsis pr-8',
                'disabled:bg-(--theme-input-disabled-bg) disabled:text-(--theme-input-disabled-text) disabled:cursor-not-allowed',
                textBoxClassName,
              )}
              //disables chrome autocomplete
              autoComplete="off"
              onChange={(event) => onQueryChange(event.target.value)}
              displayValue={(opt) => {
                // @ts-expect-error // combobox does not know the type of opt
                return opt?.label?.replaceAll('"', '') || query || ''
              }}
              disabled={disabled}
            />
            <ComboboxButton
              ref={buttonRef}
              aria-label={t.showOptions}
              className="absolute inset-y-0 right-0 flex items-center pr-3 disabled:cursor-not-allowed"
              data-testid="combobox-button"
              disabled={disabled}
            >
              <DropdownCaret />
            </ComboboxButton>
            {/* Portal to .ds-root when available so dropdowns inherit design system CSS variables,
               otherwise fall back to document.body */}
            {typeof document !== 'undefined' &&
              createPortal(
                comboOptions,
                portalEl ?? document.querySelector('.ds-root') ?? document.body,
              )}
          </>
        )}
      </Combobox>
    </div>
  )
}
