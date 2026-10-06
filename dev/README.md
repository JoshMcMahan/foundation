# dev

`go tool dev` runs an app's whole development setup in one terminal: Postgres
18 and an S3-compatible server natively, with data kept between runs; the Go
server, rebuilt and restarted when its sources change; and processes beside it,
such as Vite. Add it to the tools module (not the service's module: the S3
emulator's MD5 ETags fail under `fips140=only`), and describe the stack in
`dev.json` at the repository root:

```sh
go -C tools get -tool github.com/parallelworks/foundation/dev/cmd/dev
```

```json
{
  "name": "shop",
  "postgres": { "parameters": { "max_connections": "300" } },
  "s3": {},
  "before": [["sh", "-c", "find web/dist -mindepth 1 ! -name .gitkeep -delete"]],
  "server": {
    "build": ["go", "build", "-o", "tmp/shop", "./cmd/shop"],
    "run": ["tmp/shop", "serve"],
    "exclude": ["tmp", "web", "tools"],
    "extensions": [".go", ".sql"]
  },
  "processes": [
    { "name": "web", "run": ["pnpm", "--filter", "web", "dev"] }
  ]
}
```

| Command | |
| --- | --- |
| `dev` | Run all of it until interrupted, each line prefixed with its source |
| `dev stack` | Run Postgres on `:5432` and S3 on `127.0.0.1:8333` until interrupted. User, password and database are `name` (required with Postgres); tests get `name_test` |
| `dev wait` | Block until a stack started elsewhere accepts connections |
| `dev reset` | Delete the stack's data |

Data lives in `.devstack/` beside `dev.json`, or `--dir`. The command finds
`dev.json` from the working directory up, so `go -C tools tool dev` works too.
A Postgres left running by a stack that was killed is stopped on the next start.

`before` commands run once, in order, before anything starts: generating
files the server embeds, or clearing a stale build. If one fails, `dev` stops
with its error.

The server, processes and `before` commands get `.env` beside `dev.json` (or
`env`), under the real environment, so `SHOP_LOG_LEVEL=info go tool dev`
overrides it. A build that fails stops the server until the next change, so
nothing runs stale code. Each command runs in its own process group, and
stopping one ends everything it started, such as the Vite under `pnpm`. Unix
only.

An app with its own development tasks builds its command on the same base:

```go
func main() {
	root := dev.NewRootCmd(dev.Config{Name: "shop", Postgres: &dev.Postgres{}, S3: &dev.S3{}})
	root.AddCommand(seedCmd)
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	if err := root.ExecuteContext(ctx); err != nil {
		os.Exit(1)
	}
}
```
