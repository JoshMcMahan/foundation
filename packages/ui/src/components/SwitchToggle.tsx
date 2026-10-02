import { Switch } from '@headlessui/react'
import cx from 'classnames'
import { useEffect, useState } from 'react'
import { TOOLTIP_ID } from './Tooltip'

interface IToggleProps {
  onChange: (value: boolean) => void
  /** Lets a `<label htmlFor>` point at the toggle. */
  id?: string | undefined
  'aria-describedby'?: string | undefined
  value?: boolean
  /** Display label for the on/off positions; defaults to Yes/No. */
  yesLabel?: string
  noLabel?: string
  disabled?: boolean
  datatip?: string | undefined
  invalid?: boolean
}

function SwitchToggle({
  onChange,
  id,
  'aria-describedby': describedBy,
  value = undefined,
  yesLabel = 'Yes',
  noLabel = 'No',
  disabled = false,
  datatip = '',
  invalid = false,
}: IToggleProps) {
  const [enabled, setEnabled] = useState(value ?? false)
  const [isFocused, setIsFocused] = useState(false)

  const setIsEnabled = (e: boolean) => {
    setEnabled(e)
    onChange(e)
  }

  useEffect(() => {
    if (value !== undefined) {
      setEnabled(value)
    }
  }, [value])

  const checked = value ?? enabled

  return (
    <div
      {...(datatip ? { 'data-tooltip-content': datatip, 'data-tooltip-id': TOOLTIP_ID } : {})}
      className={cx(
        'w-[198px] h-[30px] overflow-hidden shadow-sm rounded-md cursor-pointer ring-(--theme-border) ring-1',
        invalid && 'border-red-600 focus:border-red-600 focus:ring-red-500 ring-1 ring-red-500',
        !invalid &&
          isFocused &&
          'ring-1 ring-[rgba(82,168,236,.8)] drop-shadow-[0_1px_2px_rgba(82,168,236,0.8)]',
      )}
    >
      <Switch
        id={id}
        aria-describedby={describedBy}
        checked={checked}
        onChange={setIsEnabled}
        className="text-white text-sm shadow-sm rounded-md cursor-pointer"
        onClick={(e) => e.stopPropagation()}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
      >
        <div
          className={cx(
            checked ? 'translate-x-0' : '-translate-x-[100px]',
            'relative transform flex flex-row  ease-in-out duration-500',
            disabled && 'cursor-not-allowed opacity-50',
          )}
        >
          <div
            className="inline text-center capitalize px-2 py-1 w-[99px] border-0"
            style={{
              background: `linear-gradient(
              to bottom,
              var(--theme-element, #04c) 0%,
              var(--theme-element, #08c) 100%
            )`,
              color: 'var(--theme-element-text, #ffffff)',
            }}
          >
            {yesLabel}
          </div>
          <div className="inline px-2 py-1 h-8 w-[99px] bg-linear-to-b from-white to-[#e6e6e6]" />
          <div className="inline text-center capitalize px-2 py-1 w-[99px] bg-linear-to-b from-[#e6e6e6] to-white bg-[#04c] text-black">
            {noLabel}
          </div>
        </div>
      </Switch>
    </div>
  )
}

export default SwitchToggle
