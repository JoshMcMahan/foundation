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
| [`spa`](spa) (Go) | Serves a Vite app from the Go server: the embedded build in production, the Vite dev server in development |
| [`@parallelworks/problem`](packages/problem) (npm) | `ApiError`, `useErrorMessage()`, the shared codes' messages in five languages, and a Biome lint rule |

## Problem details

Every error response is an [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)
problem, served as `application/problem+json`. Its `type` says what kind of
problem it is, and resolves to a page documenting it. Clients show a message
for its `code` in the reader's language; `title` and `detail` are English, for
developers and logs, and never shown to people.

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

With huma, install the error builder before registering operations, document
the codes after, and serve the type pages:

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

huma's request validation then becomes a validation problem whose entries name
the rule each field failed (`required`, `too_long`, `below_minimum`, ...).

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
for example to set `<html lang>` or `<base href>`; `Options.NotFound` sends the
shell with a 404 for paths the app does not know.

## Development

`make check` runs every linter and test. See [CONTRIBUTING.md](CONTRIBUTING.md).
