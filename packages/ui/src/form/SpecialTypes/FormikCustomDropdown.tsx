import cx from 'classnames'
import deepEqual from 'fast-deep-equal'
import { memo, useEffect, useEffectEvent, useRef } from 'react'
import Dropdown from '../../components/Dropdown'
import { isCategory } from '../../components/dropdownUtils'
import type { TSetFormDirty } from '../Form'
import { useFieldControlProps, useFieldRequired } from '../fieldContext'
import { applySecondaryField, findSecondaryOption } from '../utils/secondaryField'

function toComparableOptions(
  options: React.ComponentProps<typeof Dropdown>['options'] | undefined,
) {
  // Strip the unstable icon JSX, but keep disabled: it changes when a field gates an
  // option (e.g. flex-start), and the dropdown must re-render to reflect it.
  return options?.map((option) => {
    if (typeof option === 'string') {
      return option
    }
    if (isCategory(option)) {
      return {
        category: option.category,
        options: option.options.map((o) => {
          const base = { label: o.label, value: o.value, disabled: o.disabled }
          return o.description !== undefined ? { ...base, description: o.description } : base
        }),
      }
    }
    const base = {
      label: option.label,
      value: option.value,
      disabled: option.disabled,
    }
    return option.description !== undefined ? { ...base, description: option.description } : base
  })
}

type FormikCustomDropdownProps = {
  name: string
  ariaLabel?: string | undefined
  options: React.ComponentProps<typeof Dropdown>['options']
  setFormDirty: TSetFormDirty
  onChange?: ((val: string) => void) | undefined
  parentValue?: unknown
  className?: string
  secondaryField?: string | string[] | undefined
  disabled?: boolean
  resetOnChange?: string | boolean | undefined
  loading?: boolean
  invalid?: boolean
  autoselect?: boolean | undefined
  value?: string | undefined
  allowCustomValue?: boolean | undefined
  customValueLabel?: string | undefined
  placeholder?: string
  currentValue: unknown
  setFieldValue: (field: string, value: unknown, shouldValidate?: boolean) => void
  setFieldTouched: (field: string, isTouched?: boolean, shouldValidate?: boolean) => void
}

function arePropsEqual(prev: FormikCustomDropdownProps, next: FormikCustomDropdownProps) {
  for (const key of Object.keys(next) as (keyof FormikCustomDropdownProps)[]) {
    if (key === 'options') {
      if (!deepEqual(toComparableOptions(prev.options), toComparableOptions(next.options))) {
        return false
      }
    } else if (prev[key] !== next[key]) {
      return false
    }
  }
  return true
}

export default memo(function FormikCustomDropdown({
  name,
  ariaLabel,
  options,
  setFormDirty,
  onChange,
  parentValue,
  className,
  secondaryField,
  disabled = false,
  loading = false,
  invalid = false,
  autoselect,
  value,
  allowCustomValue = false,
  customValueLabel,
  placeholder,
  currentValue,
  setFieldValue,
  setFieldTouched,
}: FormikCustomDropdownProps) {
  const required = useFieldRequired()
  const controlProps = useFieldControlProps()
  const prevParentRef = useRef(parentValue)
  const handleChange = (val: unknown) => {
    if (secondaryField && typeof options[0] !== 'string') {
      const option = findSecondaryOption(options, val)
      if (option) {
        applySecondaryField(secondaryField, option.secondaryValue, setFieldValue)
      }
    }

    if (onChange) {
      onChange(val as string)
    }
    setFieldValue(name, val)
    setFieldTouched(name, true)
    setFormDirty(true)
  }

  useEffect(() => {
    prevParentRef.current = parentValue
  })

  const prevOptions = useRef<ReturnType<typeof toComparableOptions> | null>(null)

  const syncAutoselect = useEffectEvent(
    (
      options: FormikCustomDropdownProps['options'],
      autoselect: FormikCustomDropdownProps['autoselect'],
    ) => {
      // Doing this to check if options changed. Dependency array does not work for objects.
      // Icons are stripped before comparison — they're purely visual and contain unstable
      // object references (JSX) that would cause deepEqual to always return false.
      if (deepEqual(prevOptions.current, toComparableOptions(options))) {
        return
      }
      // do not want to autoselect if this is the first render
      // dont want to override preset value
      if (prevOptions.current === null && currentValue !== undefined && currentValue !== null) {
        prevOptions.current = toComparableOptions(options)
        return
      }
      prevOptions.current = toComparableOptions(options)

      if (autoselect === false || !options?.length) {
        return
      }
      if (autoselect === undefined) {
        // We check there is exactly one option in all categories, if so then we autoselect
        if (options.length && isCategory(options[0]!)) {
          let optionCount = 0
          // check if there is exactly one option in all categories
          for (const category of options) {
            if (isCategory(category)) {
              optionCount += category.options.length
            }
            if (optionCount > 1) {
              return
            }
          }
        } else if (options.length !== 1) {
          return
        }
      }

      const exists = options?.find((option) => {
        if (typeof option === 'string') {
          return option === currentValue
        } else if (isCategory(option)) {
          return option.options.some((subOption) => {
            return subOption.value === currentValue
          })
        }
        return option.value === currentValue
      })
      if (!exists || autoselect) {
        let val: unknown
        for (const option of options) {
          if (typeof option === 'string') {
            val = option
            break
          } else if (isCategory(option)) {
            const enabled = option.options.find((o) => !o.disabled)
            if (enabled) {
              val = enabled.value
              break
            }
          } else if (!option.disabled) {
            val = option.value
            break
          }
        }
        if (val !== undefined) {
          handleChange(val)
        }
      }
    },
  )
  useEffect(() => {
    syncAutoselect(options, autoselect)
  }, [options, autoselect])
  return (
    <Dropdown
      {...controlProps}
      textBoxClassName={cx(className, invalid && 'invalid')}
      ariaLabel={ariaLabel}
      required={required}
      onChange={(val) => handleChange(val)}
      value={
        (options?.length === 0 && !allowCustomValue ? value : currentValue) as Parameters<
          typeof Dropdown
        >[0]['value']
      }
      options={options}
      placeholder={placeholder}
      disabled={disabled}
      loading={loading}
      allowCustomValue={allowCustomValue}
      customValueLabel={customValueLabel}
    />
  )
}, arePropsEqual)

export const Testables = { toComparableOptions }
