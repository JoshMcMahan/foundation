import { Toggle } from '@base-ui/react/toggle'
import type { ReactNode } from 'react'
import { useId, useRef, useState } from 'react'
import { cx } from '../cx'
import { ChevronDownIcon, FavoriteIcon, FavoriteOutlineIcon } from '../icons'
import { ActionMenu } from './ActionMenu'
import { Button } from './Button'
import { buttonClasses } from './buttonClasses'
import { Combobox } from './Combobox'
import { type ComboboxItems, comboboxLeaves } from './comboboxItems'
import { Disclosure } from './Disclosure'
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
  /** The dialog's fields: an `Input`, or a `Field` around any other control. */
  children?: ReactNode
  /** Compact pills, such as `CreateModalSelect` and `CreateModalSwitch`, in a row under the name. */
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
  const { common } = useStrings()
  const submitText = submitLabel ?? common.create
  const submittingText = submittingLabel ?? t.creating
  const descriptionText = descriptionPlaceholder ?? t.addDescription

  const [name, setName] = useState(initialName ?? '')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [favorite, setFavorite] = useState(false)
  const [nameFlash, setNameFlash] = useState(false)
  const [nameTouched, setNameTouched] = useState(false)
  const [interacted, setInteracted] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const nameMessageId = useId()

  // Each opening starts a fresh form. Reset while rendering, not in an effect,
  // so the last form's values never paint for a frame.
  const session = open ? (initialName ?? '') : null
  const [shownSession, setShownSession] = useState(session)
  if (session !== shownSession) {
    setShownSession(session)
    if (session !== null) {
      setName(session)
      setDescription('')
      setSubmitting(false)
      setFavorite(false)
      setNameTouched(false)
      setInteracted(false)
    }
  }

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
      size="lg"
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
      footer={
        <>
          {showFavorite && (
            <div className="me-auto">
              <Tooltip content={favorite ? t.favoriteHintOn : t.favoriteHintOff}>
                <Toggle
                  pressed={favorite}
                  onPressedChange={setFavorite}
                  aria-label={t.favorite}
                  className={buttonClasses({ variant: 'ghost', size: 'sm' })}
                >
                  {favorite ? (
                    <FavoriteIcon className="text-(--theme-favorite)" />
                  ) : (
                    <FavoriteOutlineIcon />
                  )}
                  {favorite ? t.favorited : t.favorite}
                </Toggle>
              </Tooltip>
            </div>
          )}
          <Button variant="ghost" size="sm" onClick={onClose}>
            {hideSubmit ? common.close : common.cancel}
          </Button>
          {!hideSubmit && (
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              aria-disabled={!canSubmit}
              loading={submitting}
            >
              {submitting ? submittingText : submitText}
            </Button>
          )}
        </>
      }
    >
      <div onChangeCapture={() => setInteracted(true)}>
        <div>
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
                aria-required={!nameOptional}
                // The ring is the only other sign it's missing or wrong.
                aria-invalid={nameMissing || !!nameError}
                aria-describedby={nameError || hint ? nameMessageId : undefined}
                onAnimationEnd={() => setNameFlash(false)}
                className={cx(
                  // Padding gives the ring/flash box breathing room; the
                  // negative margins cancel it out so the text keeps the same
                  // position as the unpadded layout.
                  'mt-2 -mb-1 -mx-1.5 w-[calc(100%+0.75rem)] rounded-md border-0 px-1.5 py-1 bg-transparent shadow-none text-lg font-medium text-(--theme-app) placeholder:text-(--theme-placeholder) focus:outline-none',
                  nameFlash && 'animate-field-flash',
                  nameMissing ? 'ring-1 ring-(--theme-error)' : 'focus:ring-0',
                )}
              />
              {nameError && (
                <p id={nameMessageId} className="mt-1 text-xs text-(--theme-error-text)">
                  {nameError}
                </p>
              )}
              {hint && (
                <p id={nameMessageId} className="mt-1 text-xs text-(--theme-muted-text-color)">
                  {hint}
                </p>
              )}
              {showDescription ? (
                <textarea
                  autoComplete="off"
                  data-1p-ignore
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={descriptionText}
                  aria-label={descriptionText}
                  rows={3}
                  className="mt-1.5 w-full border-0 p-0 bg-transparent shadow-none resize-none text-sm text-(--theme-app) placeholder:text-(--theme-placeholder) focus:outline-none focus:ring-0"
                />
              ) : (
                <div className="mt-3" />
              )}
            </>
          )}
          {/* The dialog's own fields, such as Input, Textarea or a Field around a picker. */}
          {children && <div className="mb-3 flex flex-col gap-3">{children}</div>}
        </div>
        {properties && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1 pb-3">{properties}</div>
        )}
        {advanced && (
          <div className="pb-3">
            <Disclosure
              summary={t.advanced}
              summaryClassName="text-xs font-medium text-(--theme-muted-text-color) transition-colors hover:text-(--theme-app)"
              panelClassName="pt-2"
            >
              {advanced}
            </Disclosure>
          </div>
        )}
      </div>
    </Modal>
  )
}

// A property pill reads filled once it holds a value, and outlined while unset.
const pillClasses = (set: boolean) =>
  buttonClasses({ variant: set ? 'secondary' : 'outline', size: 'sm' })

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
      <label className={pillClasses(checked)}>
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
  const { common } = useStrings()
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
        <Button disabled focusableWhenDisabled aria-label={label} variant="outline" size="sm">
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
      placeholder={common.filter}
      triggerTooltip={tooltip}
      trigger={
        <button type="button" className={pillClasses(!!selectedLabel)}>
          {pillContent}
        </button>
      }
    />
  )
}
