// Package spa serves a single-page app built by Vite from the Go server, in
// production from the embedded build and in development by proxying to the
// Vite dev server, so the app has one origin in both.
package spa

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"mime"
	"net/http"
	"net/url"
	"path"
	"strings"
)

// BuildDir is where the app's content-hashed build output goes, set in
// vite.config.ts as build.assetsDir. Handler caches everything under it as
// immutable, so it must hold nothing else: files copied from public/ keep
// their names, and cached forever they could never change.
const BuildDir = "_build"

// DevNonce is the CSP nonce Vite puts on the scripts and styles it injects in
// development, such as React's refresh preamble, when vite.config.ts sets
// html.cspNonce to it. A server's development CSP accepts it (see
// server.New), so its policy can stay strict while it proxies Vite.
const DevNonce = "vite-dev"

// Options configure Handler.
type Options struct {
	// Index rewrites index.html for a request, for example to set <html lang>
	// from Accept-Language or add <base href>. It applies in development too.
	Index func(r *http.Request, html []byte) []byte
	// NotFound reports whether a path that matches no file and no prerendered
	// page is unknown to the app. Its shell is then sent with a 404, so
	// crawlers see an honest status while the router renders its own page.
	// By default every such path is a client-side route, sent with a 200.
	NotFound func(r *http.Request) bool
	// DevServer is the Vite dev server's URL, such as "http://localhost:5173".
	// When dist holds no build, Handler proxies to it.
	DevServer string
}

// Handler serves the Vite build in dist. For a request path it serves, in
// order: the file at that path, preferring a precompressed .br or .gz sibling
// the client accepts; a prerendered <path>/index.html; for a path with no
// file extension, index.html, so client-side routes work on reload; and
// otherwise a 404. Files under BuildDir are cached for a year.
//
// When dist holds no build, as when the Go module is built before the web
// app, Handler proxies every request to opts.DevServer, including Vite's HMR
// WebSocket. It returns an error if there is neither a build nor a dev server.
func Handler(dist fs.FS, opts Options) (http.Handler, error) {
	index, err := fs.ReadFile(dist, "index.html")
	if !built(index, err) {
		if opts.DevServer == "" {
			return nil, fmt.Errorf("spa: no build in dist and no DevServer: %w", errors.Join(err, errNoBuild))
		}
		target, err := url.Parse(opts.DevServer)
		if err != nil || target.Host == "" {
			return nil, fmt.Errorf("spa: invalid DevServer %q", opts.DevServer)
		}
		return devProxy(target, opts.Index), nil
	}
	return &handler{dist: dist, index: index, opts: opts}, nil
}

var errNoBuild = errors.New("index.html is missing or a placeholder")

// Built reports whether dist holds a Vite build rather than the placeholder
// that lets the Go module build before the web app has: whether Handler serves
// it or proxies to the dev server. Use it for anything else that differs in
// development, such as where generated files are read from.
func Built(dist fs.FS) bool {
	return built(fs.ReadFile(dist, "index.html"))
}

func built(index []byte, err error) bool {
	return err == nil && bytes.Contains(index, []byte("<html"))
}

type handler struct {
	dist  fs.FS
	index []byte
	opts  Options
}

func (h *handler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, http.StatusText(http.StatusMethodNotAllowed), http.StatusMethodNotAllowed)
		return
	}
	name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")

	// Precompressed siblings are served in place of their original, never by name.
	if ext := path.Ext(name); ext == ".br" || ext == ".gz" {
		http.NotFound(w, r)
		return
	}
	if name != "" && h.serveFile(w, r, name) {
		return
	}
	if page := path.Join(name, "index.html"); name != "" && h.serveFile(w, r, page) {
		return
	}
	if path.Ext(name) != "" {
		http.NotFound(w, r)
		return
	}
	status := http.StatusOK
	if h.opts.NotFound != nil && h.opts.NotFound(r) {
		status = http.StatusNotFound
	}
	body := h.index
	if h.opts.Index != nil {
		body = h.opts.Index(r, body)
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Cache-Control", "no-cache")
	w.WriteHeader(status)
	if r.Method != http.MethodHead {
		_, _ = w.Write(body)
	}
}

// serveFile serves the file name, or a precompressed sibling the client
// accepts, and reports whether it existed.
func (h *handler) serveFile(w http.ResponseWriter, r *http.Request, name string) bool {
	if !isFile(h.dist, name) {
		return false
	}
	if strings.HasPrefix(name, BuildDir+"/") {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	} else if path.Base(name) == "index.html" {
		w.Header().Set("Cache-Control", "no-cache")
	}
	if ct := mime.TypeByExtension(path.Ext(name)); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.Header().Add("Vary", "Accept-Encoding")
	served := name
	for _, enc := range []struct{ name, ext string }{{"br", ".br"}, {"gzip", ".gz"}} {
		if accepts(r.Header.Get("Accept-Encoding"), enc.name) && isFile(h.dist, name+enc.ext) {
			w.Header().Set("Content-Encoding", enc.name)
			served = name + enc.ext
			break
		}
	}
	f, err := h.dist.Open(served)
	if err != nil {
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return true
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return true
	}
	if rs, ok := f.(io.ReadSeeker); ok {
		http.ServeContent(w, r, name, info.ModTime(), rs)
		return true
	}
	data, err := io.ReadAll(f)
	if err != nil {
		http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
		return true
	}
	http.ServeContent(w, r, name, info.ModTime(), bytes.NewReader(data))
	return true
}

func isFile(fsys fs.FS, name string) bool {
	info, err := fs.Stat(fsys, name)
	return err == nil && !info.IsDir()
}

// accepts reports whether an Accept-Encoding header allows enc.
func accepts(header, enc string) bool {
	for part := range strings.SplitSeq(header, ",") {
		token, params, _ := strings.Cut(strings.TrimSpace(part), ";")
		if !strings.EqualFold(strings.TrimSpace(token), enc) {
			continue
		}
		q := strings.ReplaceAll(params, " ", "")
		return q != "q=0" && q != "q=0.0" && q != "q=0.00" && q != "q=0.000"
	}
	return false
}
