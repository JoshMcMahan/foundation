import { type ComponentPropsWithRef, type ReactNode, useState } from 'react'
import { cx } from '../cx'
import { CheckIcon, CopyIcon, EyeIcon, EyeOffIcon } from '../icons'
import { type ButtonSize, type ButtonVariant, buttonClasses } from './buttonClasses'
import { IconButton } from './IconButton'
import { useStrings } from './Provider'
import { useCopy } from './useCopy'

// Always a button: a copy is never navigation, so it takes none of IconButton's link props.
export interface CopyButtonProps
  extends Omit<ComponentPropsWithRef<'button'>, 'onClick' | 'children' | 'type'> {
  variant?: ButtonVariant | undefined
  size?: ButtonSize | undefined
  /** What it copies, or a function that reads it when pressed, such as from the page. */
  text: string | (() => string)
  /** Names what it copies, such as "email address": the button reads "Copy email
   *  address" and the toast "Copied email address". Without it, both say only "Copy". */
  label?: string | undefined
  /** No toast, for a copy the reader can see succeed some other way. The button's
   *  check shows either way, and a failure still says so. */
  quiet?: boolean | undefined
  /** Shows "Copy" (then "Copied") beside the icon, for a copy that is a toolbar's
   *  command rather than a detail beside a value. */
  showLabel?: boolean | undefined
  /** A glyph in place of the copy icon, such as a branch for a branch name; the check
   *  still shows once it has copied. */
  icon?: ReactNode | undefined
  /** The whole success toast, in place of "Copied …", as `useCopy` takes it. */
  success?: string | undefined
  /** The whole failure toast, such as one that says where else to copy it from. */
  failure?: string | undefined
}

/** The one copy control: a button that copies its text, turns into a check for a
 *  moment, and says so in a toast, which screen readers announce. */
export function CopyButton({
  text,
  label,
  quiet = false,
  showLabel = false,
  variant = showLabel ? 'outline' : 'ghost',
  size = 'sm',
  icon: glyph,
  success,
  failure,
  ...props
}: CopyButtonProps) {
  const { common: t } = useStrings()
  const { copy, copied } = useCopy()
  const name = label
    ? copied
      ? t.copiedThing(label)
      : t.copyThing(label)
    : copied
      ? t.copied
      : t.copy
  const icon = copied ? <CheckIcon className="text-(--theme-success)" /> : (glyph ?? <CopyIcon />)
  const onClick = () =>
    void copy(typeof text === 'function' ? text() : text, { label, quiet, success, failure })
  if (showLabel) {
    return (
      <button
        type="button"
        {...props}
        aria-label={props['aria-label'] ?? name}
        onClick={onClick}
        className={cx(buttonClasses({ variant, size }), props.className)}
      >
        {icon}
        {copied ? t.copied : t.copy}
      </button>
    )
  }
  return (
    <IconButton
      {...props}
      variant={variant}
      size={size}
      label={name}
      icon={icon}
      onClick={onClick}
    />
  )
}

export interface CopyCodeBlockProps {
  /** What the button copies: the code as the reader would type it. */
  text: string
  /** Names what it copies, as CopyButton's `label` does, such as "install command". */
  label?: string | undefined
  /** The code as shown, such as highlighted; `text` by default. A secret's own children
   *  must mask it while it is hidden. */
  children?: ReactNode
  /** Adds an eye button that shows or hides the value. Without `children` the block masks
   *  the value itself, with dots that don't give away its length. */
  secret?: boolean | undefined
  /** Whether a secret shows. Leave it out for the block to keep its own state, hidden first. */
  revealed?: boolean | undefined
  defaultRevealed?: boolean | undefined
  onRevealedChange?: ((revealed: boolean) => void) | undefined
  /** Breaks a long value across lines instead of scrolling it, such as a token. */
  wrap?: boolean | undefined
  className?: string | undefined
}

// A fixed count, so the dots don't say how long the secret is.
const MASK = '•'.repeat(24)

/** A block of code, such as a command to run, with a button that copies it. The
 *  buttons show while the pointer is over the block or focus is in it, and always
 *  where there is no hover to reveal them. With `secret` it holds a value shown once,
 *  such as a new API key: masked until the eye shows it, and copied either way. */
export function CopyCodeBlock({
  text,
  label,
  children,
  secret = false,
  revealed: revealedProp,
  defaultRevealed = false,
  onRevealedChange,
  wrap = false,
  className,
}: CopyCodeBlockProps) {
  const { common: t } = useStrings()
  const [ownRevealed, setOwnRevealed] = useState(defaultRevealed)
  const revealed = revealedProp ?? ownRevealed
  const setRevealed = (next: boolean) => {
    setOwnRevealed(next)
    onRevealedChange?.(next)
  }
  const reveal =
    'opacity-0 group-hover/code:opacity-100 group-focus-within/code:opacity-100 pointer-coarse:opacity-100'
  let shown: ReactNode = children ?? text
  if (secret && !revealed && children === undefined) {
    shown = (
      <>
        <span aria-hidden="true" className="whitespace-nowrap">
          {MASK}
        </span>
        <span className="sr-only">{t.hiddenValue}</span>
      </>
    )
  }
  return (
    <div className={cx('group/code relative', className)}>
      <pre
        className={cx(
          'm-0 rounded-lg border border-(--theme-border) bg-(--theme-muted-panel-bg) p-4 text-left font-mono text-sm text-(--theme-app)',
          wrap ? 'whitespace-pre-wrap break-all' : 'overflow-x-auto',
          secret ? 'pr-20' : 'pr-12',
        )}
      >
        {shown}
      </pre>
      <div className="absolute top-2 right-2 flex items-center gap-1">
        {secret && (
          <IconButton
            // A toggle keeps one name and says its state by aria-pressed.
            label={t.showValue}
            icon={revealed ? <EyeIcon /> : <EyeOffIcon />}
            pressed={revealed}
            onClick={() => setRevealed(!revealed)}
            className={cx('bg-(--theme-muted-panel-bg)', reveal)}
          />
        )}
        <CopyButton
          text={text}
          label={label}
          className={cx('bg-(--theme-muted-panel-bg)', reveal)}
        />
      </div>
    </div>
  )
}
