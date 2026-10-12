import cx from 'classnames'
import type { ReactNode, PointerEvent as ReactPointerEvent } from 'react'
import { IconButton } from '../components/IconButton'
import { TOOLTIP_ID } from '../components/Tooltip'
import { RedoIcon, SettingsIcon, UndoIcon } from '../icons'
import type { DependencyGraphEditor } from './editorApi'
import type { Point } from './editorPrimitives'
import { useGraphEditorStrings } from './editorStrings'
import { ProblemsButton } from './ProblemsButton'
import { type ShortcutGroup, ShortcutsButton } from './ShortcutsButton'

/** What a drag carries, beside the pointer at `at` in its layer's coordinates. */
export function DragLabel({
  at,
  text,
  refused = false,
}: {
  at: Point
  text: string
  refused?: boolean
}) {
  return (
    <div
      className={cx(
        'pointer-events-none absolute z-30 rounded-md border bg-(--theme-panel-bg) px-2 py-1 text-xs shadow',
        refused ? 'border-(--theme-error) text-(--theme-error)' : 'theme-border',
      )}
      style={{ left: at.x + 12, top: at.y + 12 }}
    >
      {text}
    </div>
  )
}

export function BarDivider() {
  return <div className="mx-0.5 h-5 w-px bg-(--theme-border)" />
}

/** A toolbar chip that adds something: click to add it, or, given `onPointerDown`, drag it to where it goes. */
export function AddChip({
  icon,
  label,
  hint,
  className,
  onPointerDown,
  onClick,
}: {
  icon: ReactNode
  label: string
  hint: string
  className?: string
  onPointerDown?: (e: ReactPointerEvent<HTMLButtonElement>) => void
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void
}) {
  return (
    <button
      type="button"
      className={cx(
        'flex h-7 items-center gap-1 whitespace-nowrap rounded px-2 text-xs theme-hover',
        onPointerDown ? 'cursor-grab' : 'cursor-pointer',
        className,
      )}
      data-tooltip-id={TOOLTIP_ID}
      data-tooltip-content={hint}
      onPointerDown={onPointerDown}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  )
}

/** The bar both editors draw: problems, undo and redo, the editor's own controls, settings, shortcuts. */
export function EditorBar({
  editor,
  groups,
  className,
  children,
}: {
  editor: DependencyGraphEditor
  groups: ShortcutGroup[]
  className?: string
  children: ReactNode
}) {
  const t = useGraphEditorStrings()
  return (
    <div
      className={cx(
        'flex max-w-full flex-wrap items-center justify-end gap-0.5 rounded-md border theme-border bg-(--theme-panel-bg) p-0.5',
        className,
      )}
    >
      {!!editor.listedProblems?.length && (
        <>
          <ProblemsButton problems={editor.listedProblems} />
          <BarDivider />
        </>
      )}
      <IconButton
        icon={<UndoIcon className="h-4 w-4" />}
        label={t.undo}
        size="sm"
        variant="ghost"
        disabled={!editor.canUndo}
        onClick={editor.onUndo}
      />
      <IconButton
        icon={<RedoIcon className="h-4 w-4" />}
        label={t.redo}
        size="sm"
        variant="ghost"
        disabled={!editor.canRedo}
        onClick={editor.onRedo}
      />
      <BarDivider />
      {children}
      {editor.onOpenSettings && (
        <IconButton
          icon={<SettingsIcon className="h-4 w-4" />}
          label={t.workflowSettings}
          size="sm"
          variant="ghost"
          onClick={editor.onOpenSettings}
        />
      )}
      <ShortcutsButton groups={groups} />
    </div>
  )
}
