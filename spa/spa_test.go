package spa_test

import (
	"bufio"
	"compress/gzip"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/parallelworks/foundation/spa"
)

const shell = `<!doctype html><html><head><title>app</title></head><body></body></html>`

func build() fstest.MapFS {
	return fstest.MapFS{
		"index.html":              {Data: []byte(shell)},
		"_build/app-abc123.js":    {Data: []byte("console.log('app')")},
		"_build/app-abc123.js.br": {Data: []byte("brotli bytes")},
		"_build/app-abc123.js.gz": {Data: []byte("gzip bytes")},
		"assets/logo.svg":         {Data: []byte("<svg/>")},
		"robots.txt":              {Data: []byte("User-agent: *")},
		"docs/intro/index.html":   {Data: []byte("<html>prerendered intro</html>")},
	}
}

func get(t *testing.T, h http.Handler, target string, header ...string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, target, nil)
	for i := 0; i+1 < len(header); i += 2 {
		req.Header.Set(header[i], header[i+1])
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	return rec
}

func newHandler(t *testing.T, opts spa.Options) http.Handler {
	t.Helper()
	h, err := spa.Handler(build(), opts)
	if err != nil {
		t.Fatal(err)
	}
	return h
}

func TestServesFilesWithCaching(t *testing.T) {
	h := newHandler(t, spa.Options{})

	rec := get(t, h, "/_build/app-abc123.js")
	if rec.Code != http.StatusOK || rec.Body.String() != "console.log('app')" {
		t.Fatalf("asset = %d %q", rec.Code, rec.Body)
	}
	if cc := rec.Header().Get("Cache-Control"); cc != "public, max-age=31536000, immutable" {
		t.Errorf("asset Cache-Control = %q", cc)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/javascript") {
		t.Errorf("asset Content-Type = %q", ct)
	}

	// Files from public/ keep their names, so they must stay revalidatable.
	for _, p := range []string{"/robots.txt", "/assets/logo.svg"} {
		rec = get(t, h, p)
		if rec.Code != http.StatusOK || rec.Header().Get("Cache-Control") != "" {
			t.Errorf("%s = %d, Cache-Control %q", p, rec.Code, rec.Header().Get("Cache-Control"))
		}
	}
}

func TestPrefersPrecompressedSiblings(t *testing.T) {
	h := newHandler(t, spa.Options{})
	tests := []struct{ accept, encoding, body string }{
		{"gzip, deflate, br", "br", "brotli bytes"},
		{"gzip", "gzip", "gzip bytes"},
		{"br;q=0, gzip", "gzip", "gzip bytes"},
		{"", "", "console.log('app')"},
	}
	for _, tt := range tests {
		rec := get(t, h, "/_build/app-abc123.js", "Accept-Encoding", tt.accept)
		if rec.Header().Get("Content-Encoding") != tt.encoding || rec.Body.String() != tt.body {
			t.Errorf("Accept-Encoding %q: encoding %q body %q", tt.accept, rec.Header().Get("Content-Encoding"), rec.Body)
		}
		if !strings.Contains(rec.Header().Get("Vary"), "Accept-Encoding") {
			t.Errorf("Accept-Encoding %q: no Vary", tt.accept)
		}
		if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/javascript") {
			t.Errorf("Accept-Encoding %q: Content-Type %q", tt.accept, ct)
		}
	}
	if rec := get(t, h, "/_build/app-abc123.js.br"); rec.Code != http.StatusNotFound {
		t.Errorf("a .br file by name = %d, want 404", rec.Code)
	}
}

func TestFallsBackToShellForClientRoutes(t *testing.T) {
	h := newHandler(t, spa.Options{})
	for _, p := range []string{"/", "/issues/TAN-1", "/settings/", "/../../etc/passwd"} {
		rec := get(t, h, p)
		if rec.Code != http.StatusOK || rec.Body.String() != shell {
			t.Errorf("%s = %d %q", p, rec.Code, rec.Body)
		}
		if rec.Header().Get("Cache-Control") != "no-cache" {
			t.Errorf("%s: Cache-Control %q", p, rec.Header().Get("Cache-Control"))
		}
	}
	if rec := get(t, h, "/assets/missing.js"); rec.Code != http.StatusNotFound {
		t.Errorf("missing asset = %d, want 404", rec.Code)
	}
}

func TestServesPrerenderedPages(t *testing.T) {
	h := newHandler(t, spa.Options{})
	for _, p := range []string{"/docs/intro", "/docs/intro/"} {
		if rec := get(t, h, p); rec.Body.String() != "<html>prerendered intro</html>" {
			t.Errorf("%s = %q", p, rec.Body)
		}
	}
}

func TestOptions(t *testing.T) {
	h := newHandler(t, spa.Options{
		Index: func(r *http.Request, html []byte) []byte {
			return []byte(strings.Replace(string(html), "<html>", `<html lang="`+r.Header.Get("Accept-Language")+`">`, 1))
		},
		NotFound: func(r *http.Request) bool { return !strings.HasPrefix(r.URL.Path, "/app/") },
	})
	rec := get(t, h, "/app/x", "Accept-Language", "ja")
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `<html lang="ja">`) {
		t.Errorf("/app/x = %d %q", rec.Code, rec.Body)
	}
	if rec := get(t, h, "/nope"); rec.Code != http.StatusNotFound || !strings.Contains(rec.Body.String(), "<html") {
		t.Errorf("/nope = %d %q, want the shell with a 404", rec.Code, rec.Body)
	}
}

func TestRejectsOtherMethods(t *testing.T) {
	h := newHandler(t, spa.Options{})
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/", nil))
	if rec.Code != http.StatusMethodNotAllowed || rec.Header().Get("Allow") != "GET, HEAD" {
		t.Errorf("POST = %d, Allow %q", rec.Code, rec.Header().Get("Allow"))
	}
}

var placeholder = fstest.MapFS{".gitkeep": {Data: nil}}

func TestBuilt(t *testing.T) {
	if !spa.Built(build()) {
		t.Error("Built(build) = false")
	}
	for name, fsys := range map[string]fstest.MapFS{
		"empty":       placeholder,
		"placeholder": {"index.html": {Data: []byte("placeholder")}},
	} {
		if spa.Built(fsys) {
			t.Errorf("Built(%s) = true", name)
		}
	}
}

func TestNoBuildNeedsDevServer(t *testing.T) {
	if _, err := spa.Handler(placeholder, spa.Options{}); err == nil {
		t.Error("no build and no DevServer: no error")
	}
	stub := fstest.MapFS{"index.html": {Data: []byte("placeholder")}}
	if _, err := spa.Handler(stub, spa.Options{}); err == nil {
		t.Error("placeholder index.html and no DevServer: no error")
	}
	if _, err := spa.Handler(placeholder, spa.Options{DevServer: "localhost"}); err == nil {
		t.Error("DevServer without a scheme: no error")
	}
}

func TestProxiesToDevServer(t *testing.T) {
	var gotHost, gotForwarded string
	vite := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotHost, gotForwarded = r.Host, r.Header.Get("X-Forwarded-Host")
		if r.URL.Path == "/src/main.tsx" {
			w.Header().Set("Content-Type", "text/javascript")
			_, _ = io.WriteString(w, "export {}")
			return
		}
		w.Header().Set("Content-Type", "text/html")
		// Vite compresses when asked; Index still has to see the HTML.
		if strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			w.Header().Set("Content-Encoding", "gzip")
			zw := gzip.NewWriter(w)
			_, _ = io.WriteString(zw, shell)
			_ = zw.Close()
			return
		}
		_, _ = io.WriteString(w, shell)
	}))
	defer vite.Close()

	h, err := spa.Handler(placeholder, spa.Options{
		DevServer: vite.URL,
		Index: func(_ *http.Request, html []byte) []byte {
			return []byte(strings.Replace(string(html), "<head>", `<head><base href="/app/">`, 1))
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	app := httptest.NewServer(h)
	defer app.Close()

	resp, err := http.Get(app.URL + "/issues/1")
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if !strings.Contains(string(body), `<base href="/app/">`) {
		t.Errorf("HTML from Vite did not go through Index: %q", body)
	}
	if gotHost != strings.TrimPrefix(vite.URL, "http://") || gotForwarded != strings.TrimPrefix(app.URL, "http://") {
		t.Errorf("Vite saw Host %q, X-Forwarded-Host %q", gotHost, gotForwarded)
	}

	resp, err = http.Get(app.URL + "/src/main.tsx")
	if err != nil {
		t.Fatal(err)
	}
	body, _ = io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if string(body) != "export {}" {
		t.Errorf("module = %q", body)
	}
}

// Vite's HMR client holds a WebSocket to the dev server; it must pass through.
func TestProxiesHMRWebSocket(t *testing.T) {
	vite := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Upgrade") != "websocket" {
			http.Error(w, "want upgrade", http.StatusBadRequest)
			return
		}
		conn, rw, err := http.NewResponseController(w).Hijack()
		if err != nil {
			return
		}
		defer conn.Close()
		_, _ = rw.WriteString("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n")
		_ = rw.Flush()
		line, _ := rw.ReadString('\n')
		_, _ = rw.WriteString("echo " + line)
		_ = rw.Flush()
	}))
	defer vite.Close()

	h, err := spa.Handler(placeholder, spa.Options{DevServer: vite.URL})
	if err != nil {
		t.Fatal(err)
	}
	app := httptest.NewServer(h)
	defer app.Close()

	conn, err := net.Dial("tcp", strings.TrimPrefix(app.URL, "http://"))
	if err != nil {
		t.Fatal(err)
	}
	defer conn.Close()
	_, _ = io.WriteString(conn, "GET /?token=x HTTP/1.1\r\nHost: app\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Key: x\r\nSec-WebSocket-Version: 13\r\n\r\n")
	r := bufio.NewReader(conn)
	resp, err := http.ReadResponse(r, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("upgrade = %d", resp.StatusCode)
	}
	_, _ = io.WriteString(conn, "update\n")
	if line, _ := r.ReadString('\n'); line != "echo update\n" {
		t.Errorf("frame = %q", line)
	}
}

func TestDevServerDownExplains(t *testing.T) {
	vite := httptest.NewServer(http.NotFoundHandler())
	url := vite.URL
	vite.Close()
	h, err := spa.Handler(placeholder, spa.Options{DevServer: url})
	if err != nil {
		t.Fatal(err)
	}
	rec := get(t, h, "/")
	if rec.Code != http.StatusBadGateway || !strings.Contains(rec.Body.String(), "Vite dev server") {
		t.Errorf("= %d %q", rec.Code, rec.Body)
	}
}
