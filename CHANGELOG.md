# Changelog

## [0.17.0](https://github.com/parallelworks/foundation/compare/v0.16.0...v0.17.0) (2026-10-29)


### Features

* **logctx:** contextual logger enrichment ([#571](https://github.com/parallelworks/foundation/issues/571)) ([195ec72](https://github.com/parallelworks/foundation/commit/195ec7267cc5568208949cf8861edc847c781cd1))
* **logctx:** contextual structured logging ([#569](https://github.com/parallelworks/foundation/issues/569)) ([7cfefd7](https://github.com/parallelworks/foundation/commit/7cfefd765b7a3989c80f9628477943a844a4b946))


### Bug Fixes

* **pgdb:** prevent startup hangs during concurrent index migrations ([#572](https://github.com/parallelworks/foundation/issues/572)) ([460ac4e](https://github.com/parallelworks/foundation/commit/460ac4e0e2786d3b11cdc8a9768230b2106ef9fe))

## [0.16.0](https://github.com/parallelworks/foundation/compare/v0.15.0...v0.16.0) (2026-10-28)


### ⚠ BREAKING CHANGES

* **pgdb:** remove bundled job queue integration ([#566](https://github.com/parallelworks/foundation/issues/566))

### Code Refactoring

* **pgdb:** remove bundled job queue integration ([#566](https://github.com/parallelworks/foundation/issues/566)) ([7c31bdf](https://github.com/parallelworks/foundation/commit/7c31bdfed3d9af193fb9537f0e672dd710e71659))

## [0.15.0](https://github.com/parallelworks/foundation/compare/v0.14.1...v0.15.0) (2026-10-21)


### ⚠ BREAKING CHANGES

* **problem:** only words a host wrote reach a reader, never a dependency's or huma's error text ([#464](https://github.com/parallelworks/foundation/issues/464))

### Features

* run warnings and editor problems take a problem code, params and type ([#423](https://github.com/parallelworks/foundation/issues/423)) ([72cc81e](https://github.com/parallelworks/foundation/commit/72cc81ee87531d0bab37d24f522cb3a11c31ba10))


### Bug Fixes

* **deps:** Go 1.27.3, for the crypto/x509 certificate verification advisory ([#465](https://github.com/parallelworks/foundation/issues/465)) ([57920ce](https://github.com/parallelworks/foundation/commit/57920ce5592c99fd7f6a9c10ad87fae8361dc3b6))
* **problem:** only words a host wrote reach a reader, never a dependency's or huma's error text ([#464](https://github.com/parallelworks/foundation/issues/464)) ([af65701](https://github.com/parallelworks/foundation/commit/af65701200d099bd93d2c69fbc6ccf1512301348))

## [0.14.1](https://github.com/parallelworks/foundation/compare/v0.14.0...v0.14.1) (2026-10-14)


### Bug Fixes

* **deps:** build with Go 1.27.2 for the standard library security fixes ([#205](https://github.com/parallelworks/foundation/issues/205)) ([577ef73](https://github.com/parallelworks/foundation/commit/577ef7309a0b3d9ccde21b4289b0fa32520c40cb))
* **spa:** reloading a page whose URL ends in a file name shows a 404 ([#251](https://github.com/parallelworks/foundation/issues/251)) ([9f93ac7](https://github.com/parallelworks/foundation/commit/9f93ac7f96e028f7f88aa14a81eed18d9d8c8d81))

## [0.14.0](https://github.com/parallelworks/foundation/compare/v0.13.0...v0.14.0) (2026-10-07)


### ⚠ BREAKING CHANGES

* **spa:** a set DevServer always proxies, so a stale build never takes Vite's place ([#117](https://github.com/parallelworks/foundation/issues/117))

### Features

* **server:** Serve binds before it logs, and logs a URL to reach the server ([#126](https://github.com/parallelworks/foundation/issues/126)) ([552eee7](https://github.com/parallelworks/foundation/commit/552eee75d4c8b902f2150209997362b4edbd3da9))
* **spa:** a set DevServer always proxies, so a stale build never takes Vite's place ([#117](https://github.com/parallelworks/foundation/issues/117)) ([cac9b21](https://github.com/parallelworks/foundation/commit/cac9b21da2becdbf16ca40a0aba43b34ee8eecd4))

## [0.13.0](https://github.com/parallelworks/foundation/compare/v0.12.0...v0.13.0) (2026-10-03)


### Features

* **problem:** shared problem pages read in every language ([#87](https://github.com/parallelworks/foundation/issues/87)) ([8b4a6f9](https://github.com/parallelworks/foundation/commit/8b4a6f96d90f048d5c664d12ed1697d05449fb51))

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
