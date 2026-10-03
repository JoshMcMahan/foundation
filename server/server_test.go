package server_test

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
	"time"

	"github.com/parallelworks/foundation/problem"
	"github.com/parallelworks/foundation/server"
	"github.com/parallelworks/foundation/spa"
)

type pingFunc func(context.Context) error

func (f pingFunc) Ping(ctx context.Context) error { return f(ctx) }

var web = fstest.MapFS{
	"index.html":        {Data: []byte("<!doctype html><html><head><title>app</title></head></html>")},
	"_build/app-abc.js": {Data: []byte("console.log(1)")},
}

var registry = problem.NewRegistry("app")

func newHandler(t *testing.T, opts server.Options) http.Handler {
	t.Helper()
	if opts.Logger == nil {
		opts.Logger = slog.New(slog.DiscardHandler)
	}
	if opts.Web == nil {
		opts.Web = web
	}
	return server.New(opts)
}

func do(t *testing.T, h http.Handler, method, path string, header ...string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequestWithContext(t.Context(), method, path, nil)
	for i := 0; i+1 < len(header); i += 2 {
		req.Header.Set(header[i], header[i+1])
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func TestRoutes(t *testing.T) {
	h := newHandler(t, server.Options{
		Routes: func(mux *http.ServeMux) {
			mux.HandleFunc("GET /api/v1/items", func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "items") })
		},
		Problems: []*problem.Registry{registry},
	})
	tests := []struct {
		path, wantBody, wantType string
		wantStatus               int
	}{
		{"/api/v1/items", "items", "", 200},
		{"/api/v1/nope", `"status":404`, problem.MediaType, 404},
		{"/healthz", "", "", 200},
		{"/problems/", "Error reference", "text/html", 200},
		{"/issues/1", "<title>app</title>", "text/html", 200},
		{"/_build/app-abc.js", "console.log", "", 200},
	}
	for _, tt := range tests {
		rec := do(t, h, http.MethodGet, tt.path)
		if rec.Code != tt.wantStatus || !strings.Contains(rec.Body.String(), tt.wantBody) ||
			!strings.HasPrefix(rec.Header().Get("Content-Type"), tt.wantType) {
			t.Errorf("GET %s = %d %s %q", tt.path, rec.Code, rec.Header().Get("Content-Type"), rec.Body)
		}
	}
}

func TestBaseHref(t *testing.T) {
	for base, want := range map[string]string{
		"":        `<head><base href="/">`,
		"/tandem": `<head><base href="/tandem/">`,
		`/a"b`:    `<head><base href="/a&#34;b/">`,
	} {
		body := do(t, newHandler(t, server.Options{BasePath: base}), http.MethodGet, "/x").Body.String()
		if !strings.Contains(body, want) {
			t.Errorf("base %q: body = %s", base, body)
		}
	}
}

func TestLocales(t *testing.T) {
	h := newHandler(t, server.Options{Locales: spa.Locales{Available: []string{"en", "es"}}})
	body := do(t, h, http.MethodGet, "/x", "Accept-Language", "es-MX").Body.String()
	if !strings.Contains(body, `<html lang="es"><head><base href="/">`) {
		t.Errorf("body = %s", body)
	}
}

func TestNoApp(t *testing.T) {
	h := server.New(server.Options{Logger: slog.New(slog.DiscardHandler)})
	if rec := do(t, h, http.MethodGet, "/x"); rec.Code != http.StatusNotFound {
		t.Errorf("no Web: GET /x = %d, want 404", rec.Code)
	}
	unbuilt := newHandler(t, server.Options{Web: fstest.MapFS{".gitkeep": {}}})
	if rec := do(t, unbuilt, http.MethodGet, "/x"); rec.Code != http.StatusServiceUnavailable {
		t.Errorf("unbuilt Web: GET /x = %d, want 503", rec.Code)
	}
}

func TestReadyz(t *testing.T) {
	ok := pingFunc(func(context.Context) error { return nil })
	bad := pingFunc(func(context.Context) error { return errors.New("down") })
	if rec := do(t, newHandler(t, server.Options{Ready: map[string]server.Pinger{"db": ok, "skipped": nil}}), http.MethodGet, "/readyz"); rec.Code != 200 || !strings.Contains(rec.Body.String(), `"db":"ok"`) {
		t.Errorf("healthy readyz = %d %s", rec.Code, rec.Body)
	}
	if rec := do(t, newHandler(t, server.Options{Ready: map[string]server.Pinger{"db": bad}}), http.MethodGet, "/readyz"); rec.Code != 503 || !strings.Contains(rec.Body.String(), `"db":"unavailable"`) {
		t.Errorf("unhealthy readyz = %d %s", rec.Code, rec.Body)
	}
}

func TestSecurityHeaders(t *testing.T) {
	rec := do(t, newHandler(t, server.Options{HSTS: true}), http.MethodGet, "/")
	for _, h := range []string{"X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy", "Cross-Origin-Opener-Policy", "Strict-Transport-Security"} {
		if rec.Header().Get(h) == "" {
			t.Errorf("missing %s", h)
		}
	}
	if csp := rec.Header().Get("Content-Security-Policy"); csp != server.DefaultContentSecurityPolicy {
		t.Errorf("CSP = %q", csp)
	}
	custom := do(t, newHandler(t, server.Options{ContentSecurityPolicy: "default-src 'none'"}), http.MethodGet, "/")
	if csp := custom.Header().Get("Content-Security-Policy"); csp != "default-src 'none'" {
		t.Errorf("custom CSP = %q", csp)
	}
	if hsts := custom.Header().Get("Strict-Transport-Security"); hsts != "" {
		t.Errorf("HSTS without the option = %q", hsts)
	}
}

// While the app is proxied from Vite, the CSP accepts the nonce Vite puts on
// what it injects; with a build it does not.
func TestDevServerCSP(t *testing.T) {
	vite := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = io.WriteString(w, `<html><head><script type="module" nonce="`+spa.DevNonce+`"></script></head></html>`)
	}))
	defer vite.Close()
	dev := newHandler(t, server.Options{Web: fstest.MapFS{".gitkeep": {}}, DevServer: vite.URL})
	rec := do(t, dev, http.MethodGet, "/issues")
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), `<base href="/">`) {
		t.Fatalf("GET /issues = %d %q, want Vite's page with a base href", rec.Code, rec.Body)
	}
	if csp := rec.Header().Get("Content-Security-Policy"); !strings.Contains(csp, "script-src 'self' 'nonce-"+spa.DevNonce+"'") {
		t.Errorf("dev CSP = %q", csp)
	}
	built := newHandler(t, server.Options{DevServer: vite.URL})
	if csp := do(t, built, http.MethodGet, "/").Header().Get("Content-Security-Policy"); strings.Contains(csp, "nonce") {
		t.Errorf("CSP with a build = %q, want no nonce", csp)
	}
}

func TestSameOrigin(t *testing.T) {
	h := newHandler(t, server.Options{Routes: func(mux *http.ServeMux) {
		mux.HandleFunc("POST /api/v1/items", func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusCreated) })
	}})
	tests := []struct {
		name   string
		header []string
		want   int
	}{
		{"no browser headers", nil, http.StatusCreated},
		{"same origin", []string{"Sec-Fetch-Site", "same-origin"}, http.StatusCreated},
		{"typed in the address bar", []string{"Sec-Fetch-Site", "none"}, http.StatusCreated},
		{"cross site", []string{"Sec-Fetch-Site", "cross-site"}, http.StatusForbidden},
		{"matching Origin", []string{"Origin", "http://example.com"}, http.StatusCreated},
		{"other Origin", []string{"Origin", "https://evil.example"}, http.StatusForbidden},
	}
	for _, tt := range tests {
		if rec := do(t, h, http.MethodPost, "/api/v1/items", tt.header...); rec.Code != tt.want {
			t.Errorf("%s: %d, want %d", tt.name, rec.Code, tt.want)
		}
	}
}

func TestWrapRunsInsideSecurity(t *testing.T) {
	type key struct{}
	h := newHandler(t, server.Options{
		Routes: func(mux *http.ServeMux) {
			mux.HandleFunc("GET /api/me", func(w http.ResponseWriter, r *http.Request) {
				name, _ := r.Context().Value(key{}).(string)
				_, _ = io.WriteString(w, name)
			})
		},
		Wrap: func(next http.Handler) http.Handler {
			return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), key{}, "ada")))
			})
		},
	})
	rec := do(t, h, http.MethodGet, "/api/me")
	if rec.Body.String() != "ada" || rec.Header().Get("Content-Security-Policy") == "" {
		t.Errorf("GET /api/me = %q, CSP %q", rec.Body, rec.Header().Get("Content-Security-Policy"))
	}
}

func TestPanics(t *testing.T) {
	var logs bytes.Buffer
	h := server.New(server.Options{
		Logger: slog.New(slog.NewTextHandler(&logs, nil)),
		Routes: func(mux *http.ServeMux) {
			mux.HandleFunc("/api/boom", func(http.ResponseWriter, *http.Request) { panic("boom") })
			mux.HandleFunc("/boom", func(http.ResponseWriter, *http.Request) { panic("boom") })
		},
	})
	rec := do(t, h, http.MethodGet, "/api/boom")
	if rec.Code != 500 || rec.Header().Get("Content-Type") != problem.MediaType {
		t.Errorf("API panic = %d %s", rec.Code, rec.Header().Get("Content-Type"))
	}
	if rec := do(t, h, http.MethodGet, "/boom"); rec.Code != 500 || rec.Header().Get("Content-Type") == problem.MediaType {
		t.Errorf("page panic = %d %s", rec.Code, rec.Header().Get("Content-Type"))
	}
	if !strings.Contains(logs.String(), "panic serving request") {
		t.Errorf("panic not logged:\n%s", logs.String())
	}
}

func TestRequestLog(t *testing.T) {
	var logs bytes.Buffer
	h := newHandler(t, server.Options{Logger: slog.New(slog.NewTextHandler(&logs, nil))})
	do(t, h, http.MethodGet, "/healthz")
	do(t, h, http.MethodGet, "/issues")
	if strings.Contains(logs.String(), "/healthz") || !strings.Contains(logs.String(), "path=/issues status=200") {
		t.Errorf("logs:\n%s", logs.String())
	}
}

func TestServeShutsDownGracefully(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := ln.Addr().String()
	_ = ln.Close()

	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() {
		done <- server.Serve(ctx, server.Listen{Addr: addr, ShutdownTimeout: time.Second},
			http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { _, _ = io.WriteString(w, "up") }),
			slog.New(slog.DiscardHandler))
	}()
	var body string
	for range 50 {
		req, _ := http.NewRequestWithContext(t.Context(), http.MethodGet, "http://"+addr+"/", nil)
		resp, err := http.DefaultClient.Do(req)
		if err == nil {
			b, _ := io.ReadAll(resp.Body)
			_ = resp.Body.Close()
			body = string(b)
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if body != "up" {
		t.Fatalf("server never answered")
	}
	cancel()
	select {
	case err := <-done:
		if err != nil {
			t.Errorf("Serve = %v, want nil after shutdown", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Serve did not return after cancel")
	}
}

func TestServeZeroShutdownTimeoutLetsRequestsFinish(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := ln.Addr().String()
	_ = ln.Close()

	entered := make(chan struct{}, 1)
	release := make(chan struct{})
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() {
		done <- server.Serve(ctx, server.Listen{Addr: addr},
			http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.URL.Path == "/slow" {
					entered <- struct{}{}
					<-release
				}
				_, _ = io.WriteString(w, "up")
			}),
			slog.New(slog.DiscardHandler))
	}()
	for i := range 50 {
		req, _ := http.NewRequestWithContext(t.Context(), http.MethodGet, "http://"+addr+"/", nil)
		resp, err := http.DefaultClient.Do(req)
		if err == nil {
			_ = resp.Body.Close()
			break
		}
		if i == 49 {
			t.Fatal("server never answered")
		}
		time.Sleep(20 * time.Millisecond)
	}

	body := make(chan string, 1)
	go func() {
		req, _ := http.NewRequestWithContext(t.Context(), http.MethodGet, "http://"+addr+"/slow", nil)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			body <- err.Error()
			return
		}
		b, _ := io.ReadAll(resp.Body)
		_ = resp.Body.Close()
		body <- string(b)
	}()
	<-entered
	cancel()
	// Shutdown is now waiting on the request; a zero grace period would have
	// made Serve return before it finished.
	time.Sleep(100 * time.Millisecond)
	close(release)

	if got := <-body; got != "up" {
		t.Errorf("in-flight request got %q, want %q", got, "up")
	}
	select {
	case err := <-done:
		if err != nil {
			t.Errorf("Serve = %v, want nil after shutdown", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("Serve did not return after cancel")
	}
}
