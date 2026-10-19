# Changelog

## [0.18.0](https://github.com/parallelworks/foundation/compare/dev/v0.17.1...dev/v0.18.0) (2026-10-19)


### Features

* **dev:** dev clean keeps the disk from filling between runs and never trims the Go cache under a running build ([#389](https://github.com/parallelworks/foundation/issues/389)) ([8b39ef8](https://github.com/parallelworks/foundation/commit/8b39ef89a50a7ed60dbde3398c132f64ca7c5542))

## [0.17.1](https://github.com/parallelworks/foundation/compare/dev/v0.17.0...dev/v0.17.1) (2026-10-16)


### Bug Fixes

* **dev:** dev clean --install waits for launchd to let go of the old job ([#348](https://github.com/parallelworks/foundation/issues/348)) ([676faee](https://github.com/parallelworks/foundation/commit/676faeeb4361544b3c3a664023633287790931b6))

## [0.17.0](https://github.com/parallelworks/foundation/compare/dev/v0.16.0...dev/v0.17.0) (2026-10-16)


### Features

* **dev:** dev clean --install adds to the schedule instead of replacing it ([#346](https://github.com/parallelworks/foundation/issues/346)) ([f1f7714](https://github.com/parallelworks/foundation/commit/f1f7714ce9856c329b914d58d257db36ec63d5a2))

## [0.16.0](https://github.com/parallelworks/foundation/compare/dev/v0.15.0...dev/v0.16.0) (2026-10-13)


### Features

* **dev:** a service that runs once holds back its dependents until it finishes ([#223](https://github.com/parallelworks/foundation/issues/223)) ([6c21a8d](https://github.com/parallelworks/foundation/commit/6c21a8dd213760b9ecf38cec7a1af0e739116a46))

## [0.15.0](https://github.com/parallelworks/foundation/compare/dev/v0.14.0...dev/v0.15.0) (2026-10-12)


### Features

* **dev:** add dev clean for finished worktrees and Go's build cache ([#214](https://github.com/parallelworks/foundation/issues/214)) ([bef4881](https://github.com/parallelworks/foundation/commit/bef4881c69dfd27508b27de754df9aa42103e677))


### Bug Fixes

* **deps:** build with Go 1.27.2 for the standard library security fixes ([#205](https://github.com/parallelworks/foundation/issues/205)) ([577ef73](https://github.com/parallelworks/foundation/commit/577ef7309a0b3d9ccde21b4289b0fa32520c40cb))

## [0.14.0](https://github.com/parallelworks/foundation/compare/dev/v0.13.0...dev/v0.14.0) (2026-10-08)


### Features

* **dev:** w wraps long lines in the log view ([#168](https://github.com/parallelworks/foundation/issues/168)) ([ee0023e](https://github.com/parallelworks/foundation/commit/ee0023e2a1ea6304cae3a8614ffaa79c67f046ce))

## [0.13.0](https://github.com/parallelworks/foundation/compare/dev/v0.12.0...dev/v0.13.0) (2026-10-08)


### Features

* **dev:** the global dev runs itself where a repository pins an older one ([#165](https://github.com/parallelworks/foundation/issues/165)) ([db0d718](https://github.com/parallelworks/foundation/commit/db0d71824a4d8d952cb2c258bae114c1b4591cda))

## [0.12.0](https://github.com/parallelworks/foundation/compare/dev/v0.11.1...dev/v0.12.0) (2026-10-08)


### Features

* **dev:** dev down stops any checkout's dev from anywhere, and dev ps says how ([#163](https://github.com/parallelworks/foundation/issues/163)) ([b1d0ca2](https://github.com/parallelworks/foundation/commit/b1d0ca2d11c24b9ff7c0c30384a6da300380b4e9))

## [0.11.1](https://github.com/parallelworks/foundation/compare/dev/v0.11.0...dev/v0.11.1) (2026-10-08)


### Bug Fixes

* **dev:** dev fails before writing the secrets its env reads, and a failed start leaves terminal replies in the shell ([#160](https://github.com/parallelworks/foundation/issues/160)) ([2895141](https://github.com/parallelworks/foundation/commit/289514140267b93f6e5e2202ac0244e80128f33b))

## [0.11.0](https://github.com/parallelworks/foundation/compare/dev/v0.10.0...dev/v0.11.0) (2026-10-07)


### Features

* **dev:** ${NAME} in dev.json env composes values around secrets and profiles' settings, and dev.Env exports them ([#157](https://github.com/parallelworks/foundation/issues/157)) ([5bd5e1a](https://github.com/parallelworks/foundation/commit/5bd5e1ab20e778454d428c46d14419aee7c8e454))


### Bug Fixes

* **dev:** a port under 1024 moves to a random one on macOS though the server could bind it ([#158](https://github.com/parallelworks/foundation/issues/158)) ([d6c2c15](https://github.com/parallelworks/foundation/commit/d6c2c1577765cd65282dce063f70d3891253cec9))

## [0.10.0](https://github.com/parallelworks/foundation/compare/dev/v0.9.0...dev/v0.10.0) (2026-10-07)


### Features

* **dev:** dev.Instances lists running devs and their ports for an app's own tools ([#155](https://github.com/parallelworks/foundation/issues/155)) ([9386a1e](https://github.com/parallelworks/foundation/commit/9386a1e50c28cf43d5e4e619dc18ba173d94bf3d))

## [0.9.0](https://github.com/parallelworks/foundation/compare/dev/v0.8.0...dev/v0.9.0) (2026-10-07)


### Features

* **dev:** an app's own dev adds rows and keys to the view, and tools to dev mcp ([#151](https://github.com/parallelworks/foundation/issues/151)) ([5c08f33](https://github.com/parallelworks/foundation/commit/5c08f338f346b24a49bb1ff929c12706a818c275))
* **dev:** dev use and the view's p switch a running dev to other profiles ([#150](https://github.com/parallelworks/foundation/issues/150)) ([7044720](https://github.com/parallelworks/foundation/commit/7044720845f5503137dcd81f9000ee869bd76f7e))
* **dev:** profiles choose between setups per checkout, such as local or shared data ([#148](https://github.com/parallelworks/foundation/issues/148)) ([0dafe31](https://github.com/parallelworks/foundation/commit/0dafe31779298778dbcd6988461264f107b82bc3))
* **dev:** services depend on others, restart on failure, rebuild on checkout, and name the checkout ([#147](https://github.com/parallelworks/foundation/issues/147)) ([20cf179](https://github.com/parallelworks/foundation/commit/20cf179bde5a43edea154a318a14c7e57739839e))

## [0.8.0](https://github.com/parallelworks/foundation/compare/dev/v0.7.0...dev/v0.8.0) (2026-10-07)


### Features

* **dev:** install dev globally, and it runs each repository's own dev ([#143](https://github.com/parallelworks/foundation/issues/143)) ([8c88705](https://github.com/parallelworks/foundation/commit/8c887050e671c7f97af9d7a8702f0e93f23cf269))

## [0.7.0](https://github.com/parallelworks/foundation/compare/dev/v0.6.1...dev/v0.7.0) (2026-10-07)


### Features

* **dev:** dev mcp lets agents drive a checkout's dev as tools ([#140](https://github.com/parallelworks/foundation/issues/140)) ([a0c7029](https://github.com/parallelworks/foundation/commit/a0c70292c42d4d6d6179b1ca38e1cd99faa5c8eb))
* **dev:** the view attaches to a dev already running, such as one dev up started ([#139](https://github.com/parallelworks/foundation/issues/139)) ([4eaefc5](https://github.com/parallelworks/foundation/commit/4eaefc5bc7469e73de290df6c7552e302622b90a))

## [0.6.1](https://github.com/parallelworks/foundation/compare/dev/v0.6.0...dev/v0.6.1) (2026-10-07)


### Bug Fixes

* **dev:** dev ps lists every dev from anywhere, with no dev.json needed ([#136](https://github.com/parallelworks/foundation/issues/136)) ([a54baa1](https://github.com/parallelworks/foundation/commit/a54baa12a9570ff3705e49a5b96f628416f47b1d))

## [0.6.0](https://github.com/parallelworks/foundation/compare/dev/v0.5.1...dev/v0.6.0) (2026-10-07)


### Features

* **dev:** dev up runs in the background, with dev down, ps, status --json and exec for tools and agents ([#131](https://github.com/parallelworks/foundation/issues/131)) ([7bebaef](https://github.com/parallelworks/foundation/commit/7bebaef620c7895542d99320e49b56f90e6caee2))
* **dev:** ports are allocated, so checkouts and apps run side by side ([#130](https://github.com/parallelworks/foundation/issues/130)) ([2020ae6](https://github.com/parallelworks/foundation/commit/2020ae6dd1f2c1aa4a16f20596a83098b90a3fc5))

## [0.5.1](https://github.com/parallelworks/foundation/compare/dev/v0.5.0...dev/v0.5.1) (2026-10-07)


### Bug Fixes

* **dev:** startup is visible in the view, and dev wait waits through it ([#128](https://github.com/parallelworks/foundation/issues/128)) ([ec2c7a7](https://github.com/parallelworks/foundation/commit/ec2c7a7f9db3b5976037c56aebaf09ef391dec5e))

## [0.5.0](https://github.com/parallelworks/foundation/compare/dev/v0.4.0...dev/v0.5.0) (2026-10-07)


### Features

* **dev:** an interactive view of the services, and commands to drive a running dev ([#122](https://github.com/parallelworks/foundation/issues/122)) ([e0ac469](https://github.com/parallelworks/foundation/commit/e0ac469084a36c71519ddba6334e7b9271db3cd4))
* **dev:** health URLs tell when a service is ready, and dev wait waits for services ([#123](https://github.com/parallelworks/foundation/issues/123)) ([08f0a50](https://github.com/parallelworks/foundation/commit/08f0a50d35647b96ee4479d986bb16d4019ce9ba))
* **dev:** services link to where they are open, and the view keeps its help at the bottom ([#124](https://github.com/parallelworks/foundation/issues/124)) ([f7f5a9d](https://github.com/parallelworks/foundation/commit/f7f5a9d2f8dede7fdbb89c54a8985889f39af845))

## [0.4.0](https://github.com/parallelworks/foundation/compare/dev/v0.3.0...dev/v0.4.0) (2026-10-06)


### ⚠ BREAKING CHANGES

* **dev:** services, an env that names the stack, and a log per service ([#118](https://github.com/parallelworks/foundation/issues/118))

### Features

* **dev:** services, an env that names the stack, and a log per service ([#118](https://github.com/parallelworks/foundation/issues/118)) ([238cc08](https://github.com/parallelworks/foundation/commit/238cc0814e9ea4593c08bd85d0377bb961110930))

## [0.3.0](https://github.com/parallelworks/foundation/compare/dev/v0.2.0...dev/v0.3.0) (2026-10-06)


### Features

* **dev:** before commands prepare an app before anything starts ([#114](https://github.com/parallelworks/foundation/issues/114)) ([37ffe7f](https://github.com/parallelworks/foundation/commit/37ffe7f425a71dca486755d23e352386f5ff5c36))

## [0.2.0](https://github.com/parallelworks/foundation/compare/dev/v0.1.0...dev/v0.2.0) (2026-10-06)


### Features

* **dev:** dev runs the stack, the server with hot reload and the app's processes in one terminal ([#108](https://github.com/parallelworks/foundation/issues/108)) ([6d6f716](https://github.com/parallelworks/foundation/commit/6d6f716766078053bdd777dcb144ac860347cb61))

## 0.1.0 (2026-10-06)


### Features

* **dev:** go tool dev runs Postgres and S3 for local development, and is the base of an app's own dev command ([#100](https://github.com/parallelworks/foundation/issues/100)) ([4fd3576](https://github.com/parallelworks/foundation/commit/4fd3576f4c83d3bad84bde5d27e46bbcd1712747))
