import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo, useState } from 'react'
import type { SidebarState } from '../core/sidebarState'
import { makeStaticAdapter, makeSummaries, StoryChat } from '../stories/harness'
import ChatEmptyState from './ChatEmptyState'
import ChatLayout, { DRAWER_BELOW_PX, type SidebarMode } from './ChatLayout'

const meta: Meta = {
  title: 'Chat/Layout',
  component: ChatLayout,
  parameters: { layout: 'fullscreen' },
}

export default meta

function Frame({ width, children }: { width?: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        height: '100dvh',
        width: width ?? '100%',
        maxWidth: '100%',
        borderRight: width ? '1px solid var(--theme-border)' : undefined,
      }}
    >
      {children}
    </div>
  )
}

function useStoryAdapter() {
  return useMemo(() => makeStaticAdapter({ summaries: makeSummaries({ count: 12 }) }), [])
}

type InlineStoryArgs = { sidebar: 'reader' | SidebarState }

function InlineExample(args: InlineStoryArgs) {
  const adapter = useStoryAdapter()
  const [sidebar, setSidebar] = useState<SidebarState>(
    args.sidebar === 'reader' ? 'expanded' : args.sidebar,
  )
  const control = args.sidebar === 'reader' ? undefined : { sidebar, onSidebarChange: setSidebar }
  return (
    <StoryChat adapter={adapter} conversationId="conv-1" sidebarControl={control}>
      <Frame>
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {control && (
            <div className="flex items-center gap-2 border-b theme-border px-3 py-2 text-sm">
              <span className="theme-muted-text">Host header</span>
              {(['expanded', 'collapsed', 'hidden'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSidebar(s)}
                  className="rounded border theme-border px-2 py-0.5"
                  aria-pressed={sidebar === s}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0 }}>
            <ChatLayout>
              <ChatEmptyState />
            </ChatLayout>
          </div>
        </div>
      </Frame>
    </StoryChat>
  )
}

// The column beside the thread. 'reader' leaves the state to the reader's
// toggle; any other value is a host that owns it, and a host that hides the
// list brings it back from its own header.
export const Inline: StoryObj<InlineStoryArgs> = {
  args: { sidebar: 'reader' },
  argTypes: {
    sidebar: {
      control: 'select',
      options: ['reader', 'expanded', 'collapsed', 'hidden'],
      description: 'ChatProvider `sidebar`: who owns the state, and what the host set',
    },
  },
  render: (args) => <InlineExample {...args} key={args.sidebar} />,
}

type DrawerStoryArgs = { drawerOpen: boolean; drawerToggle: boolean }

function DrawerExample(args: DrawerStoryArgs) {
  const adapter = useStoryAdapter()
  const [drawerOpen, setDrawerOpen] = useState(args.drawerOpen)
  const [side, setSide] = useState<Side>('chats')
  return (
    <StoryChat
      adapter={adapter}
      conversationId="conv-1"
      sidebarControl={{ drawerOpen, onDrawerOpenChange: setDrawerOpen }}
    >
      <Frame width={390}>
        <ChatLayout
          sidebarMode="drawer"
          drawerToggle={args.drawerToggle}
          sidebarTop={() => <StorySwitch form="list" side={side} onSide={setSide} />}
          drawerBar={<StorySwitch form="bar" side={side} onSide={setSide} />}
        >
          <ChatEmptyState />
        </ChatLayout>
      </Frame>
    </StoryChat>
  )
}

// A phone: the thread takes the full width and the list opens over it from
// the toggle. A tap outside, Escape or picking a conversation closes it. The
// host's switch between lists stays beside the toggle while the drawer is shut.
export const Drawer: StoryObj<DrawerStoryArgs> = {
  args: { drawerOpen: true, drawerToggle: true },
  argTypes: {
    drawerOpen: { control: 'boolean', description: 'Open on first render' },
    drawerToggle: {
      control: 'boolean',
      description: 'ChatLayout `drawerToggle`: false when the host header opens the drawer',
    },
  },
  render: (args) => <DrawerExample {...args} key={`${args.drawerOpen}-${args.drawerToggle}`} />,
}

type AutoStoryArgs = { width: number; drawerBelowPx: number; sidebarMode: SidebarMode }

function AutoExample(args: AutoStoryArgs) {
  const adapter = useStoryAdapter()
  return (
    <StoryChat adapter={adapter} conversationId="conv-1">
      <Frame width={args.width}>
        <ChatLayout sidebarMode={args.sidebarMode} drawerBelowPx={args.drawerBelowPx}>
          <ChatEmptyState />
        </ChatLayout>
      </Frame>
    </StoryChat>
  )
}

// 'auto' follows the width the chat is given, not the window's: narrow the
// frame past drawerBelowPx and the column becomes a drawer.
export const Auto: StoryObj<AutoStoryArgs> = {
  args: { width: 600, drawerBelowPx: DRAWER_BELOW_PX, sidebarMode: 'auto' },
  argTypes: {
    width: { control: { type: 'range', min: 320, max: 1440, step: 10 } },
    drawerBelowPx: { control: { type: 'range', min: 400, max: 1200, step: 10 } },
    sidebarMode: { control: 'inline-radio', options: ['inline', 'drawer', 'auto'] },
  },
  render: (args) => <AutoExample {...args} />,
}

type Side = 'chats' | 'tasks'

// A host's own switch between lists, in the three places it can sit: across
// the top of the list, stacked on the rail, or beside the drawer toggle.
// Styled inline: story-only utility classes are not compiled.
function StorySwitch({
  form,
  side,
  onSide,
}: {
  form: 'list' | 'rail' | 'bar'
  side: Side
  onSide: (side: Side) => void
}) {
  const sides = [
    { key: 'chats' as const, label: 'Chats', short: 'C' },
    { key: 'tasks' as const, label: 'Tasks', short: 'T' },
  ]
  const rail = form === 'rail'
  return (
    <div
      style={{
        display: rail ? 'flex' : form === 'bar' ? 'inline-grid' : 'grid',
        flexDirection: 'column',
        alignItems: 'center',
        gridTemplateColumns: '1fr 1fr',
        gap: 2,
        margin: rail ? '8px 6px 4px' : form === 'list' ? '8px 8px 4px' : 0,
        padding: rail ? 0 : 2,
        borderRadius: 8,
        background: rail ? undefined : 'var(--theme-muted-panel-bg)',
      }}
    >
      {sides.map((s) => (
        <button
          key={s.key}
          type="button"
          aria-pressed={side === s.key}
          onClick={() => onSide(s.key)}
          style={{
            height: 28,
            minWidth: 28,
            padding: '0 10px',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 500,
            background: side === s.key ? 'var(--theme-panel-bg)' : 'transparent',
            color: side === s.key ? 'var(--theme-app)' : 'var(--theme-muted-text-color)',
            boxShadow: side === s.key ? '0 0 0 1px var(--theme-border)' : undefined,
          }}
        >
          {rail ? s.short : s.label}
        </button>
      ))}
    </div>
  )
}

function HostTopExample() {
  const adapter = useStoryAdapter()
  const [side, setSide] = useState<Side>('chats')
  return (
    <StoryChat adapter={adapter} conversationId="conv-1">
      <Frame>
        <ChatLayout
          sidebarActions={false}
          sidebarTop={({ collapsed }) => (
            <StorySwitch form={collapsed ? 'rail' : 'list'} side={side} onSide={setSide} />
          )}
        >
          <ChatEmptyState />
        </ChatLayout>
      </Frame>
    </StoryChat>
  )
}

// A host that lists more than chats puts its own switch above the list. It is
// told when the list is the rail, so it can shrink to icons there.
export const HostTop: StoryObj = {
  render: () => <HostTopExample />,
}
