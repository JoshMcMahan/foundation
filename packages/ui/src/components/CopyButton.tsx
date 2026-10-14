import type { ComponentPropsWithRef, ReactNode } from 'react'
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
  const icon = copied ? <CheckIcon className="text-(--theme-success)" /> : <CopyIcon />
  const onClick = () => void copy(typeof text === 'function' ? text() : text, { label, quiet })
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
  /** The code as shown, which may be masked or highlighted. */
  children: ReactNode
  /** Adds an eye button that shows or hides the value; the caller masks `children`
   *  while `revealed` is false. */
  secret?: boolean | undefined
  revealed?: boolean | undefined
  onRevealedChange?: ((revealed: boolean) => void) | undefined
  className?: string | undefined
}

/** A block of code, such as a command to run, with a button that copies it. The
 *  buttons show while the pointer is over the block or focus is in it, and always
 *  where there is no hover to reveal them. */
export function CopyCodeBlock({
  text,
  label,
  children,
  secret = false,
  revealed = false,
  onRevealedChange,
  className,
}: CopyCodeBlockProps) {
  const { common: t } = useStrings()
  const reveal =
    'opacity-0 group-hover/code:opacity-100 group-focus-within/code:opacity-100 pointer-coarse:opacity-100'
  return (
    <div className={cx('group/code relative', className)}>
      <pre
        className={cx(
          'm-0 overflow-x-auto rounded-lg border border-(--theme-border) bg-(--theme-muted-panel-bg) p-4 text-left font-mono text-sm text-(--theme-app)',
          secret ? 'pr-20' : 'pr-12',
        )}
      >
        {children}
      </pre>
      <div className="absolute top-2 right-2 flex items-center gap-1">
        {secret && (
          <IconButton
            // A toggle keeps one name and says its state by aria-pressed.
            label={t.showValue}
            icon={revealed ? <EyeIcon /> : <EyeOffIcon />}
            pressed={revealed}
            onClick={() => onRevealedChange?.(!revealed)}
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
