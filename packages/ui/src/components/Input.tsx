import { Input as BaseInput } from '@base-ui/react/input'
import type { InputHTMLAttributes, ReactNode, Ref, TextareaHTMLAttributes } from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { cx } from '../cx'
import { Field, type FieldControlProps, RevealToggle, useFieldControlId } from './Field'
import { type FieldBoxSize, fieldBox } from './fieldBox'

interface FramedProps {
  /** Without a label the box stands alone: name it with `aria-label`, or place it in a Field. */
  label?: ReactNode
  /** Beside the label and outside it, so it stays out of the field's name. */
  hint?: ReactNode
  /** More about the field, behind a ? beside the label; see Field's `help`. */
  help?: string | undefined
  /** Help under the field. */
  description?: ReactNode
  error?: ReactNode
  mono?: boolean
  /** `sm` for dense places such as toolbars and table cells, `lg` for a form that stands alone,
   *  such as sign-in. With a label, the label matches. */
  size?: FieldBoxSize | undefined
}

// `size` is the box's, not the native character count, which CSS sets better.
export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>,
    FramedProps {
  ref?: Ref<HTMLInputElement> | undefined
}

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FramedProps {
  ref?: Ref<HTMLTextAreaElement> | undefined
  /** Grows with its text instead of scrolling, from `rows` lines up to `maxRows`, past which
   *  it scrolls. */
  autosize?: boolean | { maxRows?: number | undefined } | undefined
  /** Draws no box of its own, for a textarea in a frame that draws one, such as a comment
   *  composer with its buttons: frame it with `fieldBox({ multiline: true, within: true })`.
   *  It has no padding either, so the frame's own lines up with what is around it. */
  bare?: boolean | undefined
  /** Hides what is typed, as a password field does, with a button that shows it: for a
   *  private key or a certificate. It is monospace, unchecked for spelling and left alone by
   *  password managers and autofill. */
  secret?: boolean | undefined
}

/** The Field around a control when it has a label; the control alone when it doesn't. */
export function framed(
  {
    label,
    hint,
    help,
    actions,
    description,
    error,
    size,
  }: Omit<FramedProps, 'mono'> & { actions?: ReactNode },
  {
    id,
    required,
    disabled,
  }: { id?: string | undefined; required?: boolean | undefined; disabled?: boolean | undefined },
  control: (props: Partial<FieldControlProps>) => ReactNode,
) {
  if (label === undefined) {
    return control(error ? { 'aria-invalid': true } : {})
  }
  return (
    <Field
      label={label}
      hint={hint}
      help={help}
      actions={actions}
      description={description}
      error={error}
      required={required}
      disabled={disabled}
      size={size}
      id={id}
    >
      {control}
    </Field>
  )
}

/** The control props joined with the element's own: its own `aria-describedby` stays beside the
 *  field's, and its own invalid mark holds when the field sets none. */
function joined(
  control: Partial<FieldControlProps>,
  own: { 'aria-describedby'?: string | undefined; 'aria-invalid'?: unknown },
): Partial<FieldControlProps> {
  return {
    ...control,
    'aria-invalid': control['aria-invalid'] ?? (own['aria-invalid'] as true | undefined),
    'aria-describedby':
      [own['aria-describedby'], control['aria-describedby']].filter(Boolean).join(' ') || undefined,
  }
}

/** A single-line text field. `type="password"` adds a button that shows what was typed. Placed in
 *  a Field, it takes the Field's label, description and invalid state. */
export function Input({
  label,
  hint,
  help,
  description,
  error,
  className,
  mono,
  size,
  type,
  ref,
  ...props
}: InputProps) {
  const [revealed, setRevealed] = useState(false)
  const secret = type === 'password'
  const id = useFieldControlId(props.id)
  return framed({ label, hint, help, description, error, size }, props, (control) => {
    // Base UI's input, which a Field around it names, describes and marks as it does Base UI's
    // own controls.
    const input = (
      <BaseInput
        ref={ref}
        {...props}
        id={id}
        {...joined(control, props)}
        type={secret && revealed ? 'text' : type}
        className={cx(fieldBox({ size }), mono && 'font-mono', secret && 'pr-9', className)}
      />
    )
    return secret ? (
      <div className="relative w-full">
        {input}
        <RevealToggle
          revealed={revealed}
          onRevealedChange={setRevealed}
          disabled={props.disabled}
        />
      </div>
    ) : (
      input
    )
  })
}

// A box's padding and border, which a height in lines leaves out.
const boxEdges = { sm: '0.5rem + 2px', md: '0.75rem + 2px', lg: '1rem + 2px' } as const

// Where the browser can't size a field to its content, it is sized by its scroll height.
const sizesToContent = () =>
  typeof CSS !== 'undefined' && CSS.supports?.('field-sizing', 'content') === true

/** Sets a textarea's height to its text's while the browser can't, from its value. */
export function useAutosize(enabled: boolean, value: unknown) {
  const element = useRef<HTMLTextAreaElement | null>(null)
  const [native] = useState(sizesToContent)
  const resize = useCallback(() => {
    const el = element.current
    if (!el || native) {
      return
    }
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`
  }, [native])
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new value is a new height
  useLayoutEffect(() => {
    if (enabled) {
      resize()
    }
  }, [enabled, resize, value])
  return { element, resize: enabled && !native ? resize : undefined }
}

/** A multi-line text field that grows by hand, or with its text with `autosize`. Placed in a
 *  Field, it takes the Field's label, description and invalid state. */
export function Textarea({
  label,
  hint,
  help,
  description,
  error,
  className,
  mono,
  size = 'md',
  ref,
  autosize,
  bare = false,
  secret = false,
  style,
  ...props
}: TextareaProps) {
  const [revealed, setRevealed] = useState(false)
  const autosizing = Boolean(autosize)
  const maxRows = typeof autosize === 'object' ? autosize.maxRows : undefined
  const { element, resize } = useAutosize(autosizing, props.value)
  const edges = bare ? '0px' : boxEdges[size]
  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      element.current = el
      if (typeof ref === 'function') {
        ref(el)
      } else if (ref) {
        ref.current = el
      }
    },
    [ref, element],
  )
  const masked = secret && !revealed
  const id = useFieldControlId(props.id)
  return framed({ label, hint, help, description, error, size }, props, (control) => {
    const textarea = (
      <BaseInput
        // Base UI's input drawn as a textarea; its props are an input's, which a textarea's match
        // but for the few only a textarea has.
        {...(secret && {
          spellCheck: false,
          autoComplete: 'off',
          autoCorrect: 'off',
          autoCapitalize: 'off',
          'data-1p-ignore': true,
        })}
        {...(props as InputHTMLAttributes<HTMLInputElement>)}
        id={id}
        {...joined(control, props)}
        onInput={(event) => {
          resize?.()
          props.onInput?.(event as unknown as Parameters<NonNullable<typeof props.onInput>>[0])
        }}
        ref={setRef as unknown as Ref<HTMLInputElement>}
        render={<textarea />}
        style={{
          ...(autosizing && {
            minHeight: `calc(${props.rows ?? 2}lh + ${edges})`,
            ...(maxRows !== undefined && { maxHeight: `calc(${maxRows}lh + ${edges})` }),
          }),
          ...style,
        }}
        className={cx(
          bare
            ? 'w-full min-w-0 border-0 bg-transparent p-0 text-(--theme-app) outline-none placeholder:text-(--theme-placeholder) disabled:cursor-not-allowed disabled:text-(--theme-placeholder)'
            : fieldBox({ size, multiline: true }),
          bare && { sm: 'text-xs', md: 'text-sm', lg: 'text-base' }[size],
          autosizing
            ? 'resize-none [field-sizing:content]'
            : cx(size === 'sm' ? 'min-h-16' : 'min-h-24', !bare && 'resize-y'),
          bare && !autosizing && 'resize-none',
          (mono || secret) && 'font-mono',
          secret && 'pr-9',
          masked && '[-webkit-text-security:disc]',
          className,
        )}
      />
    )
    return secret ? (
      <div className="relative w-full">
        {textarea}
        <RevealToggle
          revealed={revealed}
          onRevealedChange={setRevealed}
          disabled={props.disabled}
          align="top"
          size={size}
        />
      </div>
    ) : (
      textarea
    )
  })
}

export interface TitleInputProps
  extends Omit<
    TextareaHTMLAttributes<HTMLTextAreaElement>,
    'value' | 'defaultValue' | 'onChange' | 'rows' | 'aria-label'
  > {
  /** The saved title. Changes from outside show while the title isn't being edited. */
  value: string
  /** Called with the trimmed title when an edit ends with a change: on Enter or on leaving
   *  the field. An empty title isn't committed; the saved one comes back. */
  onCommit: (value: string) => void
  'aria-label': string
  /** Focuses the title and selects its text as it appears, such as for a thing just made. */
  autoSelect?: boolean | undefined
  /** `xl` for a page's own title, `lg` for one in a panel or drawer. */
  size?: 'lg' | 'xl' | undefined
  ref?: Ref<HTMLTextAreaElement> | undefined
}

/** A title edited where it reads: one line that wraps and grows, with no box until the
 *  pointer or focus is on it. Enter saves, Escape puts the saved title back, and leaving the
 *  field saves. */
export function TitleInput({
  value,
  onCommit,
  autoSelect = false,
  size = 'xl',
  readOnly,
  className,
  onBlur,
  onFocus,
  onKeyDown,
  ref,
  ...props
}: TitleInputProps) {
  const [draft, setDraft] = useState(value)
  const editing = useRef(false)
  const element = useRef<HTMLTextAreaElement | null>(null)
  // A change saved elsewhere shows unless the title is being edited.
  const [shown, setShown] = useState(value)
  if (value !== shown) {
    setShown(value)
    if (!editing.current) {
      setDraft(value)
    }
  }
  const { element: sizer, resize } = useAutosize(true, draft)
  // biome-ignore lint/correctness/useExhaustiveDependencies: only as it appears
  useEffect(() => {
    if (autoSelect && element.current) {
      element.current.focus()
      element.current.select()
    }
  }, [])
  const setRef = useCallback(
    (el: HTMLTextAreaElement | null) => {
      element.current = el
      // The sizer too, or where the browser can't size it, it never grows.
      sizer.current = el
      if (typeof ref === 'function') {
        ref(el)
      } else if (ref) {
        ref.current = el
      }
    },
    [ref, sizer],
  )
  return (
    <textarea
      {...props}
      ref={setRef}
      rows={1}
      value={draft}
      readOnly={readOnly}
      spellCheck={props.spellCheck ?? true}
      onChange={(event) => {
        // A title is one line: a pasted line break joins the lines.
        setDraft(event.target.value.replace(/\s*\n+\s*/g, ' '))
        resize?.()
      }}
      onFocus={(event) => {
        editing.current = true
        onFocus?.(event)
      }}
      onBlur={(event) => {
        editing.current = false
        const title = draft.trim()
        if (title && title !== value) {
          onCommit(title)
        } else {
          setDraft(value)
        }
        onBlur?.(event)
      }}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented || event.nativeEvent.isComposing) {
          return
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        } else if (event.key === 'Escape') {
          event.preventDefault()
          // Put back before the blur, which would otherwise save the edit.
          flushSync(() => setDraft(value))
          event.currentTarget.blur()
        }
      }}
      className={cx(
        '-mx-1.5 block w-[calc(100%+0.75rem)] min-w-0 resize-none overflow-hidden rounded-md border-0 bg-transparent px-1.5 py-0.5 font-semibold tracking-tight text-(--theme-app) outline-none transition-colors [field-sizing:content] placeholder:text-(--theme-placeholder)',
        size === 'xl' ? 'text-2xl leading-tight' : 'text-lg leading-snug',
        !readOnly &&
          'hover:bg-(--theme-hover) focus-visible:bg-transparent focus-visible:ring-1 focus-visible:ring-(--theme-focus)',
        className,
      )}
    />
  )
}
