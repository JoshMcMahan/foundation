import { Fragment, useRef, useState } from 'react'
import { IconButton } from '../components/IconButton'
import { KeyboardIcon } from '../icons'
import { useGraphEditorStrings } from './editorStrings'
import { ToolbarPopover } from './ToolbarPopover'

/** What a gesture or key does; each combo is a set of keys, and a second combo does the same. */
export interface Shortcut {
  combos: string[][]
  does: string
}

export interface ShortcutGroup {
  title: string
  shortcuts: Shortcut[]
}

// Copy, paste and undo take Command on a Mac and Control elsewhere, as the handlers do.
export const MOD_KEY =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'

export const ALT_KEY =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform) ? '⌥' : 'Alt'

/** A toolbar button that opens the list of gestures and keys a pane takes. */
export function ShortcutsButton({ groups }: { groups: ShortcutGroup[] }) {
  const t = useGraphEditorStrings()
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  return (
    <>
      <IconButton
        ref={button}
        icon={<KeyboardIcon className="h-4 w-4" />}
        label={t.shortcuts}
        size="sm"
        variant="ghost"
        aria-expanded={open}
        showTooltip={!open}
        onClick={() => setOpen((current) => !current)}
      />
      {open && (
        <ToolbarPopover anchor={button} label={t.shortcuts} onClose={() => setOpen(false)}>
          <div className="text-[0.8125rem] font-semibold">{t.shortcuts}</div>
          {groups.map((group) => (
            <section key={group.title} className="mt-3">
              <h3 className="mb-1.5 text-xs font-semibold theme-muted-text">{group.title}</h3>
              {/* One key column width for every group, so the lists line up. */}
              <dl className="grid grid-cols-[8.5rem_1fr] items-baseline gap-x-3 gap-y-1.5">
                {group.shortcuts.map((shortcut) => (
                  <Fragment key={shortcut.does}>
                    <dt className="flex flex-wrap items-center gap-1">
                      {shortcut.combos.map((keys, i) => (
                        <Fragment key={keys.join('+')}>
                          {i > 0 && <span className="theme-muted-text">/</span>}
                          {keys.map((key) => (
                            <kbd
                              key={key}
                              className="rounded border theme-border px-1 py-px text-[11px]"
                            >
                              {key}
                            </kbd>
                          ))}
                        </Fragment>
                      ))}
                    </dt>
                    <dd className="theme-muted-text">{shortcut.does}</dd>
                  </Fragment>
                ))}
              </dl>
            </section>
          ))}
        </ToolbarPopover>
      )}
    </>
  )
}
