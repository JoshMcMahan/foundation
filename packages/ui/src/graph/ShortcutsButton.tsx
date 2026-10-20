import { Fragment } from 'react'
import { IconButton } from '../components/IconButton'
import { isApplePlatform, Kbd } from '../components/Kbd'
import { Popover } from '../components/Popover'
import { KeyboardIcon } from '../icons'
import { useGraphEditorStrings } from './editorStrings'
import { toolbarPanel } from './toolbarPanel'

/** What a gesture or key does; each combo is a set of keys, and a second combo does the same. */
export interface Shortcut {
  combos: string[][]
  does: string
}

export interface ShortcutGroup {
  title: string
  shortcuts: Shortcut[]
}

/** Whether the keyboard is an Apple one, whose Command key does what Control does elsewhere. */
export const IS_MAC = isApplePlatform()

/** Copy, paste and undo take Command on a Mac and Control elsewhere, as the handlers do. A Mac
 *  shows its symbols; elsewhere the keys go by the names their keycaps carry in the strings. */
export function modifierKeys(key: { ctrl: string; alt: string }): { mod: string; alt: string } {
  return IS_MAC ? { mod: '⌘', alt: '⌥' } : { mod: key.ctrl, alt: key.alt }
}

/** A toolbar button that opens the list of gestures and keys a pane takes. */
export function ShortcutsButton({ groups }: { groups: ShortcutGroup[] }) {
  const t = useGraphEditorStrings()
  // A pointer gesture, such as "Drag a handle", reads as words; only keys get keycaps.
  const k = t.shortcutKeys
  const gestures = new Set([
    k.click,
    k.drag,
    k.dragJob,
    k.dragCircle,
    k.dragButton,
    k.dragSpace,
    k.dragHandle,
    k.dragEdge,
    k.rightClick,
    k.scroll,
  ])
  return (
    <Popover
      title={t.shortcuts}
      {...toolbarPanel}
      trigger={<IconButton icon={<KeyboardIcon />} label={t.shortcuts} size="sm" variant="ghost" />}
    >
      {groups.map((group) => (
        <section key={group.title} className="mt-3 first-of-type:mt-0">
          <h3 className="mb-1.5 text-xs font-semibold theme-muted-text">{group.title}</h3>
          {/* One key column width for every group, so the lists line up. */}
          <dl className="grid grid-cols-[8.5rem_1fr] items-baseline gap-x-3 gap-y-1.5">
            {group.shortcuts.map((shortcut) => (
              <Fragment key={shortcut.does}>
                <dt className="flex flex-wrap items-center gap-1">
                  {shortcut.combos.map((keys, i) => (
                    <Fragment key={keys.join('+')}>
                      {i > 0 && <span className="theme-muted-text">/</span>}
                      {keys.some((key) => gestures.has(key)) ? (
                        <span className="inline-flex flex-wrap items-center gap-1">
                          {keys.map((key) =>
                            gestures.has(key) ? (
                              <span key={key} className="text-[11px] text-(--theme-app)">
                                {key}
                              </span>
                            ) : (
                              <Kbd key={key} keys={[key]} />
                            ),
                          )}
                        </span>
                      ) : (
                        <Kbd keys={keys} />
                      )}
                    </Fragment>
                  ))}
                </dt>
                <dd className="theme-muted-text">{shortcut.does}</dd>
              </Fragment>
            ))}
          </dl>
        </section>
      ))}
    </Popover>
  )
}
