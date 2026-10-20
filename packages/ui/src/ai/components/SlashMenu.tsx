import { type KeyboardEvent, useEffect, useState } from 'react'
import { ListboxOption, ListboxPanel, useListboxNavigation } from '../../components/Listbox'

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

  const choose = (name: string) => setInput(`/${name} `)
  const list = useListboxNavigation({
    items: matches,
    open,
    onChoose: (command) => choose(command.name),
    onDismiss: () => setDismissed(true),
  })

  // A new query starts from the top, and typing reopens a dismissed menu.
  const query = TYPING_NAME.exec(input)?.[1] ?? null
  const [shownQuery, setShownQuery] = useState(query)
  if (query !== shownQuery) {
    setShownQuery(query)
    list.setActive(0)
    setDismissed(false)
  }

  /** True when the key belonged to the menu. */
  const handleKey = (e: KeyboardEvent<HTMLTextAreaElement>) => list.handleKey(e)

  return {
    open,
    matches,
    active: list.active,
    choose,
    handleKey,
    listId: list.listId,
    inputProps: list.hostProps,
    list,
  }
}

export function SlashMenu({
  label,
  menu,
  onChoose,
}: {
  label: string
  menu: ReturnType<typeof useSlashMenu>
  onChoose: (name: string) => void
}) {
  return (
    <div data-testid="slash-menu" className="absolute bottom-full left-0 right-0 z-20 mb-2">
      <ListboxPanel listProps={menu.list.listProps} aria-label={label}>
        {menu.matches.map((c, i) => {
          const option = menu.list.optionProps(i)
          return (
            <ListboxOption
              key={c.name}
              option={{ ...option, onClick: () => onChoose(c.name) }}
              inline
              label={<span className="font-mono">/{c.name}</span>}
              description={c.description}
            />
          )
        })}
      </ListboxPanel>
    </div>
  )
}
