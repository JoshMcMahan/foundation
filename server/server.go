// Package server assembles and runs a web service's HTTP handler: the
// application's routes, health probes, the problem type pages and the
// single-page app, behind the middleware every service needs.
package server

import (
	"bytes"
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"html"
	"io/fs"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/parallelworks/foundation/problem"
	"github.com/parallelworks/foundation/spa"
)

// Pinger checks a dependency's health for /readyz.
type Pinger interface {
	Ping(ctx context.Context) error
}

// Options configure New.
type Options struct {
	// Logger records requests, panics and server errors. Defaults to
	// slog.Default().
	Logger *slog.Logger
	// Routes registers the application's handlers, such as its huma API.
	Routes func(mux *http.ServeMux)
	// APIPrefix is where the API lives: a path under it that matches no
	// route, or panics, is answered with a problem. Defaults to "/api/".
	APIPrefix string
	// Problems are the application's problem types, documented at /problems/.
	Problems []*problem.Registry
	// Messages and Docs are the application's problem messages and page
	// guidance; the /problems/ pages use them in the reader's language, which
	// Locales picks.
	Messages []*problem.Catalog
	Docs     []*problem.Docs
	// Ready is checked by /readyz. Nil pingers are skipped.
	Ready map[string]Pinger
	// Web is the built single-page app (see spa.Handler). Nil serves no app.
	Web fs.FS
	// DevServer is the Vite dev server, such as "http://localhost:5173".
	// While Web holds no build, the app is proxied from it.
	DevServer string
	// BasePath is where a host mounts the application, such as "/tandem".
	// The app's index.html gets a matching <base href>. Defaults to "/".
	BasePath string
	// Locales sets the app's <html lang> to the reader's language.
	Locales spa.Locales
	// ContentSecurityPolicy replaces DefaultContentSecurityPolicy.
	ContentSecurityPolicy string
	// HSTS sends Strict-Transport-Security, for a service reached over HTTPS.
	HSTS bool
	// Wrap wraps the routes inside the security middleware, for example to
	// attach the authenticated caller to each request.
	Wrap func(http.Handler) http.Handler
}

// DefaultContentSecurityPolicy allows only same-origin resources and no
// inline scripts or styles.
const DefaultContentSecurityPolicy = "default-src 'self'; " +
	"img-src 'self' data:; " +
	"object-src 'none'; " +
	"base-uri 'self'; " +
	"form-action 'self'; " +
	"frame-ancestors 'none'"

// New returns the service's root handler. It serves:
//
//   - the application's Routes;
//   - GET /healthz, always 200, and GET /readyz, 200 when every Ready pinger
//     answers and 503 otherwise;
//   - a 404 problem for any path under APIPrefix that no route matches;
//   - the problem type pages at /problems/;
//   - the single-page app for everything else.
//
// Every response gets security headers, including a strict CSP; while the app
// is proxied from DevServer, the CSP also accepts spa.DevNonce. Requests that
// change state are refused when a browser sent them from another site, which
// keeps cookie sessions safe from cross-site request forgery. Each request is
// logged, and a panic is logged and answered with a 500.
func New(opts Options) http.Handler {
	if opts.Logger == nil {
		opts.Logger = slog.Default()
	}
	if opts.APIPrefix == "" {
		opts.APIPrefix = "/api/"
	}
	csp := opts.ContentSecurityPolicy
	if csp == "" {
		csp = DefaultContentSecurityPolicy
	}
	if opts.Web != nil && opts.DevServer != "" && !spa.Built(opts.Web) {
		csp += "; script-src 'self' 'nonce-" + spa.DevNonce + "'; style-src 'self' 'nonce-" + spa.DevNonce + "'"
	}

	mux := http.NewServeMux()
	if opts.Routes != nil {
		opts.Routes(mux)
	}
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	mux.Handle("GET /readyz", readyHandler(opts.Ready))
	mux.HandleFunc(opts.APIPrefix, func(w http.ResponseWriter, r *http.Request) {
		problem.Write(w, problem.Status(http.StatusNotFound, "no API operation matches "+r.Method+" "+r.URL.Path))
	})
	mux.Handle("GET /problems/", problem.Pages(problem.PagesOptions{
		Registries: opts.Problems,
		Localizer:  &problem.Localizer{Locale: localeOf(opts.Locales), Catalogs: opts.Messages},
		Docs:       opts.Docs,
	}))
	if opts.Web != nil {
		mux.Handle("/", appHandler(opts))
	}

	var h http.Handler = mux
	if opts.Wrap != nil {
		h = opts.Wrap(h)
	}
	h = sameOrigin(h)
	h = securityHeaders(h, csp, opts.HSTS)
	h = logRequests(h, opts.Logger)
	return recoverPanics(h, opts.Logger, opts.APIPrefix)
}

// appHandler serves the single-page app, with a <base href> for BasePath so
// one build, made with relative asset URLs, serves at / or under a host's path.
func appHandler(opts Options) http.Handler {
	base := []byte(`<head><base href="` + html.EscapeString(strings.TrimRight(opts.BasePath, "/")+"/") + `">`)
	app, err := spa.Handler(opts.Web, spa.Options{
		DevServer: opts.DevServer,
		Locales:   opts.Locales,
		Index: func(_ *http.Request, index []byte) []byte {
			return bytes.Replace(index, []byte("<head>"), base, 1)
		},
	})
	if err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			http.Error(w, "the web app is not built: build it, or configure the Vite dev server", http.StatusServiceUnavailable)
		})
	}
	return app
}

func readyHandler(checks map[string]Pinger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		status := http.StatusOK
		results := make(map[string]string, len(checks))
		for name, p := range checks {
			if p == nil {
				continue
			}
			if err := p.Ping(ctx); err != nil {
				status = http.StatusServiceUnavailable
				results[name] = "unavailable"
				continue
			}
			results[name] = "ok"
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(status)
		_ = json.NewEncoder(w).Encode(results)
	})
}

// Listen configures Serve.
type Listen struct {
	Addr string
	// TLSCertFile and TLSKeyFile enable in-process TLS. When unset, TLS is
	// terminated in front of the service.
	TLSCertFile     string
	TLSKeyFile      string
	ShutdownTimeout time.Duration
}

// Serve runs an HTTP server until ctx is canceled, then shuts down
// gracefully, giving in-flight requests up to ShutdownTimeout.
func Serve(ctx context.Context, l Listen, handler http.Handler, logger *slog.Logger) error {
	srv := &http.Server{
		Addr:              l.Addr,
		Handler:           handler,
		ReadHeaderTimeout: 10 * time.Second,
		IdleTimeout:       120 * time.Second,
		ErrorLog:          slog.NewLogLogger(logger.Handler(), slog.LevelWarn),
		BaseContext:       func(net.Listener) context.Context { return ctx },
		// In FIPS 140-3 mode crypto/tls only negotiates approved protocol
		// versions, cipher suites, curves and signature algorithms.
		TLSConfig: &tls.Config{MinVersion: tls.VersionTLS12},
	}
	withTLS := l.TLSCertFile != "" && l.TLSKeyFile != ""

	errc := make(chan error, 1)
	go func() {
		logger.InfoContext(ctx, "http server listening", "addr", l.Addr, "tls", withTLS)
		var err error
		if withTLS {
			err = srv.ListenAndServeTLS(l.TLSCertFile, l.TLSKeyFile)
		} else {
			err = srv.ListenAndServe()
		}
		errc <- err
	}()

	select {
	case err := <-errc:
		return err
	case <-ctx.Done():
	}

	shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), l.ShutdownTimeout)
	defer cancel()
	logger.InfoContext(ctx, "http server shutting down")
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return err
	}
	if err := <-errc; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// localeOf negotiates with locales, or with Accept-Language alone when the
// application has none.
func localeOf(locales spa.Locales) func(http.Header) string {
	if len(locales.Available) == 0 {
		return nil
	}
	return locales.NegotiateHeader
}
