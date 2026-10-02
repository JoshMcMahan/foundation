import {
  Listbox,
  ListboxButton,
  ListboxOption,
  ListboxOptions,
  Transition,
} from '@headlessui/react'
import cx from 'classnames'
import { type RefObject, useEffect, useRef, useState } from 'react'
import { AngleDownIcon } from '../icons'
import { focusOnMount } from './focus'
import { keyedByContent } from './keys'
import { useStrings } from './Provider'

interface ICustomListboxProps<T> {
  /** Only used visually to inform what you're selecting */
  type: string
  options: {
    label: string
    secondaryLabel?: string
    icon?: React.ReactNode
    value: T
    selected: boolean
  }[]
  closeOnSelect?: boolean
  allowSearch?: boolean
  handleOptionSelected: (value: T) => void
  className?: string
  invalid?: boolean
  required?: boolean
  id?: string | undefined
  'aria-describedby'?: string | undefined
}

export default function CustomListbox<T>({
  options = [],
  handleOptionSelected,
  type,
  allowSearch = false,
  closeOnSelect = true,
  className = '',
  invalid = false,
  required = false,
  id,
  'aria-describedby': describedBy,
}: ICustomListboxProps<T>) {
  const { dropdown: strings } = useStrings()
  const [filter, setFilter] = useState('')
  const [controlledOpen, setControlledOpen] = useState(false)

  const optionsToShow = options.filter(
    (option) =>
      !option.selected && option.label && option.label.toLowerCase().includes(filter.toLowerCase()),
  )

  function useOutsideAlerter(ref: RefObject<HTMLElement | null>) {
    useEffect(() => {
      // Make Dropdown dissapear when clicked outside of it
      function handleClickOutside(event: MouseEvent) {
        if (ref.current && event.target instanceof Node && !ref.current.contains(event.target)) {
          setControlledOpen(false)
          setFilter('')
        }
      }

      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }, [ref])
  }

  const wrapperRef = useRef(null)
  useOutsideAlerter(wrapperRef)

  const optionsElement = (
    <ListboxOptions
      // Modal mode inerts everything outside, including Save changes.
      modal={false}
      static
      className="absolute w-full py-1 z-50 theme-input rounded-md"
    >
      {allowSearch && (
        <div className="pl-2 pr-4 mb-1">
          <input
            autoComplete="off"
            type="search"
            ref={focusOnMount}
            onChange={(e) => setFilter(e.target.value)}
            value={filter}
            className="w-full p-1 theme-input"
            onKeyDown={(e) => {
              const allowedHeadlessUIKeys = [
                'ArrowUp',
                'ArrowDown',
                'Enter',
                'Home',
                'End',
                'Escape',
              ]
              if (!allowedHeadlessUIKeys.includes(e.key)) {
                e.stopPropagation()
              }
            }}
          />
        </div>
      )}
      <div className="overflow-auto max-h-60 theme-panel">
        {optionsToShow.length > 0 ? (
          keyedByContent(optionsToShow, (o) => String(o.value)).map(({ key, item: option }) => (
            <ListboxOption
              key={key}
              className="relative hover:theme-hover select-none pl-2 pr-4"
              value={option.value}
            >
              <div className="w-full flex flex-row">
                <div className="w-3/4 py-2 flex items-center">
                  <div className="w-4 h-6 btn btn-info text-xl line-height-0 mr-2">+</div>
                  {option.icon && <span className="mr-2 flex items-center">{option.icon}</span>}
                  <span className="mr-2">{option.label}</span>
                  <span className="italic">{option.secondaryLabel}</span>
                </div>
              </div>
            </ListboxOption>
          ))
        ) : (
          <div className="w-full flex flex-row">
            <div className="w-3/4 py-2 pl-2 capitalize flex items-center">
              {filter === '' ? `All ${type} Added` : `No ${type} Found`}
            </div>
          </div>
        )}
      </div>
    </ListboxOptions>
  )

  return (
    <Listbox
      as="div"
      className={cx('relative mt-1 theme-input border theme-border rounded-md', className)}
      ref={wrapperRef}
      onChange={handleOptionSelected}
    >
      <ListboxButton
        id={id}
        aria-describedby={describedBy}
        aria-required={required || undefined}
        onClick={() => setControlledOpen((prev) => !prev)}
        className={cx(
          'relative w-full py-2 pl-3 text-left',
          invalid && 'border-red-600 focus:border-red-600 focus:ring-red-500',
        )}
      >
        <span className="block truncate">{strings.select(type)}</span>
        <span className="pointer-events-none absolute inset-y-0 right-0 flex items-center justify-items-center">
          <AngleDownIcon className="h-5 w-8" aria-hidden="true" />
        </span>
      </ListboxButton>
      {closeOnSelect ? (
        <Transition
          leave="transition ease-in duration-100"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          {optionsElement || null}
        </Transition>
      ) : (
        <>{controlledOpen && optionsElement}</>
      )}
    </Listbox>
  )
}
