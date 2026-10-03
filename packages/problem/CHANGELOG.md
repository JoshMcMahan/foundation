# Changelog

## [0.3.0](https://github.com/parallelworks/foundation/compare/problem-v0.2.0...problem-v0.3.0) (2026-10-03)


### ⚠ BREAKING CHANGES

* props, options and interface members that were accepted but never read are removed from @parallelworks/ui: DependencyGraph initialScale, Dropdown onRangeChange, CollapsiblePanel shown/setShown, Table Item/Header props, CompactTable borderless/panel/theadClassName/isLoading/tableProps, editor options.theme, MultiSelectionDropdown className/secondaryField, FormikCustomDropdown parentValue/resetOnChange, ChatNavigation.toAttachments, ChatStrings.sidebar.moreOptions, SlashCommandOption.usage, the SET_THINKING and UPDATE_CURRENT_CONVERSATION_TITLE chat actions, IFileExplorerClient.getStorageName, IFileExplorerProvider.createClient, TStorage.region, and the wizard schema keys urlBased, navigation.showProgress and step canSkip.

### Bug Fixes

* **problem:** a locale written with an underscore gets its shared messages ([#76](https://github.com/parallelworks/foundation/issues/76)) ([a6f8f4d](https://github.com/parallelworks/foundation/commit/a6f8f4d64c6b4046ef54b37f85e2af0617dcf247))


### Code Refactoring

* drop props, options and code that did nothing, and merge duplicated helpers ([#74](https://github.com/parallelworks/foundation/issues/74)) ([7e56e1a](https://github.com/parallelworks/foundation/commit/7e56e1a3d331157f0c678f5c2feefa59988eb7de))

## [0.2.0](https://github.com/parallelworks/foundation/compare/problem-v0.1.1...problem-v0.2.0) (2026-10-02)


### Features

* **problem:** servers write problems in the reader's language, so every client can show them ([#42](https://github.com/parallelworks/foundation/issues/42)) ([ab516d9](https://github.com/parallelworks/foundation/commit/ab516d91703b5404ac7d879ed100f14ed1e8f039))

## [0.1.1](https://github.com/parallelworks/foundation/compare/problem-v0.1.0...problem-v0.1.1) (2026-10-02)


### Bug Fixes

* i18n and problem load from CommonJS too, such as a Vite config without type: module ([#30](https://github.com/parallelworks/foundation/issues/30)) ([c07bebf](https://github.com/parallelworks/foundation/commit/c07bebfa4f90d179f05c7a5caade34d97538bee3))
