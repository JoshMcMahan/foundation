import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo } from 'react'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import { StatusBadge } from '../../components/StatusBadge'
import {
  DEFAULT_PERMISSION_MODE,
  NAMED_PERMISSION_MODES,
  type NamedPermissionMode,
} from '../agent/permissions'
import {
  makeComposerPastes,
  makePasteText,
  makeStaticAdapter,
  pasteIntoComposer,
  StoryChat,
} from '../stories/harness'
import type { MessagePaste } from '../types'
import { NoticeCard } from '../ui/Notice'
import PermissionPicker from './agent/PermissionPicker'
import ChatInput from './ChatInput'
import { ComposerControls, ComposerUsage, ConnectToolsLink } from './ComposerChrome'

const meta: Meta = {
  title: 'Chat/Composer',
  component: ChatInput,
  parameters: { layout: 'fullscreen' },
  // Docked at the foot of the panel, the way a thread shows it, so the dock
  // and its fade read against the surface they belong to.
  decorators: [
    (Story) => (
      <div
        style={{
          minHeight: '100dvh',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          background: 'var(--theme-panel-bg)',
        }}
      >
        <Story />
      </div>
    ),
  ],
}

export default meta

const send = (text: string, _ids?: string[], _meta?: unknown, pastes?: MessagePaste[]) =>
  console.info('[send]', text, pastes ?? [])

export const Idle: StoryObj<{ disabled: boolean; placeholder: string }> = {
  args: { disabled: false, placeholder: 'Ask anything' },
  render: (args) => (
    <StoryChat>
      <div>
        <ChatInput
          onSend={send}
          disabled={args.disabled}
          placeholder={args.placeholder}
          conversationId="conv-1"
        />
      </div>
    </StoryChat>
  ),
}

// The box as a thread docks it: attach on the left of its toolbar, the model
// and send on the right, and the surface's own links under it. The play opens
// the attach tray inside the box.
export const Toolbar: StoryObj<{ attachOpen: boolean }> = {
  args: { attachOpen: false },
  render: () => {
    const Composer = () => {
      const adapter = useMemo(() => makeStaticAdapter({ attachments: true }), [])
      return (
        <StoryChat adapter={adapter}>
          <div>
            <ChatInput
              onSend={send}
              conversationId="conv-toolbar"
              settingsLeft={<ConnectToolsLink />}
              settingsRight={<ComposerControls />}
            />
          </div>
        </StoryChat>
      )
    }
    return <Composer />
  },
  play: async ({ canvasElement, args }) => {
    if (args.attachOpen) {
      canvasElement.querySelector<HTMLButtonElement>('button[aria-expanded]')?.click()
    }
  },
}

// An agent's composer: a notice above, where the turn runs as chips, what the
// agent is doing just above the box, the agent's own setting under it, and a
// hint. The model stays in the box as it does in a chat.
export const AgentComposer: StoryObj<{
  notice: boolean
  hint: string
  mode: NamedPermissionMode
  ceiling: NamedPermissionMode
  listsModes: boolean
}> = {
  args: {
    notice: true,
    hint: 'Enter sends, Shift+Enter adds a line',
    mode: DEFAULT_PERMISSION_MODE,
    ceiling: 'auto',
    listsModes: true,
  },
  argTypes: {
    mode: { control: 'select', options: NAMED_PERMISSION_MODES },
    ceiling: {
      control: 'select',
      options: NAMED_PERMISSION_MODES,
      description: "The machine's remoteMaxPermissionMode; the menu stops at it",
    },
    listsModes: {
      control: 'boolean',
      description: 'The machine lists the modes it accepts; off is one that predates auto',
    },
  },
  render: (args) => (
    <StoryChat>
      <div>
        <ChatInput
          onSend={send}
          attachments={false}
          requireModel={false}
          conversationId="agent-1"
          notices={
            args.notice && <NoticeCard tone="warning">This folder is not trusted yet.</NoticeCard>
          }
          activity={<span className="text-xs theme-muted-text">Reading files…</span>}
          context={
            <>
              <StatusBadge size="md" dot variant="success">
                build-01
              </StatusBadge>
              <StatusBadge size="md" className="font-mono">
                ~/src/app
              </StatusBadge>
            </>
          }
          settingsLeft={
            <PermissionPicker
              mode={args.mode}
              ceiling={args.ceiling}
              accepted={args.listsModes ? NAMED_PERMISSION_MODES : undefined}
              onPick={() => {}}
            />
          }
          hint={args.hint || undefined}
        />
      </div>
    </StoryChat>
  ),
}

// Alice's own provider and one Bob shared with her carry the same name; the
// picker names Bob as the owner of his. The organization's provider has no
// owner to name, and picking its model shows the allocation it bills. An
// adapter that lists models only gets the same labels from each model's
// owner. Sessions that did not answer head the list with their status. The
// play opens the picker.
export const SharedProviders: StoryObj<{
  pickerOpen: boolean
  listProviders: boolean
  unreachable: boolean
}> = {
  args: { pickerOpen: true, listProviders: true, unreachable: true },
  argTypes: {
    listProviders: {
      control: 'boolean',
      description: 'Adapter lists providers; off reads owners from the models',
    },
    unreachable: { control: 'boolean', description: 'Two sessions are not responding' },
  },
  render: (args) => {
    const Composer = () => {
      const adapter = useMemo(
        () =>
          makeStaticAdapter({
            providers: [
              { id: 'p-1', name: 'gateway', user: 'alice', cspKind: 'openai', status: 'active' },
              { id: 'p-2', name: 'gateway', user: 'bob', cspKind: 'openai', status: 'active' },
              { id: 'p-3', name: 'shared-pool', user: 'org', cspKind: 'other', status: 'active' },
            ],
            listProviders: args.listProviders,
            unreachableSessions: args.unreachable
              ? [
                  { name: 'gpu-box', owner: 'alice' },
                  { name: 'build-01', owner: 'alice' },
                ]
              : [],
            allocations: [
              { name: 'research', total: 500, used: 123.4 },
              { name: 'teaching', total: 100 },
            ],
          }),
        [],
      )
      return (
        <StoryChat adapter={adapter}>
          <div>
            <ChatInput
              onSend={send}
              conversationId="conv-shared-providers"
              settingsRight={<ComposerControls targetSession="alice:gpu-box" />}
            />
          </div>
        </StoryChat>
      )
    }
    return <Composer key={`${args.listProviders}${args.unreachable}`} />
  },
  play: async ({ canvasElement, args }) => {
    if (!args.pickerOpen) {
      return
    }
    // The models load after mount; the trigger stays disabled until they do.
    const trigger = await within(canvasElement).findByRole('combobox', { name: 'Model' })
    await waitFor(() => expect(trigger).toBeEnabled())
    await userEvent.click(trigger)
  },
}

// A phone-width composer with a host's usage meter: the meter gives way, the
// model name truncates, and send stays inside the box.
export const NarrowToolbar: StoryObj<{ width: number; usage: boolean }> = {
  args: { width: 360, usage: true },
  argTypes: {
    width: { control: { type: 'range', min: 280, max: 900, step: 10 } },
    usage: { control: 'boolean', description: 'Host supplies a usage meter' },
  },
  render: (args) => (
    <StoryChat adapter={makeStaticAdapter({ attachments: true })}>
      <div style={{ width: args.width, margin: '0 auto' }}>
        <ChatInput
          onSend={send}
          conversationId="conv-narrow"
          settingsRight={
            <>
              {args.usage && (
                <ComposerUsage>
                  <span style={{ whiteSpace: 'nowrap', fontSize: 10 }}>
                    1-day limit 34.2% used · 30-day limit 36.8% used
                  </span>
                </ComposerUsage>
              )}
              <ComposerControls />
            </>
          }
        />
      </div>
    </StoryChat>
  ),
}

// Text over inlineMaxBytes becomes a card. The play pastes three logs: the
// host saves the first, is still saving the second and refuses the third.
// Pastes of your own are saved.
export const LargePastes: StoryObj<{ inlineMaxBytes: number; uploadMs: number }> = {
  args: { inlineMaxBytes: 4_000, uploadMs: 600 },
  argTypes: {
    inlineMaxBytes: { control: { type: 'range', min: 1_000, max: 64_000, step: 1_000 } },
    uploadMs: { control: { type: 'range', min: 0, max: 5_000, step: 100 } },
  },
  render: (args) => {
    const Composer = () => {
      const { inlineMaxBytes, uploadMs } = args
      const pastes = useMemo(
        () =>
          makeComposerPastes({
            inlineMaxBytes,
            uploadMs,
            outcomes: ['saved', 'saving', 'refused'],
          }),
        // Composer is rebuilt whenever the story's args change.
        [],
      )
      return (
        <StoryChat>
          <div>
            <ChatInput onSend={send} conversationId="conv-pastes" pastes={pastes} />
          </div>
        </StoryChat>
      )
    }
    return <Composer />
  },
  play: async ({ canvasElement }) => {
    for (const lines of [412, 1_280, 96]) {
      pasteIntoComposer(canvasElement, makePasteText(lines))
    }
  },
}
