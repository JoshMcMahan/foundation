# dev

`dev` runs an app's whole development setup in one terminal: Postgres 18 and
an S3-compatible server natively, with data kept between runs; its Go servers,
rebuilt and restarted when their sources change; and processes beside them,
such as Vite.

Install it once, and use `dev` in every repository that has a `dev.json`:

```sh
go install github.com/parallelworks/foundation/dev/cmd/dev@latest
```

In a repository that pins dev in its tools module, the global `dev` runs the
pinned version instead of itself when the pin is newer, so a repository that
needs a later dev gets it on every machine. When the global one is as new or
newer it runs itself: a newer dev reads an older `dev.json` as it was meant, so
its new commands work everywhere without bumping each repository, while CI,
scripts and agents run the pin through `go -C tools tool dev`. Bump a pin when
the repository uses something new in `dev.json`. `DEV_GLOBAL=1` makes the
global one run itself anyway, and `dev --version` says which ran.
Without the global install, run the pinned one directly as
`go -C tools tool dev`; plain `go tool dev` finds only the root module's tools.

```sh
dev                                 # everything
dev web                             # only the web service
dev restart api                     # another terminal: rebuild and restart api
dev logs api web                    # another terminal: their output
```

## Adding dev to an app

1. **A tools module.** If the app has none, create one beside its own module;
   it holds development tools, never service code:

   ```sh
   mkdir tools && go -C tools mod init "$(go list -m)/tools"
   ```

2. **Pin dev in it.** This records it as a tool, at a version every checkout
   shares and the global `dev` defers to. It also lives here rather than in
   the service's module: built under that module's `godebug fips140=only`,
   the S3 emulator's MD5 ETags would panic.

   ```sh
   go -C tools get -tool github.com/parallelworks/foundation/dev/cmd/dev@latest
   ```

3. **Describe the app** in `dev.json` at the repository root (below).
4. **Ignore what dev writes:** add `.devstack/` (the stack's data and the
   services' logs) and the servers' build output, such as `tmp/`, to
   `.gitignore`.
5. **Wrap it** where people already look, such as `dev:` in the Makefile
   running `go -C tools tool dev`, or `"dev"` in `package.json`, so it works
   without the global install too.
6. **Give agents the tools** with `.mcp.json` at the repository root (see
   [Tools and agents](#tools-and-agents)).

Upgrade a repository's pin with the same `go -C tools get -tool …@latest`, and
the global `dev` with `go install …@latest`.

## Describing the app

Describe the app in `dev.json` at the repository root:

```json
{
  "name": "shop",
  "postgres": { "parameters": { "max_connections": "300" } },
  "s3": {},
  "ports": { "server": 8080, "web": 5173 },
  "env": {
    "SHOP_HTTP_ADDR": ":{port.server}",
    "SHOP_DATABASE_URL": "{postgres}",
    "SHOP_TEST_DATABASE_URL": "{postgres_test}",
    "SHOP_S3_ENDPOINT": "{s3}",
    "SHOP_VITE_URL": "http://localhost:{port.web}"
  },
  "services": [
    {
      "name": "server",
      "build": ["go", "build", "-o", "tmp/shop", "./cmd/shop"],
      "run": ["tmp/shop", "serve"],
      "exclude": ["tmp", "web", "tools"],
      "extensions": [".go", ".sql"],
      "url": "http://localhost:{port.server}",
      "health": "http://localhost:{port.server}/readyz"
    },
    { "name": "web", "run": ["pnpm", "--filter", "web", "dev", "--port", "{port.web}", "--strictPort"] }
  ]
}
```

| Command | |
| --- | --- |
| `dev [service...]` | Run the stack and the services named, or every service not marked `manual`, until interrupted. In a terminal it shows the interactive view; piped, in CI or with `--plain` it prints each line prefixed with its source |
| `dev status [--json]` | Show the running dev's services, their states and URLs; `--json` adds its ports, pid and version |
| `dev start`, `stop`, `restart` *service* | Drive one service of the running dev; `restart` rebuilds a server |
| `dev logs [service...] [-f]` | Print services' output from the latest run (all of them when none is named), and with `-f` keep following it |
| `dev up [service...]` | Start dev in the background, and return once its services are up (or with why not); `--for 2h` stops it later |
| `dev down [checkout]` | Stop the dev running here, or the one running in a checkout `dev ps` lists, from anywhere; `kill <pid>` does the same |
| `dev use profile[,profile]` | Switch this checkout's profiles, restarting the dev running here |
| `dev profiles` | List the profiles `dev.json` defines, marking those in use |
| `dev ps` | List every dev running on this machine: checkout, pid, ports |
| `dev exec -- command` | Run a command with the running dev's environment: allocated ports, `{postgres}`, `{s3}` |
| `dev mcp` | Answer MCP over stdio, so an agent drives this checkout's dev as tools |
| `dev stack` | Run Postgres on `:5432` and S3 on `127.0.0.1:8333` until interrupted. User, password and database are `name` (required with Postgres); tests get `name_test` |
| `dev wait [service...]` | Block until a stack started elsewhere accepts connections, or until the services named are up; fails as soon as one fails, exits or turns unhealthy |
| `dev reset` | Delete the stack's data |
| `dev clean [repository...]` | Remove finished and long-idle worktrees, and trim Go's build cache; `--install` runs it every 15 minutes ([Cleaning up](#cleaning-up)) |

Data and each service's latest log live in `.devstack/` beside `dev.json`, or
`--dir`. The command finds `dev.json` from the working directory up, which is
how `go -C tools tool dev` finds it from `tools/`. A Postgres left running by a stack that was
killed is stopped on the next start.

### `dev.json` fields

Values in `env`, `run`, `build`, `url`, `health` and `before` may use
`{port.<name>}`, `{postgres}`, `{postgres_test}`, `{s3}`, `{dir}`, `{root}`
and `{instance}`; values in `env` may also use `${NAME}` (see
[Environment](#environment)). Unknown fields are an error.

| Field | |
| --- | --- |
| `name` | The app's name: the view's title, and Postgres's user, password and database. Required with `postgres` |
| `dir` | Where data and logs go (default `.devstack`) |
| `postgres` | Run Postgres: `port` (default 5432) and server `parameters` |
| `s3` | Run an S3-compatible server: `addr` (default `127.0.0.1:8333`) |
| `ports` | Preferred ports by name; each checkout gets the next free one when taken ([Ports](#ports)) |
| `env`, `envFile` | Every command's environment, and a dotenv file over it (default `.env`) ([Environment](#environment)) |
| `before` | Commands run in order before anything starts |
| `services` | The services, below |
| `profiles`, `defaultProfiles` | Setups to choose between per checkout, and those used until one is chosen ([Profiles](#profiles)) |
| `command` | The command a global `dev` runs here instead of itself, for an app with its own ([Your own command](#your-own-command)) |

| Service field | |
| --- | --- |
| `name` | How commands and the view name it |
| `dir` | Where it runs, relative to `dev.json` |
| `run` | What runs it. Required |
| `build` | What builds it; with it, the service is a server, rebuilt and restarted when its sources change |
| `watch`, `exclude`, `extensions` | Directories whose changes rebuild a server (default its `dir`), directory names to skip, and file types (default `.go`) |
| `env`, `envFile` | Its own environment over the config's, and a dotenv file relative to its `dir` |
| `url`, `health` | Where to open it, and a URL that answers 2xx once it is ready |
| `manual` | Start it only when named |
| `dependsOn` | Services that must be up first; starting it starts them |
| `restart` | `on-failure` to start it again, with backoff, when it exits with an error |
| `rebuildOnCheckout` | Rebuild it when the branch changes, for a build stamped with it |
| `profiles` | Run it only in checkouts using one of these |
| `once` | It readies something and exits, such as loading a database; services that depend on it wait for it to finish |

## The interactive view

In a terminal, `dev` takes over the screen with its services, their states
(building, starting, ready, running, finished, unhealthy, failed, exited,
stopped) and
the stack's addresses:

| Key | |
| --- | --- |
| `↑` `↓` | Select a service |
| `enter` | Its output; `esc` goes back, `↑` `↓` scroll, `ctrl+u` `ctrl+d` (or `pgup` `pgdn`) page, `g` jumps to the oldest line, `G` (or `end`) follows, and `w` wraps long lines instead of cutting them off at the screen's edge |
| `a` | Every service's output, interleaved |
| `r` | Restart the service, rebuilding a server |
| `s` | Start or stop it, including a `manual` one |
| `p` | Pick a profile to switch to, restarting dev on it |
| `q` | Stop everything and quit; in an attached view, leave dev running |
| `Q` | In an attached view, stop dev |

Run `dev` where one is already running, such as one started with `dev up` by
you or an agent, and the view attaches to it instead of starting a second:
states come over the socket and output from the logs it writes. `q` then
leaves it running and `Q` stops it, and the view says so if the running dev is
another version.

`dev status`, `start`, `stop` and `restart` reach a running dev through a Unix
socket in a directory only you can enter (`$XDG_RUNTIME_DIR/foundation-dev`, or
`~/.local/state/foundation-dev`), so a second terminal or a tool can
drive it while the view runs. Only one dev runs per checkout.

## Services

A service with `build` is a server: built, run, and rebuilt and restarted when
a file with one of its `extensions` (default `.go`) changes under its `watch`
directories (default its `dir`). A build that fails stops it until the next
change, so nothing runs stale code, and only one service builds at a time, so
several servers do not exhaust a laptop's memory. A service without `build`
runs once; if it exits, it is left stopped so its error is not buried under
restarts.

A service with a `health` URL reads *starting* once its process is up, *ready*
when the URL answers 2xx, and *unhealthy* if it stops answering, or never
answers within a minute. Without one, a service reads *running* as soon as its
process is up. `dev wait api web` waits for exactly that, for scripts, CI and
tools that need the app answering before they go on.

A service's `url` is where to open it: the view shows it as a link the
terminal opens on cmd-click, `dev status` prints it, and `dev` logs it when the
service comes up. Without one, a service with a `health` URL links to that
URL's origin, and any other takes the first local address it prints, as Vite
and Storybook do when they start.

A service can depend on others: with `"dependsOn": ["db"]` it reads *waiting*
until `db` is up, and `dev web` starts `db` too. `"restart": "on-failure"`
starts a service again when it exits with an error, waiting longer each time
it keeps failing; without it a service that exits is left stopped.
`"once": true` is for a command that readies something and exits, such as
one that loads a database or creates a queue: it reads *starting* while it
runs and *finished* once it exits cleanly, and services that depend on it wait
until then. With `"restart": "on-failure"` it tries again until it succeeds.
`"rebuildOnCheckout": true` rebuilds a server when the checkout's branch
changes, for a build stamped with it; it finds the branch through git, so it
works in a worktree too.

A local database is a service like any other, such as
`{ "name": "db", "run": ["mongod", "--dbpath", "{dir}/mongo", "--port", "{port.db}"], "health": … }`:
`{dir}` is the stack's directory (`.devstack`), where its data stays with the
checkout.

Each service runs in its `dir`, relative to `dev.json`. Each command runs in
its own process group, and stopping one ends everything it started, such as
the Vite under `pnpm`. Unix only.

## Tools and agents

A tool, or an agent working in its own worktree, can run the app without a
terminal: `dev up` starts it in the background and returns once it is up (or
with the services' errors), `dev status --json` gives its URLs and ports,
`dev exec -- make test` runs tests against that checkout's stack, `dev logs`
reads output, and `dev down` stops it. A detached dev also stops itself when
its checkout is deleted, as a finished worktree is, and after `--for`.

`dev mcp` offers the same as tools over the Model Context Protocol: `up`,
`status`, `logs` (with `match` to filter), `start`, `stop`, `restart`, `wait`
and `down`. In an app, an `.mcp.json` at the repository root gives agents that
work in it the tools, for whichever checkout they run in:

```json
{ "mcpServers": { "dev": { "command": "go", "args": ["-C", "tools", "tool", "dev", "mcp"] } } }
```

## Cleaning up

A worktree per task, for people and agents alike, fills a disk fast: each
holds a checkout, its build output and its `.devstack`, and Go's build cache
grows by the size of every build that differs, which it only trims after
five days unused. `dev clean` removes what is finished, from anywhere:

```sh
dev clean -n ~/src/app             # what would go
dev clean ~/src/app ~/src/lib
dev clean --install ~/src/app      # every 15m from now on (launchd or a systemd user timer)
```

A worktree goes when its default branch has its work: merged, rebased,
cherry-picked, or squash-merged in a pull request that `gh` finds ending at
the worktree's commit. One untouched for `--stale` (default 3 days) goes too,
merged or not: its commits stay on its branch, and a detached HEAD gets a
`dev-clean/<folder>` branch first, so `git worktree add <path> <branch>`
brings any back. A worktree stays while it has changes or untracked files, is
locked, was touched within `--idle` (default 6 hours), or runs a dev. Ignored
files go with a removed worktree, so copy out any build output or stack data
worth keeping.

Then Go's build cache is trimmed to `--go-cache` (default 60GB), least
recently used first, keeping anything used in the last hour. Entries are
content-addressed, so one removed is rebuilt when needed; the fuzzing corpus
beside them is not, and stays. While the disk
holding the cache has less than `--min-free` free (default 50GB), the trim
goes below `--go-cache`, oldest first, until the disk has that much free or
the cache is empty, so a burst of builds between runs cannot fill the disk.
`--min-free 0` sets no floor, and `--go-cache 0` leaves the cache alone.

Removing entries under a running build breaks it ("could not import ...: no
such file or directory"), so while any `go build`, `test`, `vet`, `fix`,
`run`, `install`, `list` or `generate`, a compiler or linker, or
`golangci-lint` is running, the trim keeps everything used since an hour
before the oldest of them started, with a note naming it. Builds that run
back to back still let it trim what none of them can be reading. A `go run`
whose program has started counts as done building, and `gopls` does not
count.

### On a schedule

`--install` runs `dev clean` every `--every` (default 15 minutes), and once now.
A run with the cache under its limit, the disk above `--min-free` and no
finished worktree changes nothing, and one during builds leaves what they may
be reading, so running often is cheap and keeps up with bursts of builds.
Each install adds its repositories (default: the one here) to those already
scheduled, and the flags it is given replace the schedule's, while the rest
keep their scheduled values; `--replace` schedules only this call's
repositories and flags instead. Every change prints the whole schedule:

```sh
dev clean --install ~/src/app ~/src/lib
dev clean --install --go-cache 25GB   # in ~/src/app: lower one limit, keeping the rest
dev clean --status                    # show the schedule, changing nothing
dev clean --uninstall ~/src/lib       # stop cleaning one repository
dev clean --uninstall                 # stop the schedule
```

```text
dev clean runs every 15m0s on:
  /Users/me/src/app
  /Users/me/src/lib
with --idle 6h0m0s, --stale 72h0m0s, --go-cache 25GB (was 60GB), --min-free 50GB
logging to /Users/me/Library/Logs/foundation-dev-clean.log
```

The schedule is the launchd agent `~/Library/LaunchAgents/foundation.dev.clean.plist`
on macOS, or the systemd user units `foundation-dev-clean.service` and `.timer`
on Linux, logging to the journal. `dev clean` reads its repositories and flags
back from there, so one edited by hand into something else, or removed with
`launchctl` or `systemctl`, is simply replaced by the next `--install`. A
schedule installed by an earlier dev keeps its interval, as any flag not given
does, and runs with the default `--min-free`; `dev clean --install --every
15m` moves it to the new interval.

## Ports

`ports` names the ports the services listen on, with the one each prefers:

```json
"ports": { "server": 8080, "web": 5173 },
"env": { "SHOP_HTTP_ADDR": ":{port.server}", "SHOP_VITE_URL": "http://localhost:{port.web}" },
"services": [
  { "name": "server", "url": "http://localhost:{port.server}", "health": "http://localhost:{port.server}/readyz", … },
  { "name": "web", "run": ["pnpm", "--filter", "web", "dev", "--port", "{port.web}", "--strictPort"] }
]
```

dev gives each its preferred port when nothing holds it, and the next free one
otherwise, logging the move; Postgres and S3 do the same. `{port.<name>}`
stands for the allocated port in `env`, `run`, `build`, `before`, `url` and
`health`, and `{postgres}` and `{s3}` follow theirs, so a second checkout, or
another app, runs beside the first without either changing its config.

## Profiles

Profiles are setups a checkout chooses between, such as a database on this
machine or a shared remote one. Each can set `env`, include other profiles
(which makes presets), and enable the services that name it in `profiles`:

```json
"profiles": {
  "local-db":  { "env": { "SHOP_DB_URL": "mongodb://localhost:{port.db}/shop" } },
  "remote-db": { "env": { "SHOP_DB_URL": "mongodb://localhost:27017/shop" } },
  "local":     { "description": "everything on this machine", "include": ["local-db"] },
  "remote":    { "description": "shared data", "include": ["remote-db"] }
},
"defaultProfiles": ["local"],
"services": [
  { "name": "db", "profiles": ["local-db"], "run": ["mongod", "--dbpath", "{dir}/db", "--port", "{port.db}"], … },
  { "name": "api", "dependsOn": ["db"], … }
]
```

`dev --profile remote` (or `remote-db,local-cache` to mix) chooses, and the
checkout keeps the choice until it chooses again; `dev profiles` lists them,
marking the ones in use. `dev use remote` switches a dev that is running: it
stops its services and starts again with the new profiles, keeping its ports
where they are free (with nothing running, it records the choice). In the
view, `p` picks a profile the same way. Chosen profiles set their env over the base, in the
order chosen. A service that names profiles runs only when one of them is
chosen, and a service that depends on it no longer waits when it is not: the
other setup provides it.

## Environment

Every command gets, from lowest to highest precedence: `env` in `dev.json`; the
service's own `env`; `envFile` (default `.env` beside `dev.json`, skipped when
missing); the service's `envFile`, relative to its `dir`; and the real
environment, so `SHOP_LOG_LEVEL=info make dev` overrides everything. Values
in `env` may name the stack: `{postgres}` and `{postgres_test}` are database
URLs, and `{s3}` is the S3 endpoint. `{dir}` is the stack's directory,
`{root}` the checkout's, and `{instance}` names the checkout in a few readable
characters, such as `shop-1a2b`, for anything shared between checkouts that
must not collide, like a queue on a shared server. Keep `.env` for secrets and
personal settings.

`${NAME}` in a value in `env` is NAME as the env files or the real environment
set it, so `dev.json` can compose a value around a secret it should not hold:

```json
"env": { "DB_URL": "mongodb://app:${DB_PASS}@localhost:{port.mongo}/" }
```

A `${NAME}` that neither sets is an error naming it; `${NAME:-default}` falls
back instead. A service's values also read dev.json's and the active profiles',
so a profile can set one variable that a single service turns into its own,
such as a proxy only one server should use. An env file's own values are taken
as written.

`before` commands run once, in order, before anything starts, such as
generating files a server embeds. If one fails, `dev` stops with its error.

## Your own command

An app with development tasks of its own builds its dev on the same base,
loading `dev.json` as `cmd/dev` does and adding its commands:

```go
func main() {
	path, err := dev.FindConfig(".")
	if err != nil {
		log.Fatal(err)
	}
	cfg, err := dev.LoadConfig(path)
	if err != nil {
		log.Fatal(err)
	}
	root := dev.NewRootCmd(cfg)
	root.AddCommand(seedCmd)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := root.ExecuteContext(ctx); err != nil {
		os.Exit(1)
	}
}
```

Then point the global `dev` at it: list the package as a tool in the module it
lives in (`tool example.com/shop/cmd/dev` in `go.mod`), and name the command in
`dev.json`:

```json
"command": ["go", "tool", "dev"]
```

`dev` then runs the app's own dev in its repository, from any directory in it:
`dev seed` reaches the app's command, and `dev --help` lists it beside `up`,
`status` and the rest. `{root}` in `command` stands for the directory of
`dev.json`. A command wins over a pinned tools module.

Options to `NewRootCmd` extend the view and the MCP server with what the app
runs beside its services:

```go
root := dev.NewRootCmd(cfg,
	// Rows above the services, refreshed every second: say a tunnel's state.
	dev.WithRows(func(ctx context.Context) []dev.Row {
		return []dev.Row{{Name: "tunnel", State: "ok", Detail: ":27017"}}
	}),
	// A key on the main screen, listed in its help line.
	dev.WithKey(dev.Key{Key: "e", Help: "refresh secrets", Do: refreshSecrets}),
	// Tools beside dev's own on `dev mcp`.
	dev.WithMCP(func(s *mcp.Server) { mcp.AddTool(s, queryTool, queryDB) }),
)
```

A row's `State` is `ok`, `busy`, `error` or `off`, and its `URL` is shown as a
link. An app's key may not be one of the view's own.

`dev.Env` is what the checkout's running dev sets for its commands, with its
allocated ports filled in, for a tool of the app's that reaches what its
services use, such as a query tool for their database.

`dev.Instances` lists the devs running on the machine, each with its checkout
(`Root`) and the ports it allocated, keyed by their names in `dev.json`. A
machine-wide tool of the app's, such as one that routes a shared hostname to
one checkout, finds that checkout's ports there.
