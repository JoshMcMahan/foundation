# Changelog

## [0.12.0](https://github.com/parallelworks/foundation/compare/v0.11.0...v0.12.0) (2026-10-03)


### ⚠ BREAKING CHANGES

* props, options and interface members that were accepted but never read are removed from @parallelworks/ui: DependencyGraph initialScale, Dropdown onRangeChange, CollapsiblePanel shown/setShown, Table Item/Header props, CompactTable borderless/panel/theadClassName/isLoading/tableProps, editor options.theme, MultiSelectionDropdown className/secondaryField, FormikCustomDropdown parentValue/resetOnChange, ChatNavigation.toAttachments, ChatStrings.sidebar.moreOptions, SlashCommandOption.usage, the SET_THINKING and UPDATE_CURRENT_CONVERSATION_TITLE chat actions, IFileExplorerClient.getStorageName, IFileExplorerProvider.createClient, TStorage.region, and the wizard schema keys urlBased, navigation.showProgress and step canSkip.

### Features

* **problem:** problem pages answer in JSON too, so a CLI can show how to fix a problem ([#70](https://github.com/parallelworks/foundation/issues/70)) ([616dafc](https://github.com/parallelworks/foundation/commit/616dafc6119f3bd529e40c0f044026dc54702469))


### Bug Fixes

* **server:** a zero ShutdownTimeout gives in-flight requests 10 seconds to finish ([#75](https://github.com/parallelworks/foundation/issues/75)) ([9243361](https://github.com/parallelworks/foundation/commit/92433614ea6a160a289b5cc6783acea09dc878b4))


### Code Refactoring

* drop props, options and code that did nothing, and merge duplicated helpers ([#74](https://github.com/parallelworks/foundation/issues/74)) ([7e56e1a](https://github.com/parallelworks/foundation/commit/7e56e1a3d331157f0c678f5c2feefa59988eb7de))

## [0.11.0](https://github.com/parallelworks/foundation/compare/v0.10.0...v0.11.0) (2026-10-02)


### Features

* **problem:** error code pages explain why a problem happens and how to fix it, in the reader's language ([#43](https://github.com/parallelworks/foundation/issues/43)) ([dd74cef](https://github.com/parallelworks/foundation/commit/dd74cef4e23cf3acf0a0f894d5db6112697d06ca))
* **problem:** servers write problems in the reader's language, so every client can show them ([#42](https://github.com/parallelworks/foundation/issues/42)) ([ab516d9](https://github.com/parallelworks/foundation/commit/ab516d91703b5404ac7d879ed100f14ed1e8f039))
* **ui:** React components on one theme contract ([#44](https://github.com/parallelworks/foundation/issues/44)) ([5937c1e](https://github.com/parallelworks/foundation/commit/5937c1eaf975129090d78dfe33fe4ce5c1e2434e))

## [0.10.0](https://github.com/parallelworks/foundation/compare/v0.9.0...v0.10.0) (2026-10-02)


### Features

* **pgdb:** an application's own Postgres schema, with hopper's tables and goose migrations in it ([#40](https://github.com/parallelworks/foundation/issues/40)) ([84a00f8](https://github.com/parallelworks/foundation/commit/84a00f8bfd5005d014a95495821063d27ed2797f))

## [0.9.0](https://github.com/parallelworks/foundation/compare/v0.8.0...v0.9.0) (2026-10-02)


### Features

* **spa:** the app shell is gzipped and revalidates with an ETag, and public files revalidate too ([#38](https://github.com/parallelworks/foundation/issues/38)) ([eb58b0b](https://github.com/parallelworks/foundation/commit/eb58b0baf1f1b8835ce11b33c1578e10d13d4859))

## [0.8.0](https://github.com/parallelworks/foundation/compare/v0.7.0...v0.8.0) (2026-10-02)


### Features

* **spa:** the app's shell opens in the reader's language, chosen as the client would choose it ([#26](https://github.com/parallelworks/foundation/issues/26)) ([ee47248](https://github.com/parallelworks/foundation/commit/ee472483fb71f2dade573e7eb2a9ccd67d91914e))

## [0.7.0](https://github.com/parallelworks/foundation/compare/v0.6.0...v0.7.0) (2026-10-01)


### Features

* **problem:** a problem missing a param its message needs is sent as its status's problem ([#10](https://github.com/parallelworks/foundation/issues/10)) ([920f654](https://github.com/parallelworks/foundation/commit/920f65411e8e2012c65d2d740440a69e0862c62a))

## [0.6.0](https://github.com/parallelworks/foundation/compare/v0.5.0...v0.6.0) (2026-10-01)


### Features

* **problem:** CheckMessages checks an apiErrors map loaded from a split catalog ([#8](https://github.com/parallelworks/foundation/issues/8)) ([25e8eb2](https://github.com/parallelworks/foundation/commit/25e8eb2a8e2cc89ebc6408b4e179f795aeb4504a))
