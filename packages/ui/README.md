# @parallelworks/ui

React components built on one theme contract. Each surface is its own subpath,
so an application ships only what it imports:

| Subpath | Contents |
| --- | --- |
| `.` | theme contract, primitives (buttons, inputs, tables, tooltips, modals, dropdowns, settings layouts, page header), `UIProvider` |
| `./theme` | `deriveTheme`, presets, `applyTheme` |
| `./icons` | the icon barrel |
| `./list` | list pages, tables, row menus and list controls |
| `./form` | `DynamicForm` and its field registry |
| `./graph` | job dependency graph and tree view |
| `./editor` | Monaco editor (`monaco-editor` is an optional peer); YAML validation, completion and hover run in a bundled worker |
| `./logviewer` | log viewer with ANSI color and search |
| `./file-explorer` | object storage explorer over a host-supplied provider |
| `./ai`, `./ai/openai`, `./ai/mock` | chat interface and adapters |
| `./theme.css`, `./base.css`, `./fonts.css`, `./styles.css`, `./logviewer.css`, `./ai.css` | stylesheets |

Hosts bind notifications, strings, navigation, data hooks and the workflow
engine through `UIProvider`.

## Theme contract

Every color a component may use is one of the closed set of `--theme-*` CSS
variables, and every token is computable from a tiny seed — accent +
background + contrast — per surface (interface, and optionally sidebar).
Presets are named seeds; a custom theme is the same seed exposed directly.
Components consume only tokens and never branch on a light/dark flag.

```ts
import { deriveTheme, applyTheme, THEME_PRESETS } from '@parallelworks/ui/theme'

const vars = deriveTheme({ accent: '#06354f', background: '#f3f4f6' })
applyTheme(document.documentElement, vars)
```

Import the stylesheet contract once in your app:

```css
/* In a Tailwind v4 build: */
@import '@parallelworks/ui/theme.css';
@source '../node_modules/@parallelworks/ui/src/**/*.{ts,tsx}';
```

Consumers without a Tailwind build can import the compiled standalone
stylesheet instead:

```ts
import '@parallelworks/ui/styles.css'
```

The prebuilt stylesheet nests all of its rules in the `pw-ui` cascade layer,
so its precedence does not depend on where it loads. It includes Tailwind's
preflight reset; a host with its own Tailwind build should use the `@source`
route instead to avoid a double preflight.

## Icons

```tsx
import { AddIcon, LoaderIcon, TrashIcon } from '@parallelworks/ui/icons'
```

The barrel re-exports a curated, stable set of icon names over `react-icons`
so applications never depend on a specific icon pack directly.

Each icon ships as its own module under `dist/icons/<set>/`, so an application
bundles an icon only into the chunks that render it. Every module carries its
icon's data, copied from its `react-icons` set at build time, and opens with that
set's name and license.

## Workflow engine

The workflow surfaces (`/form`'s `DynamicForm`, `/graph`'s `DependencyGraph`,
the editor's workflow completions, and the log viewer's workflow commands) do
not implement a workflow format themselves. They call a `WorkflowEngine` that
the host passes once:

```tsx
import { UIProvider } from '@parallelworks/ui'

<UIProvider engine={engine}>{app}</UIProvider>
```

The engine converts input definitions into the form's field tree, resolves
`${{ }}` expressions, and supplies the job graph's dependencies, matrix
grouping, step labels and log paths. The form and graph throw without one; the
editor and log viewer fall back to plain behavior.

## AI chat

`@parallelworks/ui/ai` is a chat interface (thread, composer, streaming,
sidebar, model selector, attachments, sharing, branching) decoupled from any
backend through a `ChatAdapter`. State lives in `ChatProvider` and is read
with `useChat`:

```tsx
import { ChatProvider, ChatLayout, ChatThread } from '@parallelworks/ui/ai'
import { createMockChatAdapter } from '@parallelworks/ui/ai/mock'

export function Chat() {
  return (
    <ChatProvider
      adapter={createMockChatAdapter()}
      currentUser={{ id: 'u1', username: 'you', name: 'You' }}
      navigation={{ toConversation: id => {}, toNewChat: () => {}, toAttachments: () => {} }}
      notify={{ success: console.log, error: console.error, info: console.log }}
    >
      <ChatLayout>
        <ChatThread />
      </ChatLayout>
    </ChatProvider>
  )
}
```

Swap the mock for `createOpenAIChatAdapter({ baseUrl, apiKey })` from
`@parallelworks/ui/ai/openai`, or implement `ChatAdapter` against your own
backend. It requires `conversations`, `models` and `streamCompletion`; the
optional capability groups (`providers`, `attachments`, `sharing`,
`allocations`) hide their UI when absent. Adapter methods throw
`ChatAdapterError` with a user-facing `message`. Model entries and wire
messages keep OpenAI-compatible snake_case field names.

Tailwind v4 consumers add the chat rules (markdown rendering, streaming
animations) and streamdown's classes next to the theme contract:

```css
@import 'streamdown/styles.css';
@import '@parallelworks/ui/ai.css';
@source '../node_modules/streamdown/dist/*.js';
```

The prebuilt `@parallelworks/ui/styles.css` already includes both.
