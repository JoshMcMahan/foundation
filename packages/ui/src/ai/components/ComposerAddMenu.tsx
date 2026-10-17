import { Menu } from '@base-ui/react/menu'
import {
  type ComponentPropsWithRef,
  type ReactNode,
  useId,
  useState,
  useSyncExternalStore,
} from 'react'
import { Button } from '../../components/Button'
import { panelItemClassName } from '../../components/floating'
import {
  MenuItem,
  MenuLinkItem,
  MenuPopup,
  MenuSeparator,
  MenuSubmenuTrigger,
} from '../../components/Menu'
import { Modal } from '../../components/Modal'
import { SearchInput } from '../../components/SearchInput'
import { Switch } from '../../components/Switch'
import { useQueryMatch } from '../../components/search'
import { cx } from '../../cx'
import { AddIcon, AttachmentIcon, ConnectIcon, ToolsIcon } from '../../icons'
import type { ChatToolOption } from '../adapter/types'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'

/** More tools than this leave the menu for a modal, where they can be searched. */
export const TOOLS_IN_MENU = 6

const NARROW = '(max-width: 639px)'

function subscribeNarrow(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {}
  }
  const media = window.matchMedia(NARROW)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

const isNarrow = () =>
  typeof window !== 'undefined' &&
  typeof window.matchMedia === 'function' &&
  window.matchMedia(NARROW).matches

/** A phone has no room beside the menu for a submenu, and no hover to open one. */
function useNarrow(): boolean {
  return useSyncExternalStore(subscribeNarrow, isNarrow, () => false)
}

function PlusButton({
  open,
  label,
  hint,
  className,
  ...props
}: ComponentPropsWithRef<'button'> & { open: boolean; label: string; hint?: string | undefined }) {
  const name = hint ? `${label} · ${hint}` : label
  return (
    <button
      type="button"
      {...props}
      aria-label={name}
      title={name}
      className={cx(
        'relative flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full transition-colors',
        open
          ? 'theme-text chat-tint-strong'
          : 'theme-muted-text hover:theme-text hover:chat-tint data-popup-open:theme-text data-popup-open:chat-tint',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        className,
      )}
    >
      <AddIcon className={cx('h-5 w-5 transition-transform duration-200', open && 'rotate-45')} />
      {hint && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 size-1.5 rounded-full bg-(--theme-accent)"
        />
      )}
    </button>
  )
}

/** A switch drawn for a menu row, which is itself the checkbox the reader toggles. */
function RowSwitch() {
  return (
    <span
      aria-hidden="true"
      className="ml-auto inline-flex h-4 w-7 shrink-0 items-center rounded-full bg-(--theme-border-strong) p-0.5 transition-colors duration-150 group-data-checked:bg-(--theme-focus) motion-reduce:transition-none"
    >
      <span className="size-3 rounded-full bg-white shadow-sm transition-transform duration-150 group-data-checked:translate-x-3 rtl:group-data-checked:-translate-x-3 motion-reduce:transition-none" />
    </span>
  )
}

function ToolText({ tool, descriptionId }: { tool: ChatToolOption; descriptionId?: string }) {
  return (
    <span className="min-w-0 flex-1">
      <span className="block truncate">{tool.label}</span>
      {tool.description && (
        <span id={descriptionId} className="block truncate text-xs theme-muted-text">
          {tool.description}
        </span>
      )}
    </span>
  )
}

function ToolMenuRow({
  tool,
  enabled,
  onChange,
}: {
  tool: ChatToolOption
  enabled: boolean
  onChange: (enabled: boolean) => void
}) {
  const descriptionId = useId()
  return (
    <Menu.CheckboxItem
      checked={enabled}
      onCheckedChange={onChange}
      closeOnClick={false}
      className={cx(panelItemClassName, 'group gap-3')}
      {...(tool.description ? { 'aria-describedby': descriptionId } : {})}
    >
      <ToolText tool={tool} descriptionId={descriptionId} />
      <RowSwitch />
    </Menu.CheckboxItem>
  )
}

function ToolsList({ listed }: { listed: ChatToolOption[] }) {
  const { enabledToolIds, setToolEnabled } = useChat()
  return listed.map((tool) => (
    <ToolMenuRow
      key={tool.id}
      tool={tool}
      enabled={enabledToolIds.includes(tool.id)}
      onChange={(enabled) => setToolEnabled(tool.id, enabled)}
    />
  ))
}

function ConnectToolsRow({ href }: { href: string }) {
  const { strings } = useChatConfig()
  return (
    <MenuLinkItem
      // The host's link component drops the item's role and keys; this one leaves the app anyway.
      render={<a href={href} target="_blank" rel="noreferrer" />}
      className="text-xs theme-muted-text data-highlighted:theme-text"
    >
      <ConnectIcon className="h-3.5 w-3.5 shrink-0" />
      {strings.sidebar.connectTools}
    </MenuLinkItem>
  )
}

function OnCount({ enabled, total }: { enabled: number; total: number }) {
  const { strings } = useChatConfig()
  return (
    <span className="ml-auto pl-3 text-xs tabular-nums theme-muted-text">
      {strings.composerMenu.toolsOn(enabled, total)}
    </span>
  )
}

function ToolsModalRow({
  tool,
  enabled,
  onChange,
}: {
  tool: ChatToolOption
  enabled: boolean
  onChange: (enabled: boolean) => void
}) {
  const descriptionId = useId()
  return (
    <li>
      <label className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-(--theme-hover)">
        <span className="min-w-0 flex-1">
          <span className="block text-sm">{tool.label}</span>
          {tool.description && (
            <span id={descriptionId} className="block text-xs theme-muted-text">
              {tool.description}
            </span>
          )}
        </span>
        <Switch
          size="sm"
          checked={enabled}
          onCheckedChange={onChange}
          {...(tool.description ? { 'aria-describedby': descriptionId } : {})}
        />
      </label>
    </li>
  )
}

/** Every tool, searchable, for a host with more than the menu holds. */
function ToolsModal({
  open,
  onClose,
  listed,
}: {
  open: boolean
  onClose: () => void
  listed: ChatToolOption[]
}) {
  const { enabledToolIds, setToolEnabled } = useChat()
  const { LinkComponent, extraLinks, strings } = useChatConfig()
  const t = strings.composerMenu
  const matches = useQueryMatch()
  const [query, setQuery] = useState('')
  const needle = query.trim()
  const shown = needle
    ? listed.filter((tool) => matches(needle, tool.label, tool.description, tool.id))
    : listed
  const allOn = shown.every((tool) => enabledToolIds.includes(tool.id))
  const close = () => {
    onClose()
    setQuery('')
  }

  let footerStart: ReactNode = <span />
  if (extraLinks.connectTools) {
    footerStart = (
      <LinkComponent
        target={{ kind: 'external', href: extraLinks.connectTools }}
        className="mr-auto inline-flex items-center gap-1.5 text-xs theme-muted-text hover:theme-text"
      >
        <ConnectIcon className="h-3.5 w-3.5 shrink-0" />
        {strings.sidebar.connectTools}
      </LinkComponent>
    )
  }

  return (
    <Modal
      open={open}
      onClose={close}
      size="md"
      title={t.tools}
      description={t.toolsDescription}
      footer={
        <>
          {footerStart}
          <Button variant="primary" onClick={close}>
            {t.done}
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-2">
        <SearchInput
          value={query}
          onValueChange={setQuery}
          placeholder={t.searchTools}
          label={t.searchTools}
          className="flex-1"
        />
        {shown.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              for (const tool of shown) {
                setToolEnabled(tool.id, !allOn)
              }
            }}
          >
            {allOn ? t.turnAllOff : t.turnAllOn}
          </Button>
        )}
      </div>
      {shown.length > 0 ? (
        <ul className="-mx-2 mt-3 flex flex-col">
          {shown.map((tool) => (
            <ToolsModalRow
              key={tool.id}
              tool={tool}
              enabled={enabledToolIds.includes(tool.id)}
              onChange={(enabled) => setToolEnabled(tool.id, enabled)}
            />
          ))}
        </ul>
      ) : (
        <p className="m-0 py-8 text-center text-sm theme-muted-text">{t.noToolsMatch}</p>
      )}
    </Modal>
  )
}

/** The composer's + button. With only attachments it opens their panel, as it
 *  always has; once the adapter lists tools it opens a menu of Add files and
 *  Tools, whose submenu toggles each one. Past TOOLS_IN_MENU, Tools opens a
 *  modal instead. A dot on the + says some tools are off. */
export default function ComposerAddMenu({
  attachmentsOpen,
  onToggleAttachments,
  disabled,
  withTools,
}: {
  attachmentsOpen: boolean
  /** Absent when the composer takes no files. */
  onToggleAttachments?: (() => void) | undefined
  disabled: boolean
  /** Offer the provider's tools, for a turn the provider runs. */
  withTools: boolean
}) {
  const { tools, enabledToolIds } = useChat()
  const { extraLinks, strings } = useChatConfig()
  const [modalOpen, setModalOpen] = useState(false)
  const narrow = useNarrow()
  const t = strings.composerMenu
  const listed = withTools ? tools : []

  if (listed.length === 0) {
    if (!onToggleAttachments) {
      return null
    }
    return (
      <PlusButton
        open={attachmentsOpen}
        aria-expanded={attachmentsOpen}
        disabled={disabled}
        label={strings.input.attachFiles}
        onClick={onToggleAttachments}
      />
    )
  }

  const enabled = listed.filter((tool) => enabledToolIds.includes(tool.id)).length
  const someOff = enabled < listed.length
  const many = listed.length > TOOLS_IN_MENU
  const connect = extraLinks.connectTools
  const label = onToggleAttachments ? t.label : t.tools

  if (many && !onToggleAttachments) {
    return (
      <>
        <PlusButton
          open={false}
          aria-haspopup="dialog"
          disabled={disabled}
          label={label}
          hint={someOff ? t.someToolsOff : undefined}
          onClick={() => setModalOpen(true)}
        />
        <ToolsModal open={modalOpen} onClose={() => setModalOpen(false)} listed={listed} />
      </>
    )
  }

  const toolsEntry = many ? (
    <MenuItem onClick={() => setModalOpen(true)}>
      <ToolsIcon className="h-4 w-4 shrink-0 theme-muted-text" />
      {t.tools}
      <OnCount enabled={enabled} total={listed.length} />
    </MenuItem>
  ) : onToggleAttachments && !narrow ? (
    <Menu.SubmenuRoot>
      <MenuSubmenuTrigger>
        <ToolsIcon className="h-4 w-4 shrink-0 theme-muted-text" />
        {t.tools}
        {someOff && <OnCount enabled={enabled} total={listed.length} />}
      </MenuSubmenuTrigger>
      <MenuPopup side="inline-end" className="w-72">
        <ToolsList listed={listed} />
        {connect && (
          <>
            <MenuSeparator />
            <ConnectToolsRow href={connect} />
          </>
        )}
      </MenuPopup>
    </Menu.SubmenuRoot>
  ) : null

  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          disabled={disabled}
          render={
            <PlusButton
              open={attachmentsOpen}
              label={label}
              hint={someOff ? t.someToolsOff : undefined}
            />
          }
        />
        {/* Without files, or on a phone, the menu lists the tools itself rather than a step to them. */}
        <MenuPopup side="top" align="start" className={toolsEntry ? 'w-56' : 'w-72'}>
          {onToggleAttachments && (
            <MenuItem onClick={onToggleAttachments}>
              <AttachmentIcon className="h-4 w-4 shrink-0 theme-muted-text" />
              {t.addFiles}
            </MenuItem>
          )}
          {toolsEntry ?? (
            <>
              {onToggleAttachments && <MenuSeparator />}
              <ToolsList listed={listed} />
              {connect && (
                <>
                  <MenuSeparator />
                  <ConnectToolsRow href={connect} />
                </>
              )}
            </>
          )}
        </MenuPopup>
      </Menu.Root>
      {many && <ToolsModal open={modalOpen} onClose={() => setModalOpen(false)} listed={listed} />}
    </>
  )
}
