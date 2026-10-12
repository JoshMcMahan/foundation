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

An engine can also carry `editing` (`WorkflowEditing`), the workflow model the
graph defers to for where jobs go: each job's slot from its `position` or a
stored layout, a matrix drawn as a run lists its jobs, and needs that wait for
any one of a matrix's jobs. A host built on a workflow package passes that
package's functions of the same names:

```tsx
const engine = { ...createWorkflowEngine(), editing: workflowPackage }
```

Without `editing`, the graph lays its jobs out by their needs alone.

The editor checks YAML against the schemas a host registers with `configureEditorYaml` from
`@parallelworks/ui/editor`. The job, step, input and settings dialogs edit their YAML at their own
paths (`JOB_YAML_PATH`, `STEP_YAML_PATH`, `INPUT_YAML_PATH`, `SETTINGS_YAML_PATH`); `settingsSchemas`
cuts the part of a workflow schema each one edits, for the host to register at that path under a URI
of its own (the YAML service reads a `#fragment` as an anchor and stops validating):

```ts
const { job, step, input, settings } = settingsSchemas(workflowSchema)
configureEditorYaml([
  { fileMatch: [JOB_YAML_PATH], uri: `${origin}/workflow-job.schema.json`, schema: job },
  // ...and the same for step, input and settings
])
```

Without them, those views still edit, but check nothing against the schema.

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

`ChatLayout sidebarMode="auto"` shows the conversation list as a drawer over
the thread when the chat is narrower than `drawerBelowPx` (768 by default),
measured on the chat's own box; `"drawer"` always does, and `"inline"` (the
default) never does. The reader's toggle drives the list unless the host
passes `sidebar` (`'expanded' | 'collapsed' | 'hidden'`) and `drawerOpen` to
`ChatProvider`, with `onSidebarChange` and `onDrawerOpenChange` to hear the
reader's requests. `useChat().toggleSidebar` opens or closes whichever the
layout shows, for a host header's own button.

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

## Form layouts

`DynamicForm` accepts an optional `$meta.layout` in `formJSONs`. A layout arranges
existing inputs; it never creates a value or changes an input's name, validation,
default, or saved-value path. Without a layout, the existing form behavior stays
unchanged.

```yaml
$meta:
  layout:
    type: grid
    columns: { base: 1, md: [2, 1] }
    gap: lg
    children:
      - type: field
        field: name
      - type: section
        label: Resources
        children:
          - { type: field, field: queue }
          - { type: field, field: nodes }
name: { type: string, label: Name }
queue: { type: dropdown, label: Queue, options: [cpu, gpu] }
nodes: { type: number, label: Nodes }
```

Layout nodes can nest:

| Type | Properties | Behavior |
| --- | --- | --- |
| `field` | `field` | References an input name in the current scope. |
| `stack` | `children`, optional `gap` | Stacks children vertically. |
| `grid` | `children`, `columns`, optional `gap`, `align` | Arranges children in equal or weighted columns. |
| `section` | `children`, `label`, optional `description`, `gap` | Groups controls in a labeled fieldset. |

`columns` accepts a count from 1 to 12, or an array of positive relative weights
such as `[2, 1]`. For responsive layouts, use an object with `base`, `sm`, `md`,
and/or `lg`. These thresholds refer to the **grid container's width**: 24rem,
40rem, and 64rem respectively. An omitted base starts with one column; each
larger threshold inherits the previous value. A plain count or weight array
applies at every width. Nested grids measure their own available space.

Every node can set `span`, as a count or the same responsive object. A span is
clamped to the current grid's column count. `gap` accepts `none`, `sm`, `md`
(default), or `lg`. Labels default to the top within an explicit layout;
`$meta.labelPosition` still overrides them.

A grid defaults to `align: independent`: its children start at the top and their
contents flow independently. Set `align: rows` when every immediate child is a
section. Adjacent sections then share a header row and one row per direct child.
A description, help text, or validation message increases the shared row height,
so the following rows stay aligned. A nested grid counts as one child row.
The grid's gap controls shared row spacing. Hidden children retain their row slot
while a neighboring section uses it; empty sections disappear. When the configured
grid becomes one column, sections flow vertically and hidden rows collapse.
Tab order follows each section's document order, including when the sections stack.
Wrapped field labels still belong to their individual field; row alignment aligns
field groups, not separate label and control baselines.

```yaml
type: grid
columns: { base: 1, md: [2, 1] }
align: rows
children:
  - type: section
    label: Resources
    description: Choose the capacity for this run.
    children:
      - { type: field, field: queue }
      - { type: field, field: nodes }
  - type: section
    label: Accounting
    children:
      - { type: field, field: account }
```

References are local names, not dotted paths. To arrange a group's children,
put a layout in that group's `items.$meta`; a list uses `template.$meta` and a
wizard page uses `options.$meta`. Keep `$meta.wizard` on the wizard container
and place layouts inside its pages. Layout and wizard metadata do not share
the same scope.

Unreferenced inputs render after the layout in schema order. Field visibility
keeps its existing semantics; empty layout containers disappear, and siblings
remain in their declared containers. Explicit layouts take precedence over
field `width` and `anchor-below` hints within that scope. Those hints keep their
existing behavior when no explicit layout is set.

Malformed layouts, unknown references, and duplicate references fall back to
the existing form layout, showing each input once. Hosts can call
`resolveFormLayout(layout, fieldNames)` from `@parallelworks/ui/form` to get
structured `issues` with node paths before saving a layout. Each layout scope is
limited to 1,024 nodes, 128 children per container, 64 nesting levels below the
root, and 65,536 total CSS UTF-16 code units. Names and section labels are limited
to 256 code units; descriptions to 4,096. Oversized layouts fall back to ordinary
fields. These renderer limits supplement host limits on workflow request size,
parsing, expression evaluation, and the number of input scopes. Authors can edit
this metadata in YAML; drag-and-drop layout authoring is a separate consumer
of the same contract.

### Optional layout CSS

Hosts can enable `allowLayoutCSS` on `DynamicForm` (default `false`). Each layout
node can then supply a `css` **declaration block**:

```yaml
type: field
field: account
css: "max-width: 28rem; padding: 0.5rem;"
```

Columns, spans, responsive breakpoints, and shared rows remain in the structured
layout. CSS provides spacing, sizing, alignment, surfaces, and typography. It styles
the content container of grids/stacks, the complete section including its heading,
and the wrapper of a field. Section titles accept the node's `font-size`,
`font-weight`, and `line-height`; field controls retain their component sizing.
No authored selectors target individual inputs, error messages, or surrounding UI.

The supported declarations are:

- Spacing and sizing: `gap`, `row-gap`, `column-gap`, `padding`, `padding-inline`,
  `padding-block`, the four physical padding longhands, `width`, and `max-width`.
  Nonnegative `px`, `rem`, `em`, `ch`, percentages, and `min()`, `max()`, or `clamp()`
  are accepted where the CSS grammar permits. Lengths are capped at 256 units and
  percentages at 100.
- Alignment: `align-items`, `justify-items`, `align-self`, `justify-self`, and
  `text-align`. Only the supported keywords accepted by the CSS grammar apply.
- Surfaces: `color`, `background-color`, `border`, the four physical border
  shorthands, `border-color`, `border-width`, `border-style`, and `border-radius`.
  Colors are opaque three- or six-digit hex values. Borders are limited to 8px
  or 0.5rem; radii to 32px or 2rem. Styles are solid, dashed, dotted, double, or none.
- Typography: `font-family` (serif, sans-serif, monospace, or the bundled
  `"Geist Sans"` / `"Geist Mono"`), `font-size` (12–96px or 0.75–6rem),
  `font-weight` (100–900), `font-style` (normal/italic), `line-height` (normal or 1–2),
  and `letter-spacing` (0–2px or 0–0.1em).

For a complete local theme, supply **both** `--form-surface` and `--form-accent`
as opaque hex colors in the same block:

```yaml
type: section
label: Delivery
css: >-
  --form-surface: #d4ed7a;
  --form-accent: #25320f;
  padding: 1.5rem;
  border-radius: 1rem;
  font-size: 1.5rem;
children:
  - type: field
    field: output
```

These two reserved declarations are color seeds, consumed by the existing theme
generator. It derives local text, input, focus, disabled, and status colors, plus
a color scheme for native controls. The generated variables live on that layout
node and inherit into its descendants; a child can start its own theme. Nothing
is written to the page root. Omitting the seeds preserves the host theme. A plain
`background-color` only paints the node; use the seeds when its controls also need
to follow the new palette. Arbitrary custom properties and direct theme-token
writes remain prohibited. With CSS enabled, the layout gets a paint containment boundary, so an oversized
surface cannot paint over adjacent application UI. A small inset preserves focus
rings. Popovers, tooltips, or dialogs that need to extend outside that boundary
must use a host-controlled portal and carry their own theme context into it.
Authors cannot change the boundary or portal destination through layout CSS.

CSS is parsed into an AST, checked against both this allowlist and CSS property
grammars, then applied through React style properties. No authored stylesheet,
selector, HTML, or style element is inserted. Imports, URLs, arbitrary custom properties,
`var()`, `attr()`, arbitrary functions, positioning, transforms, negative lengths,
and `!important` are rejected. Blocks are limited to 4,096 characters and 32
declarations. Any unsupported or malformed declaration discards the entire node's
CSS block; the structured layout and all input bindings continue to work.
`resolveLayoutCSS(css)` returns the accepted style object and diagnostic `issues`
for authoring tools; validate before saving and surface those issues to authors.
The workflow schema validates the string's shape and size; it does not authorize
CSS or replace runtime validation in the renderer.

This restricts the styling surface; it is not a sandbox for arbitrary CSS or a
security certification. Permitted sizing and color overrides can still produce an awkward or unreadable
form; validate authored designs for contrast and usability.
The host retains its CSP and its normal workflow publishing permissions. Enabling
this feature does not require allowing external stylesheets or weakening script
policy. Treat authors as trusted to design the contents of their own form: permitted
colors and sizing can obscure labels or make controls hard to use. Keep trusted
confirmation summaries, permissions, and security notices outside the authored
layout. Full stylesheets or mutually untrusted embedded applications require a
separate isolation design.
