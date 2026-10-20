import {
  type ComponentPropsWithRef,
  type CSSProperties,
  type ReactNode,
  useEffectEvent,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
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
  /** Breaks a long value across lines instead of scrolling it, such as a token in a block.
   *  Default false: an inline token, key or ID stays on one line and scrolls inside. */
  wrap?: boolean | undefined
  /** A compact value in the line, such as a token shown once in a Callout: as wide as the
   *  value, up to its container, where a longer one scrolls sideways on its one line. A quiet
   *  surface reads on a panel and a tinted callout alike, and the buttons stay right after the
   *  value, always shown. The copy confirms with its check alone, as the change shows there. */
  inline?: boolean | undefined
  className?: string | undefined
}

/** Which ends of a sideways scroller hide some of its content, kept up to date as it
 *  scrolls or resizes. */
type HiddenEnds = { start: boolean; end: boolean }
const NO_ENDS: HiddenEnds = { start: false, end: false }

function useHiddenEnds(active: boolean) {
  const ref = useRef<HTMLElement>(null)
  const [ends, setEnds] = useState<HiddenEnds>(NO_ENDS)
  const measureNow = () => {
    const el = ref.current
    if (!el || !active) {
      setEnds(NO_ENDS)
      return
    }
    // Negative while scrolled from the start in a right-to-left line.
    const scrolled = Math.abs(el.scrollLeft)
    const start = scrolled > 1
    const end = scrolled + el.clientWidth < el.scrollWidth - 1
    setEnds((was) => (was.start === start && was.end === end ? was : { start, end }))
  }
  // The observer reads the latest value and room without subscribing again each render.
  const measure = useEffectEvent(measureNow)
  // After every render, as the value or its room may have changed; the state bails out
  // when the ends are the same.
  useLayoutEffect(() => {
    measure()
  })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !active || typeof ResizeObserver === 'undefined') {
      return
    }
    const observer = new ResizeObserver(() => measure())
    observer.observe(el)
    return () => observer.disconnect()
  }, [active])
  return { ref, ends, onScroll: measureNow }
}

// How far the fade reaches into a value that runs on past an edge.
const FADE = '1.25rem'

function fadeMask({ start, end }: HiddenEnds): CSSProperties | undefined {
  if (!start && !end) {
    return undefined
  }
  const image = `linear-gradient(to var(--fade-end, right), ${start ? `transparent, #000 ${FADE}` : '#000'}, ${end ? `#000 calc(100% - ${FADE}), transparent` : '#000'})`
  return { maskImage: image, WebkitMaskImage: image }
}

// A fixed count, so the dots don't say how long the secret is.
const MASK = '•'.repeat(24)

/** A block of code, such as a command to run, with a button that copies it. The
 *  buttons show while the pointer is over the block or focus is in it, and always
 *  where there is no hover to reveal them. With `inline` it is a compact value in the line
 *  instead, such as a token shown once, its buttons always beside it. With `secret` it
 *  masks the value until the eye shows it, and copies it either way. */
export function CopyCodeBlock({
  text,
  label,
  children,
  secret = false,
  revealed: revealedProp,
  defaultRevealed = false,
  onRevealedChange,
  inline = false,
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
  // A value that runs past the chip fades at the hidden end and takes focus, so the arrow keys
  // can scroll it; one that fits is no stop on the way through the page.
  const scroller = useHiddenEnds(inline && !wrap)
  const overflows = scroller.ends.start || scroller.ends.end
  const revealButton = secret && (
    <IconButton
      // A toggle keeps one name and says its state by aria-pressed.
      label={t.showValue}
      icon={revealed ? <EyeIcon /> : <EyeOffIcon />}
      pressed={revealed}
      onClick={() => setRevealed(!revealed)}
      size={inline ? 'xs' : 'sm'}
      className={inline ? undefined : cx('bg-(--theme-muted-panel-bg)', reveal)}
    />
  )
  if (inline) {
    return (
      <span
        className={cx(
          // The border takes the text's color, so it is the tone's on a callout and neutral on
          // a panel; the fill lifts the value off a tint without a slab of its own color.
          'inline-flex max-w-full items-start gap-1 rounded-md border border-current/15 bg-(--theme-panel-bg)/70 py-px ps-2 pe-px align-middle',
          // The fade's mask would clip a ring on the value itself, so the chip draws it.
          'has-[code:focus-visible]:outline-2 has-[code:focus-visible]:outline-offset-1 has-[code:focus-visible]:outline-(--theme-focus)',
          className,
        )}
      >
        <code
          ref={scroller.ref}
          onScroll={scroller.onScroll}
          {...(overflows
            ? { tabIndex: 0, role: 'region', 'aria-label': label ?? t.codeOf('') }
            : {})}
          style={fadeMask(scroller.ends)}
          className={cx(
            'min-w-0 py-[3px] font-mono text-[0.8125rem] leading-[18px] text-(--theme-app)',
            'outline-none',
            // The fade runs toward the line's end, which is the left in a right-to-left line.
            'rtl:[--fade-end:left]',
            wrap
              ? 'break-all whitespace-pre-wrap'
              : 'overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          )}
        >
          {shown}
        </code>
        <span className="flex shrink-0 items-center">
          <CopyButton text={text} label={label} size="xs" quiet />
          {revealButton}
        </span>
      </span>
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
        {revealButton}
        <CopyButton
          text={text}
          label={label}
          className={cx('bg-(--theme-muted-panel-bg)', reveal)}
        />
      </div>
    </div>
  )
}
