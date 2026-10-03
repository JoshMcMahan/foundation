import {
  Combobox,
  ComboboxInput,
  ComboboxOption,
  ComboboxOptions,
  Menu,
  MenuButton,
  MenuItem,
  MenuItems,
} from '@headlessui/react'
import cx from 'classnames'
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ChevronDownIcon,
  ChevronRightIcon,
  FavoriteIcon,
  FavoriteOutlineIcon,
  TooltipIcon,
} from '../icons'
import { AddMenu, type HeaderAddMenuItem } from './AddMenu'
import { BareModal, modalPanelClasses } from './BareModal'
import { filterOption, toggleSetMember } from './dropdownUtils'
import { ghostButtonClasses, primaryButtonClasses } from './ghostButton'
import { useStrings } from './Provider'
import { TOOLTIP_ID } from './Tooltip'

/** Small info icon that surfaces field help via the global tooltip. */
function FieldHelp({ tooltip }: { tooltip?: string | undefined }) {
  if (!tooltip) {
    return null
  }
  return (
    <span
      data-tooltip-id={TOOLTIP_ID}
      data-tooltip-content={tooltip}
      className="inline-flex cursor-help text-(--theme-muted-text-color)"
    >
      <TooltipIcon className="w-3 h-3" />
    </span>
  )
}

/** Anchors the tooltip on a non-focusable span so it opens on hover but not when focus returns to the button after its menu/toggle closes (which would leave it stuck). */
function PillTooltip({
  content,
  className,
  children,
}: {
  content?: string | undefined
  className?: string
  children: ReactNode
}) {
  return (
    <span
      {...(content ? { 'data-tooltip-id': TOOLTIP_ID, 'data-tooltip-content': content } : {})}
      className={cx('inline-flex items-center gap-1.5', className)}
    >
      {children}
    </span>
  )
}

interface CreateModalProps {
  open: boolean
  onClose: () => void
  typeIcon?: ReactNode
  typeLabel: string
  /** Makes the type chip a dropdown to switch between sibling form types. */
  typeMenu?: HeaderAddMenuItem[] | undefined
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
      // Focus after the portal content mounts, unless something inside the
      // dialog was focused in the meantime.
      requestAnimationFrame(() => {
        const input = nameRef.current
        const dialog = input?.closest('[role="dialog"]')
        const active = document.activeElement
        if (dialog?.contains(active) && active !== dialog) {
          return
        }
        input?.focus()
      })
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
    <BareModal
      open={open}
      onClose={onClose}
      ariaLabel={`${submitText}: ${typeLabel}`}
      className={cx(modalPanelClasses, 'w-[560px] max-w-full flex flex-col max-h-full')}
      preventClose={isDirty}
      onPanelKeyDown={(e) => {
        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          handleSubmit()
        }
      }}
      onPanelMouseDown={(e) => {
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
            <AddMenu
              items={typeMenu}
              label={typeLabel}
              zClassName="z-[9999]"
              buttonClassName="inline-flex items-center gap-1.5 px-1.5 py-1 rounded-md bg-(--theme-muted-panel-bg) text-xs font-medium text-(--theme-muted-text-color) transition-colors hover:text-(--theme-app)"
            >
              {typeIcon}
              {typeLabel}
              <ChevronDownIcon className="w-3 h-3 opacity-60" />
            </AddMenu>
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
          <button
            type="button"
            role="switch"
            aria-checked={favorite}
            aria-label={t.favorite}
            onClick={() => setFavorite((f) => !f)}
            className={cx(
              'inline-flex h-8 rounded-md text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-(--theme-focus-ring)',
              favorite
                ? 'text-(--theme-favorite) bg-(--theme-favorite-muted)'
                : 'text-(--theme-muted-text-color) hover:text-(--theme-app) hover:bg-(--theme-muted-panel-bg)',
            )}
          >
            <PillTooltip
              content={favorite ? t.favoriteHintOn : t.favoriteHintOff}
              className="px-2.5"
            >
              {favorite ? (
                <FavoriteIcon className="w-4 h-4 scale-110 transition-transform" />
              ) : (
                <FavoriteOutlineIcon className="w-4 h-4 transition-transform" />
              )}
              {favorite ? t.favorited : t.favorite}
            </PillTooltip>
          </button>
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
    </BareModal>
  )
}

const fieldInputClasses =
  'w-full h-8 px-2.5 rounded-md border border-(--theme-border) bg-(--theme-input-bg) shadow-none text-sm text-(--theme-app) placeholder:text-(--theme-muted-text-color) transition-colors focus:outline-none focus:ring-0 focus:border-(--theme-element)'

const fieldLabelClasses = 'block mb-1 text-xs font-medium text-(--theme-muted-text-color)'

/** Labeled single-line input row for the dialog's extra fields. */
export function CreateModalField({
  label,
  tooltip,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string
  /** Help text surfaced via an info icon next to the label. */
  tooltip?: string | undefined
}) {
  return (
    <label className="block mb-3">
      <span className={cx(fieldLabelClasses, 'flex items-center gap-1')}>
        {label}
        <FieldHelp tooltip={tooltip} />
      </span>
      <input
        type="text"
        autoComplete="off"
        data-1p-ignore
        {...props}
        className={fieldInputClasses}
      />
    </label>
  )
}

/** Labeled multi-line field for credential blobs (JSON keys, PEM keys). */
export function CreateModalTextarea({
  label,
  tooltip,
  rows = 4,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string
  /** Help text surfaced via an info icon next to the label. */
  tooltip?: string | undefined
}) {
  return (
    <label className="block mb-3">
      <span className={cx(fieldLabelClasses, 'flex items-center gap-1')}>
        {label}
        <FieldHelp tooltip={tooltip} />
      </span>
      <textarea
        autoComplete="off"
        data-1p-ignore
        rows={rows}
        {...props}
        className={cx(fieldInputClasses, 'h-auto py-2 font-mono text-xs leading-relaxed resize-y')}
      />
    </label>
  )
}

/** Labeled input row with typeahead suggestions; free-form values allowed. */
export function CreateModalAutocompleteField({
  label,
  tooltip,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string
  /** Help text surfaced via an info icon next to the label. */
  tooltip?: string
  value: string
  onChange: (value: string) => void
  options: string[]
  placeholder?: string
}) {
  const query = value.trim().toLowerCase()
  const filtered = query
    ? options.filter((option) => option.toLowerCase().includes(query))
    : options
  return (
    <div className="mb-3">
      <span className={cx(fieldLabelClasses, 'flex items-center gap-1')}>
        {label}
        <FieldHelp tooltip={tooltip} />
      </span>
      <Combobox value={value} onChange={(next) => onChange(next ?? '')} immediate>
        <ComboboxInput
          autoComplete="off"
          data-1p-ignore
          aria-label={label}
          placeholder={placeholder}
          displayValue={(current: string) => current ?? ''}
          onChange={(e) => onChange(e.target.value)}
          className={fieldInputClasses}
        />
        {filtered.length > 0 && (
          <ComboboxOptions
            anchor="bottom start"
            className="z-[9999] mt-1 w-(--input-width) [--anchor-max-height:14rem] overflow-auto rounded-lg border border-(--theme-border) bg-(--theme-app-bg) py-1 shadow-lg focus:outline-none"
          >
            {filtered.map((option) => (
              <ComboboxOption
                key={option}
                value={option}
                className="px-3 py-1.5 text-[13px] text-(--theme-app) data-[focus]:bg-(--theme-muted-panel-bg) cursor-pointer"
              >
                {option}
              </ComboboxOption>
            ))}
          </ComboboxOptions>
        )}
      </Combobox>
    </div>
  )
}

/** Compact property pill with an on/off switch. */
export function CreateModalSwitch({
  label,
  checked,
  onChange,
  tooltip,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  /** Help text surfaced on hover (explains what the toggle does). */
  tooltip?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cx(
        'inline-flex h-7 rounded-md border border-(--theme-border) text-xs font-medium transition-colors hover:bg-(--theme-muted-panel-bg)',
        checked ? 'text-(--theme-app)' : 'text-(--theme-muted-text-color)',
      )}
    >
      <PillTooltip content={tooltip} className="px-2">
        <span
          className={cx(
            'relative inline-flex h-3.5 w-6 shrink-0 rounded-full transition-colors',
            checked ? 'bg-(--theme-element)' : 'bg-(--theme-border)',
          )}
        >
          <span
            className={cx(
              'absolute top-0.5 left-0.5 h-2.5 w-2.5 rounded-full bg-white shadow-sm transition-transform',
              checked && 'translate-x-2.5',
            )}
          />
        </span>
        {label}
      </PillTooltip>
    </button>
  )
}

export interface CreateModalSelectOption {
  label: string
  value: string
  /** Small leading icon (e.g. the resource's provider icon). */
  icon?: ReactNode
  /** Category header to group this option under in the dropdown. */
  group?: string
  /** Hidden behind the group's toggle row until the group is expanded. */
  collapsible?: boolean
  /** Always listed regardless of the typed filter (e.g. a trailing "Create new…" action). */
  pinned?: boolean
  /** Muted second line under the label (e.g. the allocation a group bills to). */
  description?: string
  /** Listed but not selectable (e.g. a group whose allocation is exhausted). */
  disabled?: boolean
}

/** Callers gating collapse on list size must use this same threshold so
 * collapsed rows always come with a filter to find them. */
export const CREATE_MODAL_SELECT_FILTER_THRESHOLD = 8

interface CollapseState {
  expanded: Set<string>
  onToggle: (group: string) => void
  label: (count: number) => string
}

// Not a MenuItem so activating it toggles the group instead of closing the menu.
function collapseToggleRow(group: string, count: number, collapse: CollapseState): ReactNode {
  const expanded = collapse.expanded.has(group)
  const Chevron = expanded ? ChevronDownIcon : ChevronRightIcon
  return (
    <button
      key={`toggle-${group}`}
      type="button"
      aria-expanded={expanded}
      // preventDefault leaves focus in the filter input so typing after
      // expanding a group still reaches it.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => collapse.onToggle(group)}
      className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[13px] text-(--theme-muted-text-color) hover:text-(--theme-app) cursor-pointer"
    >
      <Chevron className="w-3 h-3" />
      {collapse.label(count)}
    </button>
  )
}

function collapsibleCountsByGroup(options: CreateModalSelectOption[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const o of options) {
    if (o.collapsible && o.group) {
      counts.set(o.group, (counts.get(o.group) ?? 0) + 1)
    }
  }
  return counts
}

function pushToggleRowOnce(
  nodes: ReactNode[],
  toggledGroups: Set<string>,
  group: string,
  count: number,
  collapse: CollapseState,
): void {
  if (!toggledGroups.has(group)) {
    toggledGroups.add(group)
    nodes.push(collapseToggleRow(group, count, collapse))
  }
}

function buildOptionNodes(
  options: CreateModalSelectOption[],
  query: string,
  onChange: (value: string) => void,
  collapse?: CollapseState,
): ReactNode[] {
  const trimmed = query.trim()
  const q = trimmed.toLowerCase().replace(/-/g, '')
  // Matching the group finds rows labeled generically (e.g. "Login node").
  const filtered = q
    ? options.filter(
        (o) =>
          o.pinned ||
          filterOption({ label: o.label, value: o.value, secondaryValue: o.group }, trimmed),
      )
    : options

  const collapsibleCounts =
    !q && collapse ? collapsibleCountsByGroup(filtered) : new Map<string, number>()

  // Preserve option order while inserting a header before each new group.
  const nodes: ReactNode[] = []
  let lastGroup: string | undefined
  const toggledGroups = new Set<string>()
  for (const option of filtered) {
    const { group } = option
    if (group && group !== lastGroup) {
      lastGroup = group
      nodes.push(
        <div
          key={`group-${group}`}
          className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-(--theme-muted-text-color)"
        >
          {group}
        </div>,
      )
    }
    if (!q && collapse && option.collapsible && group) {
      pushToggleRowOnce(nodes, toggledGroups, group, collapsibleCounts.get(group) ?? 0, collapse)
      if (!collapse.expanded.has(group)) {
        continue
      }
    }
    nodes.push(
      <MenuItem key={option.value} disabled={option.disabled ?? false}>
        <button
          type="button"
          disabled={option.disabled}
          aria-disabled={option.disabled}
          aria-label={option.description ? option.label : undefined}
          aria-description={option.description}
          onClick={() => onChange(option.value)}
          className={cx(
            'flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] data-[focus]:bg-(--theme-muted-panel-bg)',
            option.disabled
              ? 'cursor-not-allowed text-(--theme-muted-text-color)'
              : 'cursor-pointer text-(--theme-app)',
            option.pinned && 'mt-1 border-t border-(--theme-border) pt-2 font-medium',
          )}
        >
          {option.icon}
          {option.description ? (
            <span className="flex min-w-0 flex-col">
              <span className="truncate">{option.label}</span>
              <span className="truncate text-[11px] font-normal text-(--theme-muted-text-color)">
                {option.description}
              </span>
            </span>
          ) : (
            option.label
          )}
        </button>
      </MenuItem>,
    )
  }
  return nodes
}

// Split out so it remounts on each open: focuses the filter on open and clears
// the query on close, which a single always-mounted render couldn't do cleanly.
function CreateModalSelectPanel({
  open,
  options,
  label,
  value,
  collapsedLabel,
  onChange,
}: {
  open: boolean
  options: CreateModalSelectOption[]
  label: string
  value: string | undefined
  collapsedLabel: ((count: number) => string) | undefined
  onChange: (value: string) => void
}) {
  const t = useStrings().modal
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const showFilter = options.length > CREATE_MODAL_SELECT_FILTER_THRESHOLD
  const selectedGroup = options.find((o) => o.value === value)?.group
  // Start with only the selection's group expanded; reset on close so each
  // open begins from that state.
  const initialExpandedGroups = useCallback(
    () => new Set(selectedGroup ? [selectedGroup] : []),
    [selectedGroup],
  )
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(initialExpandedGroups)

  useEffect(() => {
    if (!open) {
      setQuery('')
      setExpandedGroups(initialExpandedGroups())
    }
  }, [open, initialExpandedGroups])

  useEffect(() => {
    if (!open || !showFilter) {
      return
    }
    // Focus after Headless UI's own open-focus so the caret lands in the filter.
    const raf = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(raf)
  }, [open, showFilter])

  const rendered = buildOptionNodes(
    options,
    query,
    onChange,
    collapsedLabel
      ? {
          expanded: expandedGroups,
          onToggle: (group) => setExpandedGroups((prev) => toggleSetMember(prev, group)),
          label: collapsedLabel,
        }
      : undefined,
  )

  // Headless UI's `anchor` applies an inline max-height of min(--anchor-max-height, availableHeight), which overrides any max-h-* class, so the cap has to come from the CSS var. max-h-64 still has to match it: the inline style lands after mount, and until it does a long list lays out at full height, overflowing the body into a scrollbar that shifts the page behind the dialog. The panel itself never scrolls — only the option list does, so the scrollbar starts below the filter rather than running alongside it.
  return (
    <MenuItems
      anchor="bottom start"
      className="z-[9999] mt-1 flex min-w-44 max-w-[min(28rem,calc(100vw-2rem))] max-h-64 flex-col [--anchor-max-height:16rem] overflow-hidden rounded-lg border border-(--theme-border) bg-(--theme-app-bg) shadow-lg focus:outline-none"
    >
      {showFilter && (
        <div className="shrink-0 bg-(--theme-app-bg) px-1.5 pt-1 pb-1.5 border-b border-(--theme-border)">
          <input
            ref={inputRef}
            type="text"
            autoComplete="off"
            data-1p-ignore
            aria-label={label}
            placeholder={t.filter}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              // Keep keystrokes in the field; let Escape bubble up to close the menu.
              if (e.key !== 'Escape') {
                e.stopPropagation()
              }
            }}
            className="w-full h-7 px-2 rounded-md border border-(--theme-border) bg-(--theme-input-bg) text-[13px] text-(--theme-app) placeholder:text-(--theme-muted-text-color) focus:outline-none focus:border-(--theme-element)"
          />
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto py-1">
        {rendered.length === 0 ? (
          <div className="px-3 py-1.5 text-[13px] text-(--theme-muted-text-color)">
            {t.noOptions}
          </div>
        ) : (
          rendered
        )}
      </div>
    </MenuItems>
  )
}

/** Compact property pill with a dropdown of options. Options may carry leading
 * icons and group headers (e.g. Clusters vs Kubernetes). */
export function CreateModalSelect({
  label,
  icon,
  value,
  options,
  onChange,
  disabled = false,
  disabledHint,
  tooltip,
  collapsedLabel,
}: {
  label: string
  icon?: ReactNode
  value?: string | undefined
  options: CreateModalSelectOption[]
  onChange: (value: string) => void
  /** Gray the pill out (e.g. while a prerequisite pill is unset). */
  disabled?: boolean
  /** Shown as the pill's tooltip while disabled (e.g. the prerequisite). */
  disabledHint?: string | undefined
  /** Help text surfaced on hover (explains what the pill selects). */
  tooltip?: string
  /** Label for the toggle row hiding a group's collapsible options. */
  collapsedLabel?: (count: number) => string
}) {
  const selected = options.find((o) => o.value === value)
  // A prefilled value the option list does not offer (stale region, a group the
  // chosen cloud account cannot reach) still has to read as set, or the pill
  // looks empty while the form submits it.
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
      <button
        type="button"
        aria-disabled="true"
        aria-label={label}
        className={cx(
          'inline-flex h-7 rounded-md border border-(--theme-border) text-xs font-medium',
          'opacity-50 cursor-not-allowed text-(--theme-muted-text-color)',
        )}
      >
        <PillTooltip content={disabledHint ?? tooltip} className="px-2">
          {pillContent}
        </PillTooltip>
      </button>
    )
  }

  return (
    <Menu>
      {({ open }) => (
        <>
          <MenuButton
            aria-label={label}
            className={cx(
              'inline-flex h-7 rounded-md border border-(--theme-border) text-xs font-medium transition-colors hover:bg-(--theme-muted-panel-bg)',
              selectedLabel ? 'text-(--theme-app)' : 'text-(--theme-muted-text-color)',
            )}
          >
            <PillTooltip content={tooltip} className="px-2">
              {pillContent}
            </PillTooltip>
          </MenuButton>
          <CreateModalSelectPanel
            open={open}
            options={options}
            label={label}
            value={value}
            collapsedLabel={collapsedLabel}
            onChange={onChange}
          />
        </>
      )}
    </Menu>
  )
}
