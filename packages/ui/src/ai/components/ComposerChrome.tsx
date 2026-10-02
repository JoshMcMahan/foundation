import type { ReactNode } from 'react'
import { ConnectIcon } from '../../icons'
import { useChatConfig } from '../core/config'
import AllocationSelector from './AllocationSelector'
import ModelSelector from './ModelSelector'

/** Where the turn runs, sitting above the composer the way the terminal shows
 *  it: the machine, the workspace, and whatever else names the place. */
export function ComposerContext({ children }: { children: ReactNode }) {
  return <div className="mb-1.5 flex flex-wrap items-center gap-1.5">{children}</div>
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

/** The two selectors every surface carries, bare so they read as text beside
 *  whatever the surface puts next to them. */
export function ComposerControls({ targetSession }: { targetSession?: string | null | undefined }) {
  return (
    <>
      <ModelSelector variant="bare" targetSession={targetSession} />
      <AllocationSelector variant="bare" />
    </>
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
