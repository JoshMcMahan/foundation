# @parallelworks/ui

React components built on one theme contract. Each surface is its own subpath,
so an application ships only what it imports:

| Subpath | Contents |
| --- | --- |
| `.` | theme contract, primitives (buttons, inputs, tables, tooltips, modals, dropdowns, settings layouts, page header), `UIProvider` |
| `./theme` | theme seeds and presets, `generateTheme`, `applyTheme`, `fitSeed` |
| `./icons` | the icon barrel |
| `./list` | list pages, tables, row menus and list controls |
| `./form` | `DynamicForm` and its field registry |
| `./graph` | job dependency graph and tree view, and the visual workflow editor: the graph, the run form as an inputs editor, and their dialogs |
| `./editor` | Monaco editor (`monaco-editor` is an optional peer), loaded on first mount with the languages it needs; YAML validation, completion and hover run in a bundled worker |
| `./logviewer` | log viewer with ANSI color and search |
| `./file-explorer` | object storage explorer over a host-supplied provider |
| `./access` | `AccessDrawer`: who has access to a resource, and granting roles to people and groups |
| `./ai`, `./ai/openai`, `./ai/mock` | chat interface and adapters |
| `./theme.css`, `./base.css`, `./fonts.css`, `./styles.css`, `./logviewer.css`, `./ai.css` | stylesheets |

Hosts bind strings, navigation, data hooks and the workflow engine through
`UIProvider`, which also shows the package's toasts:

```tsx
<UIProvider
  strings={{ common: { save: 'Speichern' }, fileExplorer: { preview: { open: 'Öffnen' } } }}
  navigation={{ goTo: navigate }}
  data={{ useRunFile, usePersistedState }}
  slots={{ link: RouterLink }}
  engine={() => import('./engine').then((m) => m.engine)}
>
  {app}
</UIProvider>
```

Every string has an English default, and `strings` overrides any of them at
any depth. Each concern has its own context, compared by value, so a host may
pass object literals: a render that passes equal ones re-renders nothing, and
new `data` re-renders only what reads data. `navigation` is read when the
package navigates and never re-renders anything. Define slot components and
string functions outside a component: one made each render is a new value, and
a new slot component remounts what it renders.

Under `UIProvider` the components render no inline `<style>`, so they run
under a Content Security Policy whose `style-src` is `'self'` alone; the one
rule a select or scroll area would inject ships in `theme.css`. A host that
renders on the server passes its policy's `nonce`, which the few components
that emit a script to place themselves before hydration put on it.

## Which component?

Each need has one component. Reach for it before styling markup by hand.

| Need | Use |
| --- | --- |
| An action | `Button`; `IconButton` for an icon alone, named by its tooltip |
| Navigation, in any form | the component's `href` (see [Links](#links)); `AppLink` for a link of your own |
| Another component's trigger that looks like a button | `buttonClasses()` |
| A link out of the app | `ExternalLink` |
| Work under way | `Loader`; `Skeleton` in a `LoadingRegion` for the shape of content still loading |
| Nothing to show yet, or nothing matches | `EmptyState` |
| A text field | `Input`, `Textarea`, or a control framed by `Field`, whose `actions` hold buttons that act on it |
| A number, a date, a color | `NumberInput`, `DatePicker`, `ColorInput` |
| A one-time code, such as a sign-in check | `OneTimeCodeInput` |
| A labeled value nobody edits, among fields | `FieldValue` in a `Field` |
| A record's details, such as in a drawer or a card: names and values on their own | `DescriptionList` of `DescriptionListItem`s; `copy` on an ID, `mono` on a path, `variant="card"` to frame them; titled lists in a `DescriptionListGroup` to share one label column |
| An error beside a control outside a `Field` | `ErrorText` |
| A dense field in a toolbar or a table cell | any field control with `size="sm"`; a width in `className` wins, and `cx` merges classes the same way |
| On or off | `Switch`; `Checkbox` in a list of things to tick, several of which may be on; either in a `Field` with `controlFirst` to read control, label, then its help and description |
| One of a few choices, all shown | `RadioGroup` in a form; `SegmentedControl` in a toolbar, or as a field's control in a `Field group` |
| Narrowing a list by values, such as statuses: several at once, or one or none | `ToggleGroup` |
| Narrowing what is shown by typing | `SearchInput`; `ListSearchControl` on a list page's toolbar |
| A value from a list | `Select`, or `Combobox` when the list needs filtering; its `details` pane describes the highlighted item, and `onQueryChange` hands the search to the host |
| Free text with suggestions, or tags | `Autocomplete`; `Combobox` with `multiple creatable` |
| A range | `Slider` |
| A page's breadcrumbs, title and commands | `PageHeader`, shown by the shell's `PageHeaderBar` (see [Page header](#page-header)) |
| A trail anywhere else, such as a folder's path in a panel | `Breadcrumbs`, which folds as the header's trail does |
| An action in the page header | `PageHeaderAction`; `PageHeaderAddButton` for "+ Add" or "+ Create"; `PageHeaderMenu` for the "…" menu |
| A titled part of a page or form | `Section` |
| More detail under a line | `Disclosure` |
| Views of one thing | `Tabs` |
| Chrome that stays in view as the page scrolls | `sticky` on `ActionToolbar` or `Tabs`; `StickyBar` around controls of your own. They stack under the page header by themselves (see [Host chrome](#host-chrome)) |
| A list of actions | `ActionMenu`; `useContextMenu` for a right-click or a row's menu |
| A panel of controls anchored to a trigger | `Popover` |
| A hint for a control | `Tooltip`; a `Field`'s `help` for more about a field, which its control reads and which opens as Tab reaches it; `InfoTip` for help about anything else |
| A preview of what a link leads to | `HoverCard` |
| A task that blocks the page | `Modal`, laid out with `title`, `description` and `footer` as a `Drawer` is; `ConfirmModal` to confirm one action; `CreateModal` to name and create one thing |
| A panel beside the page | `Drawer`; `onBack` for a view it opens over its first, such as a form |
| Who has access to something, and changing it | `AccessDrawer` from `./access` (see [Access](#access)) |
| A message set into the page: guidance, a warning, an error | `Callout`; `variant="bar"` across a surface under its header |
| A passing notice, or the progress of work in the background | `toast` |
| How full something is, how far a task has come | `Meter`, `ProgressBar` |
| Pages of a long list | `Pagination` |
| A grouped page of settings | `SettingsCard` with `SettingRow`s |
| A person | `Avatar`, colored by name without a picture |
| A status in words | `StatusBadge`, or `StatusDot` beside text that says it |
| A run's, job's or step's status beside its name | `RunStatusIcon`; `StatusBadge` with `runStatusTone` to say it in words |
| A copy action | `CopyButton`; `CopyCodeBlock` for a command or snippet; `useCopy` for a menu row or a control of your own |
| A live relative time or duration | `RelativeTime`, `Elapsed` |
| Rendered Markdown | `Markdown` |
| Code or YAML to read or edit | `Editor` from `./editor`; `EditorField` as a form field, `FormCodePanel` for a form's values as JSON |
| A run's jobs, steps, logs and annotations | `DependencyGraph` from `./graph`, as a graph or a list |
| A workflow's jobs drawn from its YAML, or edited by hand | `DependencyGraphPreview` from `./graph`, editable with an `editor`; `InputsFormEditor` for its run form |
| A value that survives a reload | `usePersistedState` |
| Choosing the app's colors | `ThemeEditor`, applied with `useApplyTheme` |

Some pairs look alike and are split on purpose:

- **Section or Disclosure.** A `Section` is a titled part of a page or form: its
  title is a heading in the page's outline, and folding it keeps its fields
  mounted. A `Disclosure` is a line inside content that reveals detail beneath
  it, such as a tool call's arguments, and adds nothing to the outline.
- **Popover or HoverCard.** A `Popover` opens on a press and holds controls or a
  list, so keyboard and touch reach it. A `HoverCard` opens on hover or focus
  and only previews what its anchor already leads to; nothing in it may be
  reachable only there.
- **Menu or Popover.** A menu is a list of actions or choices that closes once
  one is picked, with arrow-key navigation and type-ahead. Anything else
  anchored to a trigger, such as a form or a filter panel, is a `Popover`.
- **Tabs or SegmentedControl.** `Tabs` switch between views or pages of one
  thing, each with its own panel or route. A `SegmentedControl` sets a value,
  such as a time range, that changes what one view shows. `Tabs` with
  `variant="segmented"` look the same, so the choice rests on what pressing does.
- **SegmentedControl or ToggleGroup.** A `SegmentedControl` holds a setting
  that always has exactly one value, such as a time range or which view of the
  data to show. A `ToggleGroup` filters a list by values and may be off: its
  options are pressed independently, or one or none with `multiple={false}`,
  and `all` leads with an All option for "no filter". Each option can carry a
  status dot or icon and a count.
- **SearchInput or ListSearchControl.** A `SearchInput` is a box that is
  always shown and narrows what sits beside it, such as a panel's rows or a
  log's lines. `ListSearchControl` belongs to a list page's toolbar: it folds to
  a button, opens on ⌘F or `/`, and keeps terms as chips the list remembers.
- **StatusBadge or RunStatusIcon.** A `StatusBadge` says a status in words in
  its tone, for anything. A `RunStatusIcon` shows the status of something that
  ran as an icon beside its name, and turns while it runs; `runStatusTone` gives
  a badge for the same status the same tone.
- **Select or Combobox.** A `Select` picks from a short list it shows in full.
  A `Combobox` filters as you type, for a list long enough to search, and is the
  one that takes several values, new ones, or free text (`Autocomplete`).

## Page header

A page declares its header in one place, and the shell shows it:

```tsx
// The shell, once: the provider above the bar and the routes.
<PageHeaderProvider>
  <Sidebar />
  <div className="flex min-w-0 flex-1 flex-col">
    <PageHeaderBar compact={fullBleed} persistent={isMobile} />
    <main><Outlet /></main>
  </div>
</PageHeaderProvider>

// A page.
<PageHeader
  breadcrumbs={[{ label: 'Clusters', href: '/clusters' }, { label: cluster?.name ?? '' }]}
  titleActions={
    <>
      <PageHeaderAction icon={EditIcon} iconOnly label="Rename" onClick={rename} />
      <PageHeaderMenu items={menu} />
    </>
  }
  actions={
    <PageHeaderAction icon={SaveIcon} label="Save" onClick={save} disabled={!dirty} disabledReason="No changes" />
  }
/>
```

- **`breadcrumbs`** is the whole trail, ending with the page itself, which the
  bar makes the page's one `h1` (`aria-current="page"`). Don't render another
  `h1`. An empty label, such as a name still loading, shows a placeholder. The
  trail is a list in a `nav` landmark named by the strings' `breadcrumb`. A
  trail too wide for its bar folds its ancestors into a "…" menu of links
  (named by `showFullPath`), keeping the parent when it fits beside the page's
  name; the name truncates last, with the full name on hover. The bar draws it
  with `Breadcrumbs`, which renders the same trail anywhere else: in a flex
  row it takes the room the row's other items leave it, and elsewhere its
  container's width. `current="location"` marks a place within the page, such
  as the open folder, and `heading` makes the last crumb the page's `h1`, as
  the bar does.
- **`titleActions`** sit beside the title, for actions on the page's subject.
  **`actions`** sit at the end of the bar, for the page's commands: a detail
  page's Start, Stop or Terminal go here, not in a row of buttons below it.
  `ActionToolbar` (from `./list`) is for the controls of a panel on the page,
  such as a log's follow and refresh: its buttons are outlined, and `primary`
  fills the one, if any, the panel leads to.
  **`toolbar`** is a row under the bar, such as tabs or a time range.
- **`hidden`** takes the bar away while the page is mounted, for a page that
  fills the window.

The actions render in the page's React tree, so they keep its context and
state, and show in the bar through portals; they come before the page's content
in focus order. Any component may render a `PageHeader`, such as a form adding
its Save button: the bar shows the actions of all of them, outermost first,
and the trail of the last one rendered that has one. A layout renders its own
before its `Outlet`, so a page under it that names a trail replaces the
layout's, and a page that doesn't keeps it. Changing pages swaps the header
before paint, and a page's actions go when it unmounts.

`PageHeaderBar` renders nothing while the page declares nothing, unless it is
`persistent`, as on a narrow screen where it holds the `navToggle` slot. The
`breadcrumbPin` slot renders after the trail. Without a `PageHeaderProvider`, a
`PageHeader` renders its bar in place, for a page with no shell.

The header's actions share one control: a link (`href`, with `external` for a
new tab), a button (`onClick`, with `pressed` for a toggle) or a menu (`menu`).
`destructive` takes the error color. A `disabled` one stays focusable and says
its `disabledReason` in its tooltip and name.

## Menu and row actions

A `MenuAction`, and the `RowAction` and `ToolbarAction` built on it, does
exactly one thing: runs `onClick`, navigates to `href`, or copies `copy`. An
action with none of them, or with two, doesn't compile, so a row that silently
does nothing when chosen can't ship. `checked` makes an `onClick` row an on/off
choice, and `reloadDocument` belongs to an `href`. A disabled action keeps its
behavior. In development, a menu row, pinned row button or toolbar button warns
in the console when it gets an action with no behavior anyway, from JavaScript
or a cast.

Moving to it:

- Rename a handler kept under another name, such as `onSelect`, to `onClick`.
  An action built apart from its array, typed loosely or by another interface,
  slipped past the old type; it now fails where it joins the array.
- Leave out an action that can't run, rather than passing
  `onClick: cond ? run : undefined` or `href: url ?? undefined`:
  `...(cond ? [{ key, label, onClick: run }] : [])`.
- Drop `onClick` from a `copy` or `href` action, and `checked` from an `href`
  or `copy` one. To copy and also do something, call `useCopy` in an `onClick`.
- Write `RowAction` and `ToolbarAction` as types, not interfaces to extend:
  `type MyAction = RowAction & { … }`.

## Themes

Every color a component may use is one of the closed set of `--theme-*` CSS
variables. Components read only those tokens and never branch on a light or dark
flag. A theme is not the tokens but a few picked values, a seed, from which every
token is generated:

```ts
import type { Theme } from '@parallelworks/ui/theme'

const theme: Theme = {
  version: 1,
  light: { interface: { base: '#f3f4f6', accent: '#06354f', contrast: 30 }, sidebar: { base: '#06354f' } },
  dark: { interface: { base: '#111418', accent: '#5b9ccf' } },
  code: 'balanced',
}
```

- **`base`** is the page background. Its lightness decides the mode, so a seed
  is light or dark by what it looks like. A near-white base keeps panels pure
  white.
- **`accent`** is used exactly for the primary button and the selection; text on
  it, links, focus rings and tints are solved from it.
- **`contrast`** runs 0 to 100, 30 by default. It spreads the surfaces apart and
  raises text toward the WCAG and APCA targets below. Even 0 meets WCAG AA.
- **`sidebar`** takes its own `base` and `accent`; leave it out and the sidebar
  follows the page.
- **`light` and `dark`** are both optional: a missing mode is derived from the
  other, so a theme with one scheme still follows the device.
- **`code`** picks the syntax and terminal palette: `balanced`, `vivid`, `muted`
  or `mono`.

A theme is plain JSON. Store it as it is; `parseTheme` reads one back (a string
or a parsed value) and returns `{ ok: false, error: { code, path } }` instead of
throwing, so an import can say which field is wrong. `serializeTheme` writes one.

### How tokens are generated

Generation works in OKLCH. Neutrals take the base's hue with a faint tint toward
the accent; surfaces step away from the base by an amount the contrast scales,
with a knee at 30 so the upper half of the slider changes more gently. Dark text
on a tinted light base carries several times the base's chroma, as hand-made
slate and gray scales do, while light text on a dark base carries less. Each text
color is then solved: a binary search on lightness, at its own hue and chroma,
until it reaches its target against every surface it sits on.

| Pair | WCAG at 0 / 30 / 100 | APCA Lc |
| --- | --- | --- |
| Body text | 4.5 / 7 / 12 | 75 / 90 / 105 |
| Secondary text, links, status text, syntax and terminal colors | 4.5 / 4.5 / 7 | 60 / 70 / 85 |
| Placeholders | 3 / 3 / 4.5 | 45 / 50 / 65 |
| Focus ring, status icons, dots, borders and bars | 3 / 3 / 4.5 | |
| Control edges | 3 / 3 / 4.5 | |
| Text field edges | 1.3 / 1.5 / 3 | |
| Text on the accent, white text on a solid status fill | 4.5 | |

Lines come in three tokens. `--theme-border` is decorative: card outlines,
dividers and table lines, which stay quiet. `--theme-border-strong` is a
control's edge: the box of a checkbox, the ring of a radio, and the off track of
a switch or slider. It is all that shows where the control is, so it is solved
to WCAG 1.4.11's 3:1 on the page, the panels and the input fill. A checked
control's edge, an on switch's track and a slider's filled part take
`--theme-focus`: the accent as picked when it reaches 3:1, and otherwise the
accent solved to secondary text's contrast, so on always reads heavier than the
off track. `--theme-border-field` is a text field's resting edge: inputs,
selects, textareas and pickers. A field is also found by its label, its size and
the text inside it, and a form of 3:1 boxes reads heavy, so its edge sits
between the other two and reaches 3:1 at contrast 100. Pointing at a field
raises its edge to `--theme-border-strong`. A host that sets
`--theme-border-strong` itself sets it to a color that keeps 3:1 against its
surfaces.

Status colors (success, error, warning, info, favorite) and terminal colors keep
fixed hues, so red means the same thing in every theme.

Each status comes in four tokens, so a red icon stays bright while red words stay
readable:

| Token | For | Solved to |
| --- | --- | --- |
| `--theme-error` | Icons, dots, borders, rings, bars: anything but words | 3:1 on every surface and on the muted tint (WCAG 1.4.11) |
| `--theme-error-text` | Words in the status: error messages, a destructive menu item or text button, a badge's label | Secondary text's targets, on the surfaces and on the muted tint |
| `--theme-error-solid` | A fill under a white label, such as a destructive button | White on it at 4.5:1 |
| `--theme-error-muted` | A tinted background, such as a callout or badge | The vivid shade at 10% (15% in dark mode) |

The same four exist for `success`, `warning`, `info` and `favorite`. Words never
take the bare token: `--theme-error` meets only the 3:1 that graphics need. An
icon beside an error message may keep the message's text shade through
`currentColor`. Syntax colors turn away
from the accent's hue when they come within 30° of it, so a keyword never looks
like a link.

Eight category colors tell things apart without ranking them:
`--theme-category-1` to `--theme-category-8` are soft fills at hues 45° apart,
all at one lightness and chroma so none reads louder, and each
`--theme-category-N-text` is solved to secondary text's targets on its fill. An
`Avatar` without a picture takes one, picked by an FNV-1a hash of its name (or
its `colorKey`), so the same name has the same color on every page; a nameless
one keeps the accent. `categoryOf(key)` gives the same pick, 1–8, and
`categoryClasses(key)` its fill and text classes, for anything else drawn
beside a name, such as a group's icon.

Every color is mapped into sRGB with the CSS Color 4 method, which lowers
chroma at fixed lightness and hue. It is mapped into display-p3 too: where the
wider color differs from sRGB by more than one just-noticeable difference
(ΔEOK 0.02), it is emitted under `@media (color-gamut: p3)`. The contrast
targets are checked in both gamuts.

### Applying a theme

```ts
import { applyTheme, generateTheme, schemeFor, resolveMode } from '@parallelworks/ui/theme'

const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches
const mode = resolveMode('system', prefersDark) // 'light' or 'dark'
applyTheme(document.documentElement, generateTheme(schemeFor(theme, mode), { code: theme.code }))
```

In React, `useColorMode(preference)` follows the device while the preference is
`system`, and `useApplyTheme(theme, mode)` applies the theme to the document
root (or to an element you pass) and sets `color-scheme`. `applyTheme` sets the
display-p3 values on a wide-gamut screen. To render a theme on the server,
`themeStylesheet(selector, scheme)` returns a stylesheet with both blocks; given
`{ light, dark }` schemes, it pairs each token's two values with `light-dark()`.
`deriveTheme(scheme)` returns the sRGB tokens alone.

`theme.css` defines the default theme's tokens for both modes, each as
`light-dark()`, so a page renders before any script runs and a token the host
leaves unset follows the `color-scheme` it sets:

```css
/* In a Tailwind v4 build: */
@import '@parallelworks/ui/theme.css';
@source '../node_modules/@parallelworks/ui/dist/components';
@source '../node_modules/@parallelworks/ui/dist/list';
```

The package publishes only `dist`, built one JavaScript module per source
module under the same folders as its subpaths (`dist/components`, `dist/list`,
`dist/form`, `dist/ai` and so on), so `@source` points at those modules. List
the folders of the subpaths the host imports: each one adds the utilities of
every component in it. Scanning all of `dist` works too, but also reads the
editor's bundled workers in `dist/assets`. A host that wants only a few
components can name their modules one by one, such as
`dist/components/Avatar.js`, as long as it also names the modules they style
through, such as `dist/components/floating.js` for a popup's panel.

Consumers without a Tailwind build can import the compiled standalone
stylesheet instead:

```ts
import '@parallelworks/ui/styles.css'
```

The prebuilt stylesheet nests all of its rules in the `pw-ui` cascade layer,
so its precedence does not depend on where it loads. It includes Tailwind's
preflight reset; a host with its own Tailwind build should use the `@source`
route instead to avoid a double preflight.

### Editing a theme

`ThemeEditor` is controlled: it takes `value` and `onChange`, with presets, a
color picker and hex field for each seed, the contrast slider, a custom sidebar,
the code palette, copy, import and reset. Pass `preference` and
`onPreferenceChange` to show the light, dark and system choice. It shows a
scoped preview of the theme beside the controls; with `preview={false}` and
`useApplyTheme`, the whole app is the preview. Its strings are in
`UIStrings.theme`.

### Code

Code blocks in `Markdown`, highlighted diffs, the Monaco editor and the log
viewer's ANSI colors all read the `--theme-code-*` and `--theme-ansi-*` tokens,
so they follow the theme without a light or dark switch. Monaco takes only
hex, so it gets the sRGB colors and redefines its theme when the tokens change.

### Moving a stored palette to a seed

`fitSeed(colors)` takes the colors a theme stored as tokens (any of them) and
returns the seed that comes closest, with a report:

```ts
const { scheme, report } = fitSeed({ '--theme-app-bg': '#f4f6f8', '--theme-accent': '#0b7a75' })
report.verdict // 'faithful', 'close' or 'changed'
report.worst   // the tokens furthest from what was stored
```

Each token's distance is ΔEOK × 100, so 2 is about one just-noticeable
difference. A fit is `faithful` when the main tokens are within 2 and none is
over 5, and `close` within 5 and 10. A stored color that failed WCAG AA is
marked `correctedForContrast` and left out of the verdict, since the generated
one is meant to differ.

### Renamed tokens

| Before | Now |
| --- | --- |
| `--theme-element` | `--theme-accent` |
| `--theme-element-text` | `--theme-accent-text` |
| `--theme-element-hover` | `--theme-accent-hover` |
| `--theme-panel`, `--theme-hover-text` | `--theme-app` |
| `--theme-muted-panel-color` | `--theme-muted-text-color` |
| `--theme-card-bg` | `--theme-panel-bg` |
| `--theme-card-hover` | `--theme-panel-hover` |
| `--theme-card-border` | `--theme-border` |
| `--theme-hover-overlay` | `--theme-hover` |
| `--theme-input-disabled-text` | `--theme-placeholder` |
| `--theme-input` | `--theme-focus` |
| `--theme-auth-shadow` | `--theme-shadow-xl` |
| `--theme-sidebar-hover-text` | `--theme-sidebar-text` |
| `--theme-bg` | `--theme-sidebar-bg` |
| `theme-element` (utility) | `theme-accent` |

`--theme-<status>` (`success`, `error`, `warning`, `info`, `favorite`) was once
solved as text. It is now the vivid graphic shade, so words that read it move to
`--theme-<status>-text`, and a fill under a white label to
`--theme-<status>-solid`.

## Buttons and spinners

Every pressable thing has one look, from `buttonClasses({ variant, size, iconOnly })`:

| Variant | For |
| --- | --- |
| `primary` | the one action a view leads to |
| `secondary` | actions beside it |
| `outline`, `ghost` | toolbar and inline actions, bordered or not |
| `danger` | confirming what can't be undone |

Sizes are `xs`, `sm` and `md`. `Button` and `IconButton` apply it. An
`IconButton` is named by its tooltip, and takes `pressed` for a toggle and
`dot` for an indicator. Either takes `href` to be a link in the same look. Pass
`buttonClasses()` to another component's trigger rather than styling a button
by hand. A pressed toggle
(`aria-pressed`) and an open popup's trigger read as selected.

`Loader` is the one spinner. Inside a button, or beside text that already
says what is happening, use `<Loader inline decorative />`.

## Links

Navigation is a link, never a button whose `onClick` navigates: a link opens
in a new tab with a middle or modified click, can be copied, shows its URL on
hover, and reads as a link. Every component that can navigate takes `href`,
with `reloadDocument` for a path the host's router doesn't serve and `target`
where it opens elsewhere, and renders it through `AppLink`:

| Surface | Navigates with |
| --- | --- |
| `Button`, `IconButton`, `Card` | `href` |
| Menu rows, `RowAction`s (a list row's menu and pinned buttons), `ToolbarAction`s | `href` on the action, with `target: '_blank'` for a new tab |
| `PageHeaderAction`, `PageHeaderAddButton`, `PageHeader` breadcrumbs | `href`; `external` opens a new tab |
| `Breadcrumbs` | `href` on the crumb; `onSelect` only for a place with no URL, as the explorer's trail without `pathHref` |
| `Tabs` that are pages, `Pagination` | `href` on the item, `pageHref` |
| A list row | `ListRow` `href` with a `NameCell` of the same `href`: the name's link covers the row |
| A toast's action | `action: { label, href }` |
| `SidebarRailItem` | `href`; `onSelect` then runs only on a plain click |
| `FileExplorer` rows, tree, trail and "Open folder" | `pathHref(path)`; `onPathChange` is then optional, and the explorer's own moves go to `navigation.goTo` |
| `EmptyState`, `SettingsCard` actions | a `Button` with `href` |

`AppLink` routes in-app URLs through the provider's `link` slot, so a host
binds its router's `Link` there once. That link receives the whole URL, search
and hash included, and routes it client-side on a plain click, leaving
modified and middle clicks to the browser. `AppLink` passes every href through
`safeUrl`, gives a `reloadDocument` or another origin a plain anchor, and
renders a disabled link with no href and `aria-disabled`, still focusable for
its tooltip. Work a link's `onClick` does beside navigating, such as closing a
drawer, belongs to a plain click only: check `isPlainClick(event)`.

## Toasts

`toast` shows a notice from anywhere, a component or not. `UIProvider` renders
them along the top of the window, above dialogs, where they clear a modal's
panel and stay usable while it is open: pressing one doesn't close the dialog.
A screen reader hears each one; errors interrupt, the rest wait for a pause.

```ts
import { toast } from '@parallelworks/ui'

toast.success('Saved')
toast.error('Could not save', { action: { label: 'Retry', onClick: save } })

const id = toast.loading('Uploading…')
toast.update(id, { tone: 'success', message: 'Uploaded' })

await toast.promise(save(), { loading: 'Saving…', success: 'Saved', error: 'Could not save' })
```

Tones are `info`, `success`, `warning` and `error`. A toast closes itself after
five seconds, eight for a warning or an error, pausing while the pointer or focus
is on it; `timeout: false` keeps it. `loading` stays until an update settles it
into a tone. Pass an `id` to replace a toast rather than stack another.

## Access

`AccessDrawer` shows who holds which role on one resource, and grants and takes
them away. A role is a named set of permissions; people and groups are granted
roles, never permissions one by one. Two roles may overlap: the drawer works the
overlap out from each role's `permissions` and says so as a hint ("Sudo covers
this too"), and before a role is taken away it lists exactly what is lost, the
permissions nothing they keep still gives, and what they keep: their other
roles, a person's groups' roles, everyone's, and roles granted above the
resource.

```tsx
import { AccessDrawer, type AccessChange } from '@parallelworks/ui/access'

<AccessDrawer
  open={open}
  onClose={close}
  resourceName={cluster.name}
  roles={[{ id: 'login', name: 'Login', description: 'Sign in.', permissions: ['cluster:login'] }]}
  permissions={[{ id: 'cluster:login', label: 'Sign in' }]}
  principals={[
    { id: 'org', name: 'Everyone', kind: 'everyone', memberCount: 214 },
    { id: 'u-ana', name: 'Ana Ruiz', kind: 'user', detail: 'ana@example.com', groupIds: ['g-data'] },
    { id: 'g-data', name: 'data-eng', kind: 'group', memberCount: 24 },
  ]}
  grants={grants} // { principalId, roleId }[]
  owner="u-ana"
  inherited={[{ principalId: 'g-admins', roleId: 'org-admin', from: 'the organization' }]}
  onChange={(change: AccessChange) => api.patch(change)} // { grant, revoke }
  describeGroup={(id, signal) => api.group(id, { signal })}
  searchPrincipals={(query, signal) => api.principals({ query, signal })}
  readOnly={!canManage}
  readOnlyReason="Only people with the Admin role can change it."
/>
```

- `onChange` gets one change at a time, holding only grants that change
  something. Return a promise: its rows show they are saving until it settles,
  and when it rejects the drawer says that nothing changed and offers Retry. A
  saved change offers Undo in a toast. Pass the new grants back through
  `grants`; the drawer never keeps its own copy.
- `principals` holds every person and group that holds a role here or owns it,
  the groups those people are in, and everyone if the resource can be granted
  to everyone (`kind: 'everyone'`, at most one). Without `searchPrincipals` it
  is also the list to grant to; with it, the picker asks the host as the reader
  types, and lists people and groups apart.
- A person's `groupIds` name the groups they are in. Only groups holding a role
  here matter, and with them, taking a role from the person says what they keep
  through those groups.
- `owner` names the principal who owns the resource. It has every permission,
  shows first, and can't be removed; granting it a role adds nothing.
- `inherited` holds roles granted above the resource, such as to the whole
  organization. They show locked, "through" where they were granted, and count
  toward what someone keeps. A role held only that way takes
  `grantable: false`, so it isn't offered to grant here.
- `describeGroup` fills the pane beside the picker for the highlighted group:
  where it comes from, its first members and when it last changed. It is asked
  once per group while the drawer is mounted, and aborted when the highlight
  moves on. A person's pane comes from the principal itself.
- `privileged` roles are labeled in the role picker. Granting anything to
  everyone says how many people it reaches and asks to confirm, with a
  destructive button when a privileged role is among them.
- A development build warns about duplicate ids, and grants, inherited grants
  or an owner that name unknown roles or principals.

## Host chrome

Popups, dialogs and drawers portal to `<body>` and read the tokens from the
document root. A host with fixed chrome tells overlays where it is, on the same
root:

| Variable            | Meaning                                                                 |
| ------------------- | ----------------------------------------------------------------------- |
| `--app-inset-top`   | The height of a fixed top bar. Drawers and toasts start below it.       |
| `--app-inset-start` | The width of a fixed sidebar on the start side. Toasts center over the page beside it, and a drawer at its widest leaves that strip, and never less than 2.5rem. Update it when the sidebar collapses. |

```ts
document.documentElement.style.setProperty('--app-inset-top', '56px')
document.documentElement.style.setProperty('--app-inset-start', '220px')
```

Sticky chrome stacks by itself, with no offsets to set. A page's pinned pieces,
`ActionToolbar sticky`, `Tabs sticky`, a `StickyBar` around controls of the
page's own, and a table's header row (`Table stickyHeader`, which list tables
use), each stop just below whatever their scrolling box already pins at the top.
Each finds the elements there with `position: sticky` and a `top` whose parent
also holds it, so they stay pinned while it passes, and follows them as they
wrap to a new height or come and go, before the page paints. In a box that
scrolls on its own, such as a fixed-height panel or `ListPage`'s rows, they pin
at the box's top.

The stack starts from the host's page header. Put it inside the page's
scroller, ahead of the page, with `position: sticky` and a `top`, such as
`sticky top-0`: as a child of the scroller or of a wrapper the page also sits
in. A header above the scroller, outside it, needs nothing: the page's chrome
pins at the scroller's top, just under it.

```tsx
<div className="overflow-auto">
  <header className="sticky top-0 z-(--layer-header)">…</header>
  <main>
    <StickyBar className="px-4 py-1.5">
      <ActionToolbar groups={actions} />
    </StickyBar>
    <Tabs label="Cluster" sticky items={tabs} />
    <Table stickyHeader>…</Table>
  </main>
</div>
```

Everything the package lays over the page stacks on one scale, set on the
document root by `base.css`. Give the host's own fixed elements a place on it,
such as `z-index: 100` for a top bar, rather than a z-index chosen to win:

| Variable          | Default | For                                                    |
| ----------------- | ------- | ------------------------------------------------------ |
| `--layer-sticky`  | 10      | toolbars and tab strips that stick as the page scrolls |
| `--layer-header`  | 20      | the page header, which sticks above them               |
| `--layer-overlay` | 1000    | a panel over the page, such as a full-screen log       |
| `--layer-drawer`  | 1100    | drawers                                                |
| `--layer-modal`   | 1200    | modals                                                 |
| `--layer-popover` | 1300    | menus, selects, popovers, hover cards and tooltips, so one opens over the dialog it belongs to |
| `--layer-toast`   | 1400    | toasts                                                 |

In Tailwind, `z-(--layer-modal)` reads one. Override a value on `:root` to move
a layer; the defaults sit in a cascade layer, so the host's own rule wins.

## Icons

```tsx
import { AddIcon, TrashIcon } from '@parallelworks/ui/icons'

<Button><AddIcon /> Add</Button>
<TrashIcon className="size-4 text-(--theme-error)" />
```

`@parallelworks/ui/icons` is the one import point for interface icons. Each
name is a meaning, such as `RetryIcon` or `WarningIcon`, drawn from
[Lucide](https://lucide.dev), so every icon shares one 24px grid and one 2px
stroke. Don't import `lucide-react` directly: a name here keeps one glyph per
meaning across the apps.

- **Size and color:** an icon is `1em` square in `currentColor`, so it follows
  the text around it. A class such as `size-4` or `h-3 w-3` sets another size,
  and `size` takes pixels.
- **Accessibility:** an icon is decoration, hidden from assistive technology,
  unless a `title` or `aria-label` names it. Name one only when nothing beside
  it says what it means.
- **Filled variants:** a filled glyph marks a state, such as `PinFilledIcon`
  for pinned.
- **One name per meaning:** pick the name for what the thing is, even where a
  nearby name would look similar. For compute, `ClusterIcon` is a group of
  nodes, `NodeIcon` one host or node in it, and `InstanceIcon` a VM or cloud
  instance. `RemoveIcon` takes an item out of a list, while `CloseIcon` closes,
  dismisses or clears; they share the X glyph, the convention for both.
  `DestroyIcon` tears down what was provisioned, while `TrashIcon` deletes a
  record. `RemoveUserIcon` takes someone out of a group or project, while
  `DisableUserIcon` turns off their account. `ChangesRequestedIcon` asks for
  changes to something sent, while `FlaggedIcon` marks an item for attention.
  `ProjectIcon` is a project, while `FolderIcon` is a folder of files.
  `LibraryIcon` is a collection of write-ups to browse, `ArticleIcon` one
  write-up to read, such as a case study, and `NotebookIcon` one notebook.
  `PendingIcon` is a requirement not met yet and `NotRunningIcon` a run not
  started; they share the empty circle, so keep them out of the same list.
- **Adding an icon:** pick the [Lucide glyph](https://lucide.dev/icons) and add
  `export const NameIcon = /* @__PURE__ */ icon(Glyph)` to `src/icons.tsx`,
  named for what it means rather than what it shows. Reuse an existing name
  when the meaning is the same.

Logos of other companies' products, such as `GitHubIcon` or `UbuntuIcon`, are
in `@parallelworks/ui/brand-icons`. They take the same props, are filled in the
text's color, and are only for naming the product. They come from Simple Icons
(CC0) and Bootstrap Icons (MIT), and the file carries their notices.

The `UI/Icons` story shows every icon and logo by name.

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

The graph draws thousands of jobs, and subworkflows opened inline several levels deep. Layout is
near linear in jobs and needs; hovering a job re-renders only the nodes and connectors whose
highlight changes, and panning, zooming and a running run's clock re-render none. The view fits
the whole graph, zooms out to 1% to show the shape of the largest, and in to 200% to read a node;
the wheel zooms by the same factor at every scale, about the pointer.

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

Without them, those views still edit, but check nothing against the schema. Registering a schema
under a `uri` already registered replaces it, and `configureEditorYaml` returns a function that
removes what it added.

`Editor` is controlled like an input: pass `value` and `onChange`, and hand back the text it sent.
Text that comes back unchanged leaves the cursor alone, and a reset from outside keeps the cursor
and scroll where they were. Each editor has a model of its own unless it is given a `path`, and it
is named `UIStrings.common.codeEditor` unless given an `ariaLabel`.

Monaco comes from the host's own `monaco-editor` through its bundler, never from a CDN, and loads
when the first editor mounts, so it stays out of the host's first bundle. Its workers are files in
the package that the host's bundler copies, started with `new Worker(url)`: a CSP needs
`worker-src 'self'` and no `blob:`. The YAML language server starts with the first YAML model.

The editor colors every language Monaco has, Bash among them (as shell), and fetches each
language's coloring only when an editor shows it. It validates and formats JSON. The TypeScript,
CSS and HTML language services are left out, as each runs in a worker of megabytes; their text is
still colored. `addEditorLanguages` adds a language service and its workers, by the label Monaco
asks for, or a language of the host's own. It loads with the next editor to mount; call it once
at startup. With Vite:

```ts
import { addEditorLanguages } from '@parallelworks/ui/editor'

const tsWorker = () =>
  new Worker(new URL('monaco-editor/language/typescript/ts.worker.js', import.meta.url), {
    type: 'module',
  })
// The TypeScript service checks JavaScript too, and asks for a worker under each label.
addEditorLanguages({
  load: () => import('monaco-editor/languages/features/typescript/register'),
  workers: { typescript: tsWorker, javascript: tsWorker },
})
```

`readOnly` makes it a view of code to read, such as a file's contents: the text stays selectable,
copyable and reachable by keyboard and is announced read-only, while the cursor, current line and
quick fixes are hidden, the view ends at the last line, and the wheel scrolls the page once the text
has scrolled to its end. Any of these can be set otherwise with Monaco's own options. `disabled`
greys the text out as well, as a disabled field does.

## AI chat

`@parallelworks/ui/ai` is a chat interface (thread, composer, streaming,
sidebar, model selector, attachments, sharing, branching) decoupled from any
backend through a `ChatAdapter`. State lives in `ChatProvider` and is read
with `useChat`; the reply being streamed is read with `useChatStream`, apart
from the rest, so only what draws the reply re-renders for each token:

```tsx
import { ChatEmptyState, ChatLayout, ChatProvider, ChatThread } from '@parallelworks/ui/ai'
import { createMockChatAdapter } from '@parallelworks/ui/ai/mock'

export function Chat({ conversationId }: { conversationId: string | null }) {
  return (
    <ChatProvider
      adapter={createMockChatAdapter()}
      currentUser={{ id: 'u1', username: 'you', name: 'You' }}
      navigation={{ toConversation: id => {}, toNewChat: () => {} }}
      activeConversationId={conversationId}
    >
      <ChatLayout>
        {conversationId ? <ChatThread conversationId={conversationId} /> : <ChatEmptyState />}
      </ChatLayout>
    </ChatProvider>
  )
}
```

The chat's links (each conversation, a new chat, attachments, and the
`extraLinks` pages) render through the config's `LinkComponent`, which gets a
`ChatLinkTarget`; without one they go to `/chat/:id`, `/chat` and
`/chat/attachments` through `UIProvider`'s link slot. Navigation in the chat is
these links, so `navigation` handles only the moves that aren't clicks, such as
keyboard shortcuts.

`ChatLayout sidebarMode="auto"` shows the conversation list as a drawer over
the thread when the chat is narrower than `drawerBelowPx` (`DRAWER_BELOW_PX`, 896, by default),
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

For math, `Markdown` imports KaTeX's stylesheet itself, from the `katex` package, so the host's bundler loads it and its fonts
with the markdown renderer's lazy chunk. The bundler must accept CSS imported
from JavaScript, as the editor's Monaco also requires. The renderer's math
plugins still ask for katex 0.16, which has a prototype-pollution advisory;
override them to the katex this package asks for, so they render with the copy
the stylesheet comes from, as with pnpm:

```yaml
overrides:
  'katex@<0.19.0': '^0.19.0'
```

Inline math takes `$$` within a sentence; a single `$` stays text, so prices
are never read as math.

## Form state

`DynamicForm` keeps its values in react-hook-form, a peer dependency, so the
host and the library share one instance. A host that reads or drives the form
creates it and passes it in:

```tsx
const form = useForm()
const { isDirty } = useFormState({ control: form.control })

<DynamicForm form={form} formJSONs={inputs} initialValues={saved} />
```

`form.getValues()`, `form.reset()` and `formState.isDirty` then work as
react-hook-form documents them. Without `form`, the form keeps its own;
`onValuesChange` reports each change either way.

## Validation

A field with neither `optional` nor a `default` needs a value. A submit, or
Next on a wizard page, checks the fields the form shows, says "Enter a value."
under each empty one and holds until it is filled; once a field shows an
error it checks again with each change. A hidden field, a disabled one and a
boolean never hold the form.

`serverErrors` shows what the server rejected, each under its field until the
person changes it. A path may come in any convention: a workflow's
`hosts[0].cpus`, a problem response's JSON Pointer `#/hosts/0/cpus`, or
`hosts.0.cpus`. Without a message the field says to check its value. They
never hold back Next or a submit, since the server checks again, and a wizard
turns to the first page holding one. From a problem response:

```tsx
const fieldMessages = useFieldMessages() // @parallelworks/problem/react
<DynamicForm serverErrors={save.error ? fieldMessages(save.error) : undefined} … />
```

A field component receives the form's message as `error`; `fieldFrame(props)`
shows it through `Field`.

Each field subscribes only to what it reads, so typing renders the edited
field and whatever reads it, not the whole form. A host field component,
passed through `fields` or `slots.formFields`, binds the same way: its own
value with `useFieldValue(field.name)`, which also gives the form the field's
rules (a component's own `useController` would drop them), another input's
with `useFieldAt(path)` or `useWatch`, and a pick from a list with
`useChoiceField`, which applies `autoselect` and `secondaryField`.

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
contents flow independently, except that fields side by side line up their
controls. A label that wraps to two lines sits at the foot of a label row the
fields in that row share, so its control stays level with its neighbors'.
Set `align: rows` when every immediate child is a
section. Adjacent sections then share a header row and one row per direct child.
A description or validation message increases the shared row height,
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
