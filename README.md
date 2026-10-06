# foundation

Shared building blocks for web services: Go packages and npm
packages that several applications use the same way.

| Package | What it is |
| --- | --- |
| [`problem`](problem) (Go) | RFC 9457 problem details with stable, localizable codes, and the pages their type URIs resolve to |
| [`problem/humaproblem`](problem/humaproblem) (Go) | Makes [huma](https://huma.rocks) produce problems, including for request validation |
| [`problem/problemtest`](problem/problemtest) (Go) | Checks that a web app's catalog has a message for every code |
| [`problem/problemrules`](problem/problemrules) (Go) | go-ruleguard rules that keep internal errors out of responses |
| [`server`](server) (Go) | A service's HTTP handler and server: health probes, security headers, CSRF protection, logging, panic recovery, graceful shutdown |
| [`pgdb`](pgdb) (Go) | An application's own PostgreSQL schema: a pool scoped to it, hopper's job tables and goose migrations in it, and a fresh schema per test |
| [`dev`](dev) (Go, own module) | `go tool dev`: Postgres and S3 for local development without Docker, and the base of an app's own development command |
| [`spa`](spa) (Go) | Serves a Vite app from the Go server: the embedded build in production, the Vite dev server in development |
| [`@parallelworks/problem`](packages/problem) (npm) | `ApiError`, `useErrorMessage()`, the shared codes' messages in five languages, and a Biome lint rule |
| [`@parallelworks/ui`](packages/ui) (npm) | React components on one theme contract: primitives, lists, forms, a job graph, a code editor, a log viewer, a file explorer and an AI chat, each on its own subpath |

## Problem details

Every error response is an [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)
problem, served as `application/problem+json`. Its `type` says what kind of
problem it is, and resolves to a page documenting it. Clients show a message
for its `code` in the reader's language: a server with a `problem.Localizer`
writes `detail` in that language itself and says which with `Content-Language`,
so every client, a CLI as much as a web app, can show it. Without
`Content-Language`, `detail` is English, for developers and logs, and clients
show their own message for `code` instead.

There are three kinds of type:

| `type` | Code | Example |
| --- | --- | --- |
| `about:blank` | none sent: the client derives it from the status | 404 → `not_found` |
| `/problems/validation` | `validation`; each entry in `errors` has its rule's `type` and `code` | 422 from a form |
| `/problems/<app>/<code>` | the application's own | `/problems/shop/name_taken` |

```http
HTTP/1.1 422 Unprocessable Content
Content-Type: application/problem+json

{
  "type": "/problems/validation",
  "title": "Invalid request",
  "status": 422,
  "detail": "validation failed",
  "code": "validation",
  "errors": [
    {"type": "/problems/too_long", "code": "too_long", "pointer": "#/name",
     "params": {"max": 64}, "detail": "expected length <= 64"},
    {"type": "/problems/required", "code": "required", "parameter": "team", "in": "query",
     "detail": "required query parameter is missing"}
  ]
}
```

Type URIs are relative, with the full path, so each deployment documents the
types it actually sends. Namespacing them by application means a host that
mounts several applications serves every page without collisions, wherever
each one is mounted.

Codes are part of the API contract: never rename a code, a rule or a param.

### Server (Go)

Define an application's types once, in package variables:

```go
var (
	problems  = problem.NewRegistry("shop")
	NameTaken = problems.Define(problem.Type{
		Code:   "name_taken",
		Status: http.StatusConflict,
		Title:  "Name taken",
		Doc:    "Another item in the workspace already has this name. Choose a different one.",
		Params: []string{"name"},
	})
)
```

Return them from handlers, and use `problem.Status` for a failure the status
fully describes:

```go
return nil, NameTaken.New("a product named Lamp exists").With("name", "Lamp")
return nil, problem.Status(http.StatusNotFound, "no order 1042")
return nil, problem.ValidationFailed(problem.TooLong.At(problem.Pointer("name"), "too long").With("max", 64))
```

A problem missing a param its type declares is sent as the about:blank problem
for its status (a field error, as `invalid`), so clients never show a message
with an unfilled placeholder. `Resolve` returns a problem as it will be sent.

With huma, install the error builder before registering operations and serve
the type pages:

```go
humaproblem.Install(humaproblem.Options{
	// Domain errors that are not problems, mapped in one place.
	Map: func(err error) *problem.Problem {
		if errors.Is(err, store.ErrNotFound) {
			return problem.Status(http.StatusNotFound, "not found")
		}
		return nil
	},
	Debug: cfg.Development, // send a 5xx's cause as its detail
})
cfg.Transformers = append(cfg.Transformers, humaproblem.Report(func(ctx context.Context, p *problem.Problem) {
	if p.Status >= 500 {
		logger.FromContext(ctx).Error("request failed", "error", p.Unwrap())
	}
}))
// ... huma.Register(...)
mux.Handle("/problems/", problem.Handler(problems))
```

The OpenAPI document types `code` as an open string, not an enum: new codes
are not a breaking change, and clients fall back to the status for codes they
don't know. The catalog at `/problems/` lists them.

Each page is also data: asked with `Accept: application/json` (and not
`text/html`), `/problems/<...>/<code>` returns its `title`, `message`, `why`,
`fix` and `links` in the reader's language, and `/problems/` the list of types,
so a CLI can print how to fix a problem without a browser.

huma's request validation then becomes a validation problem whose entries name
the rule each field failed (`required`, `too_long`, `below_minimum`, ...).

### Messages in the reader's language

`problem.Shared` holds the messages for the shared codes in English, Spanish,
Japanese, Korean and Chinese; `problem.NewCatalog` reads an app's own from one
JSON file per language (`en.json`, `ja.json`, ...), ICU MessageFormat strings
keyed by code. A `problem.Localizer` picks the reader's language with `Locale`
(such as `spa.Locales.NegotiateHeader`, the cookie then `Accept-Language`) and
rewrites each problem's `detail`, and each field error's, as its code's
message:

```go
l := &problem.Localizer{Locale: locales.NegotiateHeader, Catalogs: []*problem.Catalog{catalog}}
cfg.Transformers = append(cfg.Transformers, humaproblem.Report(logProblem), humaproblem.Localize(l))
l.Write(w, r, p) // in a raw handler
```

An `about:blank` problem keeps the detail the server wrote for English readers,
so specific text still reaches them; other languages get the status's message.
`problemtest.CheckGoCatalog` checks that a catalog covers a registry.

### Internal errors never reach the client

A problem's `detail` and `params` are sent, so they hold only what the client
may see. Everything else stays on the server:

- Attach the underlying error with `WithCause(err)`. It is never sent; `Report`
  hands it to you with the request's context, to log.
- An error a handler returns that is not a problem, and that `Map` does not
  recognize, becomes a 500 `about:blank` with no detail.
- `AsDenial()` marks a problem as a refusal to authorize, and `problem.Denied(err)`
  finds it, so a caller never mistakes an unreachable database for "you may not".
  The marker is not sent either.
- [`problemrules`](problem/problemrules) fails lint on an error, or its
  `Error()` text, passed to `New`, `Newf`, `At`, `AtParameter`, `Status` or
  `With`. Import it into your go-ruleguard rules file:

```go
//go:build ruleguard

package gorules

import (
	"github.com/parallelworks/foundation/problem/problemrules"
	"github.com/quasilyte/go-ruleguard/dsl"
)

func init() { dsl.ImportRules("", problemrules.Bundle) }
```

Test that the web app has a message for every code:

```go
func TestEveryCodeHasAMessage(t *testing.T) {
	problemtest.CheckCatalog(t, "../web/src/i18n/locales/en.json", problems)
	// or, with apiErrors in its own file, load the map and call
	// problemtest.CheckMessages(t, messages, problems)
}
```

### Web (TypeScript)

```ts
import { toApiError, problemMiddleware } from '@parallelworks/problem'
import { useErrorMessage } from '@parallelworks/problem/react'

api.use(problemMiddleware) // openapi-fetch: ask for problem details

const errorMessage = useErrorMessage()
{save.isError && <p role="alert">{errorMessage(save.error)}</p>}
```

`useErrorMessage()` shows the message for the error's code: the app's own at
`apiErrors.<code>` in its use-intl catalog, otherwise the shared message
shipped with this package (English, Spanish, Japanese, Korean and Chinese). A
validation problem with one invalid field shows that field's rule; `network`
and `unknown` cover failures that never reached the server. `toApiError()`
turns anything thrown into an `ApiError` with `status`, `code`, `params` and
`fields`, whose `path` (`items[0].name`) matches form field names.

### Lint

`lint/error-text.grit` in `@parallelworks/problem` is a Biome plugin. It fails on an
error's `.message` rendered in JSX or passed to `toast`, and on text passed to
setters such as `setError` (a lowercase identifier like `'loadFailed'` is a
code and passes):

```json
{ "plugins": ["./node_modules/@parallelworks/problem/lint/error-text.grit"] }
```

## Running a service

`server.New` assembles a service's handler around its own routes, and
`server.Serve` runs it until the context ends:

```go
handler := server.New(server.Options{
	Logger:    logger,
	Routes:    func(mux *http.ServeMux) { api.Register(mux, deps) },
	Problems:  []*problem.Registry{problems},
	Ready:     map[string]server.Pinger{"database": pool},
	Web:       web.FS(),
	DevServer: cfg.ViteURL, // development: proxy the app from Vite until a build is embedded
	HSTS:      cfg.Production,
	Wrap:      sessions.Middleware, // the application's own authentication
})
return server.Serve(ctx, server.Listen{Addr: ":8080", ShutdownTimeout: 20 * time.Second}, handler, logger)
```

Besides the application's routes it serves `/healthz`, `/readyz` (the `Ready`
pingers), `/problems/`, a 404 problem for unknown paths under `/api/`, and the
single-page app. Every response gets security headers with a strict CSP, and a
state-changing request a browser sent from another site is refused. Requests
are logged; a panic is logged and answered with a 500, a problem under `/api/`.

In development the CSP accepts `spa.DevNonce`, which Vite puts on the scripts
and styles it injects when `vite.config.ts` sets it:

```ts
export default defineConfig(({ command }) => ({
  ...(command === 'serve' && { html: { cspNonce: 'vite-dev' } }),
  build: { assetsDir: '_build' },
}))
```

## Serving a Vite app

`spa.Handler` serves the app from the Go server, so it has one origin in
development and production: the same cookies, CSP and routes, no CORS, and no
proxy list in `vite.config.ts`.

```go
//go:embed all:dist
var dist embed.FS

build, _ := fs.Sub(dist, "dist")
app, err := spa.Handler(build, spa.Options{DevServer: "http://localhost:5173"})
if err != nil {
	return err
}
mux.Handle("/", app) // after the API routes
```

With a build embedded, it serves each file (preferring a `.br` or `.gz`
sibling the client accepts), then a
prerendered `<path>/index.html`, then `index.html` for client-side routes.
When `dist` holds only a placeholder, as it does before `pnpm build`, it
proxies everything to the Vite dev server, including the HMR WebSocket. Open
the Go server's address in development, not Vite's.

Put Vite's content-hashed output in `/_build/`, which `spa.Handler` caches as
immutable; files copied from `public/` keep their names and stay revalidatable,
so a changed logo or font is never stuck in a browser cache:

```ts
// vite.config.ts
build: { assetsDir: '_build' }
```

`Options.Index` rewrites `index.html` for each request (in development too),
for example to add `<base href>`; `Options.NotFound` sends the shell with a 404
for paths the app does not know.

`Options.Locales` sets `<html lang>` to the reader's language: the cookie's
choice, then `Accept-Language`, negotiated against the app's locales exactly as
`negotiateLocale` in `@parallelworks/i18n` does, so `es-MX` gets `es`. Pass it
to the client so the first paint is already in that language:

```go
spa.Options{Locales: spa.Locales{Available: []string{"en", "es", "ja"}, Cookie: "locale"}}
```

```ts
const locale = detectLocale(locales, {
  fallback: defaultLocale,
  injected: document.documentElement.lang,
  cookie: 'locale',
})
```

`server.Options.Locales` does the same for an app served by `server.New`.
`Locales.Negotiate(r)` and `spa.NegotiateLocale` are there for a server that
renders its own shell.

## Local development

`go tool dev` runs Postgres 18 and an S3-compatible server natively, with data
kept between runs. Add it to the tools module (not the service's module: the S3
emulator's MD5 ETags fail under `fips140=only`), and describe the stack in
`dev.json` at the repository root:

```sh
go -C tools get -tool github.com/parallelworks/foundation/dev/cmd/dev
```

```json
{
  "name": "shop",
  "postgres": { "parameters": { "max_connections": "300" } },
  "s3": {}
}
```

| Command | |
| --- | --- |
| `dev stack` | Run Postgres on `:5432` and S3 on `127.0.0.1:8333` until interrupted. User, password and database are `name`; tests get `name_test` |
| `dev wait` | Block until a stack started elsewhere accepts connections |
| `dev reset` | Delete the stack's data |

Data lives in `.devstack/` beside `dev.json`, or `--dir`. The command finds
`dev.json` from the working directory up, so `go -C tools tool dev` works too.
A Postgres left running by a stack that was killed is stopped on the next start.

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

## Development

`make check` runs every linter and test. See [CONTRIBUTING.md](CONTRIBUTING.md).
