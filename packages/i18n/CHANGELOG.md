# Changelog

## [0.3.0](https://github.com/parallelworks/foundation/compare/i18n-v0.2.0...i18n-v0.3.0) (2026-10-03)


### ⚠ BREAKING CHANGES

* props, options and interface members that were accepted but never read are removed from @parallelworks/ui: DependencyGraph initialScale, Dropdown onRangeChange, CollapsiblePanel shown/setShown, Table Item/Header props, CompactTable borderless/panel/theadClassName/isLoading/tableProps, editor options.theme, MultiSelectionDropdown className/secondaryField, FormikCustomDropdown parentValue/resetOnChange, ChatNavigation.toAttachments, ChatStrings.sidebar.moreOptions, SlashCommandOption.usage, the SET_THINKING and UPDATE_CURRENT_CONVERSATION_TITLE chat actions, IFileExplorerClient.getStorageName, IFileExplorerProvider.createClient, TStorage.region, and the wizard schema keys urlBased, navigation.showProgress and step canSkip.

### Bug Fixes

* **i18n:** add refuses a namespace name that would write outside the catalog ([#56](https://github.com/parallelworks/foundation/issues/56)) ([2c31a5f](https://github.com/parallelworks/foundation/commit/2c31a5f03a3a799c2b0820da24a5d78f0b13bcba))


### Code Refactoring

* drop props, options and code that did nothing, and merge duplicated helpers ([#74](https://github.com/parallelworks/foundation/issues/74)) ([7e56e1a](https://github.com/parallelworks/foundation/commit/7e56e1a3d331157f0c678f5c2feefa59988eb7de))

## [0.2.0](https://github.com/parallelworks/foundation/compare/i18n-v0.1.1...i18n-v0.2.0) (2026-10-02)


### Features

* **i18n:** parallelworks-i18n unused lists messages no source file references ([#36](https://github.com/parallelworks/foundation/issues/36)) ([6c958d7](https://github.com/parallelworks/foundation/commit/6c958d703f28a89408e5b90b3bcddf7679ecad84))

## [0.1.1](https://github.com/parallelworks/foundation/compare/i18n-v0.1.0...i18n-v0.1.1) (2026-10-02)


### Bug Fixes

* i18n and problem load from CommonJS too, such as a Vite config without type: module ([#30](https://github.com/parallelworks/foundation/issues/30)) ([c07bebf](https://github.com/parallelworks/foundation/commit/c07bebfa4f90d179f05c7a5caade34d97538bee3))
