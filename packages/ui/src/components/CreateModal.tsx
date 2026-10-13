import { Button } from '@base-ui/react/button'
import { Toggle } from '@base-ui/react/toggle'
import { clsx as cx } from 'clsx'
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDownIcon, ChevronRightIcon, FavoriteIcon, FavoriteOutlineIcon } from '../icons'
import { ActionMenu } from './ActionMenu'
import { Autocomplete, Combobox } from './Combobox'
import { type ComboboxItems, comboboxLeaves } from './comboboxItems'
import { ghostButtonClasses, primaryButtonClasses } from './ghostButton'
import { InfoTip } from './InfoTip'
import type { MenuEntry } from './MenuEntries'
import { Modal } from './Modal'
import { useStrings } from './Provider'
import { Switch } from './Switch'
import { Tooltip } from './Tooltip'

interface CreateModalProps {
  open: boolean
  onClose: () => void
  typeIcon?: ReactNode
  typeLabel: string
  /** Makes the type chip a dropdown to switch between sibling form types. */
  typeMenu?: MenuEntry[] | undefined
  namePlaceholder: string
  hideName?: boolean
  initialName?: string | undefined
  showDescription?: boolean
  descriptionPlaceholder?: string
  submitLabel?: string
  submittingLabel?: string
  validateName?: ((name: string) => string | null) | undefined
  /** Normalize the name as the user types (e.g. strip disallowed characters). */
  sanitizeName?: (name: string) => string
  nameHint?: ((name: string) => ReactNode) | undefined
  children?: ReactNode
  properties?: ReactNode
  advanced?: ReactNode
  submitDisabled?: boolean
  /** Hide the primary submit button and label the dismiss button "Close". */
  hideSubmit?: boolean
  nameOptional?: boolean
  onNameChange?: (name: string) => void
  /** Additional unsaved input in `children`/`properties` that should block an
   * accidental dismiss (name/description/favorite are already tracked). */
  dirty?: boolean
  /** Show a favorite toggle in the footer. */
  showFavorite?: boolean
  /** Resolves true to close the modal, false to keep it open (e.g. on error). */
  onSubmit: (name: string, description: string, favorite: boolean) => Promise<boolean>
}

/** Submits on Enter in the name field or ⌘/Ctrl+Enter from anywhere in the panel. */
export function CreateModal({
  open,
  onClose,
  typeIcon,
  typeLabel,
  typeMenu,
  namePlaceholder,
  hideName = false,
  initialName,
  showDescription = true,
  descriptionPlaceholder,
  submitLabel,
  submittingLabel,
  validateName,
  sanitizeName,
  nameHint,
  children,
  properties,
  advanced,
  submitDisabled = false,
  hideSubmit = false,
  nameOptional = false,
  onNameChange,
  dirty = false,
  showFavorite = false,
  onSubmit,
}: CreateModalProps) {
  const t = useStrings().modal
  const submitText = submitLabel ?? t.create
  const submittingText = submittingLabel ?? t.creating
  const descriptionText = descriptionPlaceholder ?? t.addDescription

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [favorite, setFavorite] = useState(false)
  const [nameFlash, setNameFlash] = useState(false)
  const [nameTouched, setNameTouched] = useState(false)
  const [interacted, setInteracted] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setName(initialName ?? '')
      setDescription('')
      setSubmitting(false)
      setAdvancedOpen(false)
      setFavorite(false)
      setNameTouched(false)
      setInteracted(false)
    }
  }, [open, initialName])

  const nameError = name.trim() ? (validateName?.(name.trim()) ?? null) : null
  const hint = !nameError && name.trim() ? nameHint?.(name.trim()) : null
  const canSubmit =
    (hideName || nameOptional || name.trim().length > 0) &&
    !nameError &&
    !submitting &&
    !submitDisabled

  const isDirty =
    !submitting &&
    (interacted || name !== (initialName ?? '') || description !== '' || favorite || dirty)

  // Red-ring the required name once the user has moved past it: blurred it
  // empty, entered other content, or tried to submit without it.
  const nameMissing =
    !hideName &&
    !nameOptional &&
    (!name.trim() || !!nameError) &&
    (nameTouched || description !== '' || favorite || dirty)

  const flashName = () => {
    setNameTouched(true)
    nameRef.current?.focus()
    setNameFlash(false)
    requestAnimationFrame(() => setNameFlash(true))
  }

  const handleSubmit = async () => {
    if (!canSubmit) {
      if (!hideName && !submitting && (!name.trim() || nameError)) {
        flashName()
      }
      return
    }
    setSubmitting(true)
    let close = false
    // A throwing onSubmit is treated like a false result: consumers surface
    // their own errors, and letting it escape would leave the button stuck on
    // its submitting label with no way back.
    try {
      close = await onSubmit(name.trim(), description.trim(), favorite)
    } catch (error) {
      console.error(error)
    } finally {
      if (!close) {
        setSubmitting(false)
      }
    }
    if (close) {
      onClose()
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      aria-label={`${submitText}: ${typeLabel}`}
      className="w-[560px] max-w-full flex flex-col max-h-full"
      dismissible={!isDirty}
      // The name, ahead of the type chip; a form without one starts at its first control.
      initialFocus={() => nameRef.current ?? true}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          handleSubmit()
        }
      }}
      onMouseDown={(e) => {
        // Keep the caret in the focused field when clicking non-interactive
        // panel areas (the borderless name input has no other affordance).
        // Selectable text is exempt: preventDefault would stop a selection
        // from ever starting there.
        if (
          e.target instanceof Element &&
          !e.target.closest('input, textarea, button, a, select, label, code, pre, .select-all')
        ) {
          e.preventDefault()
        }
      }}
    >
      <div
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain"
        onChangeCapture={() => setInteracted(true)}
      >
        <div className="px-4 pt-4">
          {typeMenu && typeMenu.length > 0 ? (
            <ActionMenu
              items={typeMenu}
              label={typeLabel}
              triggerClassName="inline-flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-(--theme-muted-panel-bg) text-xs font-medium text-(--theme-muted-text-color) transition-colors hover:text-(--theme-app)"
            >
              {typeIcon}
              {typeLabel}
              <ChevronDownIcon className="w-3 h-3 opacity-60" />
            </ActionMenu>
          ) : (
            <div className="inline-flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-(--theme-muted-panel-bg) text-xs font-medium text-(--theme-muted-text-color)">
              {typeIcon}
              {typeLabel}
            </div>
          )}
          {hideName ? (
            <div className="mt-3" />
          ) : (
            <>
              <input
                ref={nameRef}
                type="text"
                autoComplete="off"
                data-1p-ignore
                value={name}
                onChange={(e) => {
                  const next = sanitizeName ? sanitizeName(e.target.value) : e.target.value
                  setName(next)
                  onNameChange?.(next)
                }}
                onBlur={(e) => {
                  if (!e.target.value.trim()) {
                    setNameTouched(true)
                  }
                }}
                onKeyDown={(e) => {
                  // isComposing guards IME commits (CJK): Enter that confirms a
                  // composition candidate must not submit the dialog.
                  if (e.key === 'Enter' && !e.nativeEvent.isComposing && !e.metaKey && !e.ctrlKey) {
                    e.preventDefault()
                    e.stopPropagation()
                    handleSubmit()
                  }
                }}
                placeholder={namePlaceholder}
                aria-label={namePlaceholder}
                onAnimationEnd={() => setNameFlash(false)}
                className={cx(
                  // Padding gives the ring/flash box breathing room; the
                  // negative margins cancel it out so the text keeps the same
                  // position as the unpadded layout.
                  'mt-2 -mb-1 -mx-1.5 w-[calc(100%+0.75rem)] rounded-md border-0 px-1.5 py-1 bg-transparent shadow-none text-lg font-medium text-(--theme-app) placeholder:text-(--theme-muted-text-color) focus:outline-none',
                  nameFlash && 'animate-field-flash',
                  nameMissing ? 'ring-1 ring-(--theme-error)' : 'focus:ring-0',
                )}
              />
              {nameError && <p className="mt-1 text-xs text-(--theme-error)">{nameError}</p>}
              {hint && <p className="mt-1 text-xs text-(--theme-muted-text-color)">{hint}</p>}
              {showDescription ? (
                <textarea
                  autoComplete="off"
                  data-1p-ignore
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={descriptionText}
                  aria-label={descriptionText}
                  rows={3}
                  className="mt-1.5 w-full border-0 p-0 bg-transparent shadow-none resize-none text-sm text-(--theme-app) placeholder:text-(--theme-muted-text-color) focus:outline-none focus:ring-0"
                />
              ) : (
                <div className="mt-3" />
              )}
            </>
          )}
          {children}
        </div>
        {properties && (
          <div className="flex flex-wrap items-center gap-1.5 px-4 pt-1 pb-3">{properties}</div>
        )}
        {advanced && (
          <div className="px-4 pb-3">
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              className="inline-flex items-center gap-1 text-xs font-medium text-(--theme-muted-text-color) hover:text-(--theme-app) transition-colors"
            >
              <ChevronRightIcon
                className={cx('w-3 h-3 transition-transform', advancedOpen && 'rotate-90')}
              />
              {t.advanced}
            </button>
            {advancedOpen && <div className="mt-2">{advanced}</div>}
          </div>
        )}
      </div>
      <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3">
        {showFavorite ? (
          <Tooltip content={favorite ? t.favoriteHintOn : t.favoriteHintOff}>
            <Toggle
              pressed={favorite}
              onPressedChange={setFavorite}
              aria-label={t.favorite}
              className={cx(
                'inline-flex h-8 items-center gap-1.5 px-2.5 rounded-md text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-(--theme-focus-ring)',
                favorite
                  ? 'text-(--theme-favorite) bg-(--theme-favorite-muted)'
                  : 'text-(--theme-muted-text-color) hover:text-(--theme-app) hover:bg-(--theme-muted-panel-bg)',
              )}
            >
              {favorite ? (
                <FavoriteIcon className="w-4 h-4 scale-110 transition-transform" />
              ) : (
                <FavoriteOutlineIcon className="w-4 h-4 transition-transform" />
              )}
              {favorite ? t.favorited : t.favorite}
            </Toggle>
          </Tooltip>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <button type="button" onClick={onClose} className={ghostButtonClasses}>
            {hideSubmit ? t.close : t.cancel}
          </button>
          {!hideSubmit && (
            <button
              type="button"
              onClick={handleSubmit}
              aria-disabled={!canSubmit}
              className={`${primaryButtonClasses} aria-disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:hover:opacity-50`}
            >
              {submitting ? submittingText : submitText}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}

const fieldInputClasses =
  'w-full h-8 px-2.5 rounded-md border border-(--theme-border) bg-(--theme-input-bg) shadow-none text-sm text-(--theme-app) placeholder:text-(--theme-muted-text-color) transition-colors focus:outline-none focus:ring-0 focus:border-(--theme-element)'

const fieldLabelClasses = 'block mb-1 text-xs font-medium text-(--theme-muted-text-color)'

/** A field's label, with its help beside it rather than inside the label, so
 *  the label names the field and not the help button. */
function FieldLabel({
  id,
  label,
  tooltip,
}: {
  id: string
  label: string
  tooltip?: string | undefined
}) {
  return (
    <div className={cx(fieldLabelClasses, 'flex items-center gap-1')}>
      <label htmlFor={id}>{label}</label>
      {tooltip && <InfoTip text={tooltip} />}
    </div>
  )
}

/** Labeled single-line input row for the dialog's extra fields. */
export function CreateModalField({
  label,
  tooltip,
  id,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string
  /** Help text surfaced via an info icon next to the label. */
  tooltip?: string | undefined
}) {
  const fallbackId = useId()
  const fieldId = id ?? fallbackId
  return (
    <div className="mb-3">
      <FieldLabel id={fieldId} label={label} tooltip={tooltip} />
      <input
        type="text"
        autoComplete="off"
        data-1p-ignore
        {...props}
        id={fieldId}
        className={fieldInputClasses}
      />
    </div>
  )
}

/** Labeled multi-line field for credential blobs (JSON keys, PEM keys). */
export function CreateModalTextarea({
  label,
  tooltip,
  rows = 4,
  id,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string
  /** Help text surfaced via an info icon next to the label. */
  tooltip?: string | undefined
}) {
  const fallbackId = useId()
  const fieldId = id ?? fallbackId
  return (
    <div className="mb-3">
      <FieldLabel id={fieldId} label={label} tooltip={tooltip} />
      <textarea
        autoComplete="off"
        data-1p-ignore
        rows={rows}
        {...props}
        id={fieldId}
        className={cx(fieldInputClasses, 'h-auto py-2 font-mono text-xs leading-relaxed resize-y')}
      />
    </div>
  )
}

/** Labeled input with suggestions; any text is allowed. */
export function CreateModalAutocompleteField({
  label,
  tooltip,
  value,
  onValueChange,
  items,
  placeholder,
}: {
  label: string
  /** Help text surfaced via an info icon next to the label. */
  tooltip?: string
  value: string
  onValueChange: (value: string) => void
  /** Suggestions, filtered by what's typed. */
  items: string[]
  placeholder?: string
}) {
  const id = useId()
  return (
    <div className="mb-3">
      <FieldLabel id={id} label={label} tooltip={tooltip} />
      <Autocomplete
        id={id}
        items={items}
        value={value}
        onValueChange={onValueChange}
        placeholder={placeholder}
      />
    </div>
  )
}

const pillClasses =
  'inline-flex h-7 items-center gap-1.5 rounded-md border border-(--theme-border) px-2 text-xs font-medium transition-colors'

/** Compact property pill with an on/off switch. */
export function CreateModalSwitch({
  label,
  checked,
  onCheckedChange,
  tooltip,
}: {
  label: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  /** Help text surfaced on hover (explains what the toggle does). */
  tooltip?: string
}) {
  return (
    <Tooltip content={tooltip}>
      <label
        className={cx(
          pillClasses,
          'cursor-pointer hover:bg-(--theme-muted-panel-bg)',
          checked ? 'text-(--theme-app)' : 'text-(--theme-muted-text-color)',
        )}
      >
        <Switch size="sm" checked={checked} onCheckedChange={onCheckedChange} />
        {label}
      </label>
    </Tooltip>
  )
}

/** Compact property pill that picks one value from a searchable list. Items may carry
 * icons, descriptions and group headings (e.g. Clusters vs Kubernetes). */
export function CreateModalSelect({
  label,
  icon,
  value,
  items,
  onValueChange,
  disabled = false,
  disabledReason,
  tooltip,
}: {
  label: string
  icon?: ReactNode
  value?: string | undefined
  items: ComboboxItems<string>
  onValueChange: (value: string) => void
  /** Gray the pill out (e.g. while a prerequisite pill is unset). */
  disabled?: boolean
  /** Why the pill is disabled, shown in place of the tooltip (e.g. the prerequisite). */
  disabledReason?: string | undefined
  /** Help text surfaced on hover (explains what the pill selects). */
  tooltip?: string
}) {
  const t = useStrings().modal
  const selected = comboboxLeaves(items)
    .map((item) => (typeof item === 'string' ? { value: item, label: item } : item))
    .find((item) => item.value === value)
  // A prefilled value the list does not offer (stale region, a group the chosen
  // cloud account cannot reach) still has to read as set, or the pill looks
  // empty while the form submits it.
  const selectedLabel = selected?.label ?? (value || undefined)
  const pillContent = (
    <>
      {selected?.icon ?? icon}
      {selectedLabel ? (
        <>
          <span className="font-normal text-(--theme-muted-text-color)">{label}</span>
          {selectedLabel}
        </>
      ) : (
        label
      )}
      <ChevronDownIcon className="w-3 h-3 opacity-60" />
    </>
  )
  if (disabled) {
    return (
      <Tooltip content={disabledReason ?? tooltip}>
        <Button
          disabled
          focusableWhenDisabled
          aria-label={label}
          className={cx(
            pillClasses,
            'opacity-50 cursor-not-allowed text-(--theme-muted-text-color)',
          )}
        >
          {pillContent}
        </Button>
      </Tooltip>
    )
  }
  return (
    <Combobox
      items={items}
      value={value ?? null}
      onValueChange={(next) => {
        if (next !== null) {
          onValueChange(next)
        }
      }}
      itemToStringLabel={(next) => next}
      aria-label={label}
      placeholder={t.filter}
      triggerTooltip={tooltip}
      trigger={
        <button
          type="button"
          className={cx(
            pillClasses,
            'cursor-pointer hover:bg-(--theme-muted-panel-bg)',
            selectedLabel ? 'text-(--theme-app)' : 'text-(--theme-muted-text-color)',
          )}
        >
          {pillContent}
        </button>
      }
    />
  )
}
