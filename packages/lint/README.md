# @parallelworks/lint

Biome rules for React apps localized with `use-intl`: text a person reads comes from the locale catalog, never a string literal.

- `ui-text.json` (`@parallelworks/lint/biome`): turns on Biome's [`style/noJsxLiterals`](https://biomejs.dev/linter/rules/no-jsx-literals/) as an error, allowing punctuation such as `·`, `/` and `→`. It catches JSX text: `<p>Hello</p>`.
- `ui-text.grit`: a Biome plugin for what that rule leaves out:
  - string children in braces: `{'Hello'}`, `` {`Welcome ${name}`} ``
  - display props: `label`, `title`, `placeholder`, `aria-label`, `alt`, `tooltip`, `description` and similar (example placeholders such as `https://example.com` or `localhost` are fine)
  - toasts: `toast('Saved')`, `toast.success(...)`, `.info`, `.warning`, `.error`, `.loading`

## Use

```sh
pnpm add -D @parallelworks/lint
```

```json
{
  "extends": ["@parallelworks/lint/biome"],
  "plugins": ["./node_modules/@parallelworks/lint/ui-text.grit"]
}
```

Biome resolves a plugin's path from the config that lists it, so the app names the plugin itself. In a monorepo, point at the package's `node_modules` (for example `./packages/web/node_modules/@parallelworks/lint/ui-text.grit`) and scope it with `overrides`.

Text that must stay as is, such as a product name or a code sample, takes Biome's own suppression with a reason:

```tsx
{/* biome-ignore lint/style/noJsxLiterals: product name */}
<span>ACTIVATE Platform</span>
{/* biome-ignore lint/plugin: product name */}
<Logo alt='ACTIVATE Platform' />
```
