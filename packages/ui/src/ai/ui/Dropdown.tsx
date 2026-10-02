import cx from 'classnames'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { TOOLTIP_ID } from '../../components/Tooltip'
import { ChevronDownIcon } from '../../icons'

/** Matches the list's max-h-60, so the flip decision matches what renders. */
const MAX_LIST_HEIGHT_PX = 240

export interface DropdownOption {
  label: string
  value: string
  /** A second line under the label, for choices that need explaining. */
  description?: string
  /** Rendered as a plain option; the trailing checkmark and bold never apply. */
  muted?: boolean
}

interface DropdownProps {
  options: DropdownOption[]
  value: string
  onChange: (value: string) => void
  placeholder?: string
  disabled?: boolean
  /** 'bare' drops the input background and text colour, for a trigger that
   *  reads as a chip or as toolbar text. */
  variant?: 'default' | 'bare'
  /** Leading content in the trigger, before the label. */
  icon?: ReactNode
  /** Shown in the trigger instead of the selected option's label. */
  valueLabel?: string
  ariaLabel?: string
  /** Tooltip on the closed trigger. */
  hint?: string
  wrapperClassName?: string
  textBoxClassName?: string
  listClassName?: string
}

export default function Dropdown({
  options,
  value,
  onChange,
  placeholder = '',
  disabled = false,
  variant = 'default',
  icon,
  valueLabel,
  ariaLabel,
  hint,
  wrapperClassName,
  textBoxClassName,
  listClassName,
}: DropdownProps) {
  const [open, setOpen] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const [position, setPosition] = useState({
    top: 0,
    bottom: 0,
    left: 0,
    width: 0,
    flipped: false,
  })

  const updatePosition = useCallback(() => {
    const rect = wrapperRef.current?.getBoundingClientRect()
    if (!rect) {
      return
    }
    // Anchoring the list's bottom above a low trigger lets it grow upward on
    // its own, with no height to measure first.
    const below = window.innerHeight - rect.bottom
    const flipped = below < MAX_LIST_HEIGHT_PX && rect.top > below
    setPosition({
      top: rect.bottom + 4,
      bottom: window.innerHeight - rect.top + 4,
      left: rect.left,
      width: rect.width,
      flipped,
    })
  }, [])

  useEffect(() => {
    if (!open) {
      return
    }
    updatePosition()
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (!wrapperRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setOpen(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', updatePosition, true)
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', updatePosition, true)
      window.removeEventListener('resize', updatePosition)
    }
  }, [open, updatePosition])

  const selected = options.find((o) => o.value === value)
  const shown = valueLabel ?? selected?.label
  const tooltip =
    hint && !open ? { 'data-tooltip-id': TOOLTIP_ID, 'data-tooltip-content': hint } : {}

  return (
    <div ref={wrapperRef} className={cx('relative', wrapperClassName)}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        {...tooltip}
        className={cx(
          'flex items-center justify-between gap-2 cursor-pointer',
          variant === 'default' && 'bg-(--theme-input-bg,#f9fafb) text-(--theme-input,#000000)',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          textBoxClassName ||
            'text-sm border border-(--theme-border,#d1d5db) rounded px-2 py-1.5 w-full',
        )}
      >
        {icon}
        <span className={cx('truncate', !shown && 'text-(--theme-muted-text-color,#6c757d)')}>
          {shown || placeholder}
        </span>
        <ChevronDownIcon className="h-3 w-3 shrink-0 opacity-60" />
      </button>
      {open &&
        // Portaled with fixed positioning so the list isn't clipped by
        // overflow containers (both chat call sites live inside a modal).
        createPortal(
          <ul
            ref={listRef}
            style={{
              position: 'fixed',
              ...(position.flipped ? { bottom: position.bottom } : { top: position.top }),
              left: position.left,
              minWidth: position.width,
              zIndex: 300,
            }}
            className={cx(
              'max-h-60 overflow-auto rounded-md border border-(--theme-border,#e5e7eb) bg-(--theme-panel-bg,#ffffff) py-1 shadow-lg',
              listClassName,
            )}
          >
            {options.map((option) => (
              <li key={option.value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(option.value)
                    setOpen(false)
                  }}
                  className={cx(
                    'w-full cursor-pointer px-3 py-1.5 text-left text-sm hover:bg-(--theme-hover,#f3f4f6)',
                    option.muted
                      ? 'text-(--theme-muted-text-color,#6c757d)'
                      : 'text-(--theme-panel,#000000)',
                    option.value === value && !option.muted && 'font-semibold',
                  )}
                >
                  <span className="block truncate">{option.label}</span>
                  {option.description && (
                    <span className="mt-0.5 block text-xs font-normal leading-snug text-(--theme-muted-text-color,#6c757d)">
                      {option.description}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>,
          document.body,
        )}
    </div>
  )
}
