import { type ComponentPropsWithRef, Fragment } from 'react'
import { cx } from '../cx'
import { type UIStrings, useStrings } from './Provider'

type KeyNames = UIStrings['keys']

/** Whether the keyboard is an Apple one, whose Command key does what Control does elsewhere. */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') {
    return false
  }
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
  // iPadOS reports itself as a Mac in its user agent, which is the keyboard it takes.
  return /Mac|iPhone|iPad|iPod/i.test(data?.platform || navigator.userAgent)
}

/** A shortcut's platform: `apple` shows ⌘ ⌥ ⇧ ⌃ and takes Command for `Mod`; `other` names
 *  the keys and takes Control. */
export type KeyPlatform = 'apple' | 'other'

const currentPlatform = (): KeyPlatform => (isApplePlatform() ? 'apple' : 'other')

const DEFAULT_NAMES: KeyNames = {
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
  enter: 'Enter',
  escape: 'Esc',
  space: 'Space',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
}

// What a key is called in a shortcut, case aside, mapped to one name.
const ALIASES: Record<string, string> = {
  mod: 'mod',
  cmd: 'meta',
  command: 'meta',
  meta: 'meta',
  ctrl: 'ctrl',
  control: 'ctrl',
  alt: 'alt',
  option: 'alt',
  opt: 'alt',
  shift: 'shift',
  enter: 'enter',
  return: 'enter',
  esc: 'escape',
  escape: 'escape',
  space: 'space',
  tab: 'tab',
  backspace: 'backspace',
  delete: 'delete',
  del: 'delete',
  up: 'up',
  arrowup: 'up',
  down: 'down',
  arrowdown: 'down',
  left: 'left',
  arrowleft: 'left',
  right: 'right',
  arrowright: 'right',
}

const ARROWS: Record<string, string> = { up: '↑', down: '↓', left: '←', right: '→' }
const APPLE: Record<string, string> = { meta: '⌘', alt: '⌥', shift: '⇧', ctrl: '⌃', enter: '↵' }

// The values `aria-keyshortcuts` takes, from the UI Events key names.
const ARIA: Record<string, string> = {
  meta: 'Meta',
  ctrl: 'Control',
  alt: 'Alt',
  shift: 'Shift',
  enter: 'Enter',
  escape: 'Escape',
  space: 'Space',
  tab: 'Tab',
  backspace: 'Backspace',
  delete: 'Delete',
  up: 'ArrowUp',
  down: 'ArrowDown',
  left: 'ArrowLeft',
  right: 'ArrowRight',
}

/** Splits a combination such as `Mod+Shift+K` into its keys; `Mod++` ends with the plus key. */
function splitCombo(keys: string): string[] {
  const trimmed = keys.trim()
  if (trimmed === '+') {
    return ['+']
  }
  const plusKey = trimmed.endsWith('++')
  const parts = (plusKey ? trimmed.slice(0, -2) : trimmed)
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean)
  return plusKey ? [...parts, '+'] : parts
}

function canonical(key: string, platform: KeyPlatform): string | undefined {
  const name = ALIASES[key.toLowerCase()]
  if (name === 'mod') {
    return platform === 'apple' ? 'meta' : 'ctrl'
  }
  return name
}

function label(key: string, names: KeyNames, platform: KeyPlatform): string {
  const name = canonical(key, platform)
  if (!name) {
    // A letter shows as its keycap does; anything else, such as "1–9" or "/", as given.
    return key.length === 1 ? key.toUpperCase() : key
  }
  if (ARROWS[name]) {
    return ARROWS[name]
  }
  if (platform === 'apple' && APPLE[name]) {
    return APPLE[name]
  }
  return names[name as keyof KeyNames] ?? key
}

/** The keys of a shortcut as its keycaps read: `Mod+K` is ⌘ K on an Apple keyboard and Ctrl K
 *  elsewhere. A string is a combination joined by `+`; an array lists its keys as given, such
 *  as `['[', ']']` or `['1–9']`. Pass `names` from the strings, so key names are localized. */
export function formatShortcut(
  keys: string | readonly string[],
  names: KeyNames = DEFAULT_NAMES,
  platform: KeyPlatform = currentPlatform(),
): string[] {
  const parts = typeof keys === 'string' ? splitCombo(keys) : keys
  return parts.map((key) => label(key, names, platform))
}

/** A shortcut as one line of text, for a title or a sentence: ⌘K, or Ctrl+K. */
export function shortcutText(
  keys: string | readonly string[],
  names: KeyNames = DEFAULT_NAMES,
  platform: KeyPlatform = currentPlatform(),
): string {
  const parts = formatShortcut(keys, names, platform)
  // An array is keys side by side, not one chord.
  if (typeof keys !== 'string') {
    return parts.join(' ')
  }
  return parts.join(platform === 'apple' ? '' : '+')
}

/** The `aria-keyshortcuts` value for a combination: `Mod+K` is `Meta+K` on an Apple keyboard
 *  and `Control+K` elsewhere. Set it on the control the shortcut presses. */
export function ariaKeyShortcuts(keys: string, platform: KeyPlatform = currentPlatform()): string {
  return splitCombo(keys)
    .map((key) => {
      const name = canonical(key, platform)
      if (name) {
        return ARIA[name] ?? key
      }
      return key.length === 1 ? key.toUpperCase() : key
    })
    .join('+')
}

/** `formatShortcut` and `shortcutText` in the host's key names. */
export function useShortcutFormat(platform?: KeyPlatform): {
  format: (keys: string | readonly string[]) => string[]
  text: (keys: string | readonly string[]) => string
} {
  const { keys: names } = useStrings()
  const on = platform ?? currentPlatform()
  return {
    format: (keys) => formatShortcut(keys, names, on),
    text: (keys) => shortcutText(keys, names, on),
  }
}

export type KbdVariant = 'keycap' | 'plain'
export type KbdSize = 'xs' | 'sm'

/** Any other attribute and the ref reach the outer `<kbd>`, so it can be a Tooltip's or a popover's
 *  direct child. */
export interface KbdProps extends Omit<ComponentPropsWithRef<'kbd'>, 'children' | 'className'> {
  /** A combination joined by `+`, such as `Mod+K` (Command on an Apple keyboard, Control
   *  elsewhere) or `Shift+Enter`; or keys side by side, as given: `['↑', '↓']`, `['1–9']`. */
  keys: string | readonly string[]
  /** `keycap`, the default, draws each key; `plain` is muted text, for a menu row. */
  variant?: KbdVariant | undefined
  /** `xs` (16px, 10px text) for a hint inside a row or a field; `sm` (18px, 11px) otherwise. */
  size?: KbdSize | undefined
  /** Which keyboard to show the keys for; the reader's own by default. */
  platform?: KeyPlatform | undefined
  className?: string | undefined
}

const keycap: Record<KbdSize, string> = {
  xs: 'min-h-4 min-w-4 px-[3px] py-px text-[10px]',
  sm: 'min-h-[18px] min-w-[18px] px-1 py-px text-[11px]',
}

/** Keys to press, as keycaps: a muted fill, a hairline border and monospace text. Off an
 *  Apple keyboard the keys of a combination are joined with a plus, as the platform writes
 *  them. Renders `<kbd>`, with a `<kbd>` for each key of a combination. */
export function Kbd({
  keys,
  variant = 'keycap',
  size = 'sm',
  platform,
  className,
  ...rest
}: KbdProps) {
  const { keys: names } = useStrings()
  const on = platform ?? currentPlatform()
  const parts = formatShortcut(keys, names, on)
  const chord = typeof keys === 'string'
  if (variant === 'plain') {
    return (
      <kbd
        {...rest}
        className={cx(
          'font-sans text-(--theme-muted-text-color) tabular-nums tracking-wide',
          size === 'xs' ? 'text-[10px]' : 'text-[11px]',
          className,
        )}
      >
        {chord ? shortcutText(keys, names, on) : parts.join(' ')}
      </kbd>
    )
  }
  const cap = cx(
    'inline-flex items-center justify-center rounded border border-(--theme-border) bg-(--theme-muted-panel-bg) font-mono leading-none font-normal text-(--theme-app) not-italic',
    keycap[size],
  )
  if (parts.length === 1) {
    return (
      <kbd {...rest} className={cx(cap, className)}>
        {parts[0]}
      </kbd>
    )
  }
  const plus = chord && on !== 'apple'
  return (
    <kbd
      {...rest}
      className={cx('inline-flex flex-wrap items-center gap-0.5 align-middle', className)}
    >
      {parts.map((part, i) => (
        // Keys repeat in a sequence, such as G G, so each keeps its place.
        // biome-ignore lint/suspicious/noArrayIndexKey: a shortcut's keys are fixed
        <Fragment key={i}>
          {plus && i > 0 && (
            <span aria-hidden="true" className="text-[10px] text-(--theme-muted-text-color)">
              +
            </span>
          )}
          <kbd className={cap}>{part}</kbd>
        </Fragment>
      ))}
    </kbd>
  )
}
