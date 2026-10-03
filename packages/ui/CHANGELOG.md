# Changelog

## [0.21.0](https://github.com/parallelworks/foundation/compare/ui-v0.20.0...ui-v0.21.0) (2026-10-03)


### ⚠ BREAKING CHANGES

* **ui:** resetOnChange takes the path of the field whose change clears this one ([#79](https://github.com/parallelworks/foundation/issues/79))
* props, options and interface members that were accepted but never read are removed from @parallelworks/ui: DependencyGraph initialScale, Dropdown onRangeChange, CollapsiblePanel shown/setShown, Table Item/Header props, CompactTable borderless/panel/theadClassName/isLoading/tableProps, editor options.theme, MultiSelectionDropdown className/secondaryField, FormikCustomDropdown parentValue/resetOnChange, ChatNavigation.toAttachments, ChatStrings.sidebar.moreOptions, SlashCommandOption.usage, the SET_THINKING and UPDATE_CURRENT_CONVERSATION_TITLE chat actions, IFileExplorerClient.getStorageName, IFileExplorerProvider.createClient, TStorage.region, and the wizard schema keys urlBased, navigation.showProgress and step canSkip.

### Bug Fixes

* **ui:** a depends_on dropdown lists the options for the value its parent field holds ([#83](https://github.com/parallelworks/foundation/issues/83)) ([020994a](https://github.com/parallelworks/foundation/commit/020994a8e5a902a42bdbf6500e694b468de7b9ba))
* **ui:** a file cancelled before its upload starts no longer counts as uploaded ([#80](https://github.com/parallelworks/foundation/issues/80)) ([cca2933](https://github.com/parallelworks/foundation/commit/cca2933e448d3698bb7b536405455d0140e5cbcb))
* **ui:** a form input's sanitize pattern removes every disallowed character, not just the first ([#85](https://github.com/parallelworks/foundation/issues/85)) ([b92b955](https://github.com/parallelworks/foundation/commit/b92b955bcdc8c28a3f7c9a87e1acd409761c8c0f))
* **ui:** resetOnChange takes the path of the field whose change clears this one ([#79](https://github.com/parallelworks/foundation/issues/79)) ([031e2af](https://github.com/parallelworks/foundation/commit/031e2af8156fec82ba95b7e729b2bb5efedc201d))
* **ui:** the package type-checks again under erasableSyntaxOnly ([#72](https://github.com/parallelworks/foundation/issues/72)) ([187ae36](https://github.com/parallelworks/foundation/commit/187ae364f72e0a5e8c9464ae6a7239be5a43633a))


### Code Refactoring

* drop props, options and code that did nothing, and merge duplicated helpers ([#74](https://github.com/parallelworks/foundation/issues/74)) ([7e56e1a](https://github.com/parallelworks/foundation/commit/7e56e1a3d331157f0c678f5c2feefa59988eb7de))

## [0.20.0](https://github.com/parallelworks/foundation/compare/ui-v0.19.1...ui-v0.20.0) (2026-10-03)


### ⚠ BREAKING CHANGES

* **ui:** YAML editing runs on a bundled language server and monaco-editor 0.57 ([#65](https://github.com/parallelworks/foundation/issues/65))

### Features

* **ui:** icons for pull requests, people, places and documents ([#64](https://github.com/parallelworks/foundation/issues/64)) ([c64ef0c](https://github.com/parallelworks/foundation/commit/c64ef0c03b015b9d0647aa2d67e0fd8df2d0ab97))
* **ui:** YAML editing runs on a bundled language server and monaco-editor 0.57 ([#65](https://github.com/parallelworks/foundation/issues/65)) ([ffb26e6](https://github.com/parallelworks/foundation/commit/ffb26e6803731338d7eb10d70cc77b9ba38606c4))


### Bug Fixes

* **ui:** a long name in a user hover card is cut off next to its badge ([#58](https://github.com/parallelworks/foundation/issues/58)) ([2122dee](https://github.com/parallelworks/foundation/commit/2122dee19e899ee054a847b7b96acdb2706d8b4c))
* **ui:** links and downloads from a host or server cannot run script ([#55](https://github.com/parallelworks/foundation/issues/55)) ([4aee9e5](https://github.com/parallelworks/foundation/commit/4aee9e55bf3f98f900d4fe0ccd6be98854f1dec7))
* **ui:** Storybook links open dead pages and the chat empty state never shows a reply ([#59](https://github.com/parallelworks/foundation/issues/59)) ([c664223](https://github.com/parallelworks/foundation/commit/c664223975c59b33b1007cdb48377690959a9dc2))

## [0.19.1](https://github.com/parallelworks/foundation/compare/ui-v0.19.0...ui-v0.19.1) (2026-10-02)


### Bug Fixes

* **ui:** importing one component bundles its unrelated neighbors into the app ([#51](https://github.com/parallelworks/foundation/issues/51)) ([d448c5d](https://github.com/parallelworks/foundation/commit/d448c5d62999f1b93c5b1436f096ac19f3f20815))

## [0.19.0](https://github.com/parallelworks/foundation/compare/ui-v0.18.0...ui-v0.19.0) (2026-10-02)


### Features

* **ui:** React components on one theme contract ([#44](https://github.com/parallelworks/foundation/issues/44)) ([5937c1e](https://github.com/parallelworks/foundation/commit/5937c1eaf975129090d78dfe33fe4ce5c1e2434e))
