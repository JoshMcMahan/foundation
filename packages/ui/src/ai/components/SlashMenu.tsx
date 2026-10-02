import cx from 'classnames'
import { type KeyboardEvent, useEffect, useState } from 'react'

export interface SlashCommandOption {
  name: string
  description?: string | undefined
  usage?: string | undefined
}

export interface SlashMenuConfig {
  commands: SlashCommandOption[]
  /** Names the listbox for assistive tech. */
  label: string
  /** Called when the input first reads as a command, so a host can load the list lazily. */
  onOpen?: (() => void) | undefined
}

const MAX_SHOWN = 8
// A name still being typed: the slash and nothing past the command name.
const TYPING_NAME = /^\/([\w:-]*)$/

export function slashMatches(input: string, commands: SlashCommandOption[]): SlashCommandOption[] {
  const typed = TYPING_NAME.exec(input)
  if (!typed) {
    return []
  }
  const query = (typed[1] ?? '').toLowerCase()
  return commands.filter((c) => c.name.toLowerCase().startsWith(query)).slice(0, MAX_SHOWN)
}

/** The palette's open state and keys; the caller owns the input. */
export function useSlashMenu(
  input: string,
  config: SlashMenuConfig | undefined,
  setInput: (value: string) => void,
) {
  const [active, setActive] = useState(0)
  const [dismissed, setDismissed] = useState(false)
  const matches = config ? slashMatches(input, config.commands) : []
  const exact = matches.length === 1 && `/${matches[0]?.name}` === input
  const open = matches.length > 0 && !dismissed && !exact
  const startsCommand = input.startsWith('/')
  const onOpen = config?.onOpen

  useEffect(() => {
    if (startsCommand) {
      onOpen?.()
    }
  }, [startsCommand, onOpen])

  // A new query starts from the top, and typing reopens a dismissed menu.
  const query = TYPING_NAME.exec(input)?.[1] ?? null
  const [shownQuery, setShownQuery] = useState(query)
  if (query !== shownQuery) {
    setShownQuery(query)
    setActive(0)
    setDismissed(false)
  }

  const choose = (name: string) => setInput(`/${name} `)

  /** True when the key belonged to the menu. */
  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!open) {
      return false
    }
    switch (e.key) {
      case 'ArrowDown':
        setActive((i) => (i + 1) % matches.length)
        break
      case 'ArrowUp':
        setActive((i) => (i - 1 + matches.length) % matches.length)
        break
      case 'Tab':
      case 'Enter': {
        if (e.shiftKey) {
          return false
        }
        const pick = matches[Math.min(active, matches.length - 1)]
        if (!pick) {
          return false
        }
        choose(pick.name)
        break
      }
      case 'Escape':
        setDismissed(true)
        break
      default:
        return false
    }
    e.preventDefault()
    return true
  }

  return { open, matches, active, choose, handleKey }
}

export function SlashMenu({
  label,
  matches,
  active,
  onChoose,
}: {
  label: string
  matches: SlashCommandOption[]
  active: number
  onChoose: (name: string) => void
}) {
  return (
    <div
      role="listbox"
      aria-label={label}
      data-testid="slash-menu"
      className="absolute bottom-full left-0 right-0 mb-2 z-20 overflow-hidden rounded-xl border theme-border bg-(--theme-panel-bg) shadow-lg"
    >
      {matches.map((c, i) => (
        <button
          key={c.name}
          type="button"
          role="option"
          aria-selected={i === active}
          // Keeps focus in the textarea so typing carries on after a click.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChoose(c.name)}
          className={cx(
            'flex w-full items-baseline gap-3 px-3 py-1.5 text-left text-sm',
            i === active ? 'theme-hover' : 'hover:theme-hover',
          )}
        >
          <span className="font-mono theme-text">/{c.name}</span>
          {c.description && (
            <span className="truncate text-xs theme-muted-text">{c.description}</span>
          )}
        </button>
      ))}
    </div>
  )
}
