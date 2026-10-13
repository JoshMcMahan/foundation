import type { ReactNode } from 'react'
import { ConnectIcon, SettingsIcon } from '../../icons'
import { useChatConfig } from '../core/config'
import AllocationSelector from './AllocationSelector'
import ModelSelector from './ModelSelector'

/** Where the turn runs, sitting above the composer the way the terminal shows
 *  it: the machine, the workspace, and whatever else names the place. */
export function ComposerContext({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 flex min-h-7 flex-wrap items-center gap-1.5">{children}</div>
}

/** What the turn runs as, sitting under the composer: the surface's own
 *  controls on the left, the model on the right, both reading as plain text. */
export function ComposerSettings({ left, children }: { left?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="flex items-center gap-2">{left}</div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  )
}

/** A host's meter beside the model, such as usage against a limit. It gives
 *  up its room before the model does, ending in an ellipsis, and below a
 *  composer width that fits it beside the model and send it hides: the model
 *  and send matter more on a phone. */
export function ComposerUsage({ children }: { children: ReactNode }) {
  if (!children) {
    return null
  }
  return <div className="hidden min-w-0 shrink-[10] truncate @md:block">{children}</div>
}

/** The two selectors every surface carries, reading as text beside whatever
 *  the surface puts next to them. */
export function ComposerControls({ targetSession }: { targetSession?: string | null | undefined }) {
  return (
    <>
      <ModelSelector targetSession={targetSession} />
      <AllocationSelector />
    </>
  )
}

/** Where the reader manages the providers behind the model picker, at the
 *  foot of a conversation list. */
export function ManageProvidersLink() {
  const { extraLinks, LinkComponent, strings } = useChatConfig()
  if (!extraLinks.manageProviders) {
    return null
  }
  return (
    <LinkComponent
      target={{ kind: 'external', href: extraLinks.manageProviders }}
      className="flex min-w-0 items-center gap-2 rounded-md px-2 py-1.5 text-xs theme-muted-text transition-colors hover:chat-tint hover:theme-text"
      title={strings.sidebar.manageProviders}
    >
      <SettingsIcon className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{strings.sidebar.manageProviders}</span>
    </LinkComponent>
  )
}

export function ConnectToolsLink() {
  const { extraLinks, LinkComponent, strings } = useChatConfig()
  if (!extraLinks.connectTools) {
    return null
  }
  return (
    <LinkComponent
      target={{ kind: 'external', href: extraLinks.connectTools }}
      className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] theme-muted-text transition-colors hover:theme-muted-panel hover:theme-text"
    >
      <ConnectIcon className="h-3 w-3" />
      {strings.sidebar.connectTools}
    </LinkComponent>
  )
}
