import { type KeyboardEvent, useEffect, useId, useState } from 'react'
import { panelClassName, panelItemClassName, panelListClassName } from '../../components/floating'
import { cx } from '../../cx'

export interface SlashCommandOption {
  name: string
  description?: string | undefined
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

/** The palette's open state and keys; the caller owns the input.
 *  Base UI's Autocomplete drives a single-line input, and its arrow keys would take the caret
 *  from a multi-line composer, so the textarea stays a textbox that points at the list:
 *  spread `inputProps` on it. */
export function useSlashMenu(
  input: string,
  config: SlashMenuConfig | undefined,
  setInput: (value: string) => void,
) {
  const listId = useId()
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
  // A shorter list can leave the index past its end until the next key.
  const shown = Math.min(active, matches.length - 1)

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
        const pick = matches[shown]
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

  const inputProps = {
    'aria-autocomplete': 'list' as const,
    'aria-controls': open ? listId : undefined,
    'aria-activedescendant': open ? optionId(listId, shown) : undefined,
  }

  return { open, matches, active: shown, choose, handleKey, listId, inputProps }
}

const optionId = (listId: string, index: number) => `${listId}-${index}`

export function SlashMenu({
  label,
  listId,
  matches,
  active,
  onChoose,
}: {
  label: string
  listId: string
  matches: SlashCommandOption[]
  active: number
  onChoose: (name: string) => void
}) {
  return (
    <div
      id={listId}
      role="listbox"
      aria-label={label}
      data-testid="slash-menu"
      className={cx(
        'absolute bottom-full left-0 right-0 z-20 mb-2 overflow-hidden',
        panelListClassName,
        panelClassName,
      )}
    >
      {matches.map((c, i) => (
        // The textarea keeps focus and names the active option, so options are not tab stops.
        // biome-ignore lint/a11y/useKeyWithClickEvents: the textarea's arrow keys and Enter choose
        <div
          key={c.name}
          id={optionId(listId, i)}
          role="option"
          tabIndex={-1}
          aria-selected={i === active}
          data-highlighted={i === active || undefined}
          // Keeps focus in the textarea so typing carries on after a click.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChoose(c.name)}
          className={cx('items-baseline gap-3', panelItemClassName)}
        >
          <span className="font-mono">/{c.name}</span>
          {c.description && (
            <span className="truncate text-xs text-(--theme-muted-text-color)">
              {c.description}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}
