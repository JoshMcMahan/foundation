package spa

import (
	"bytes"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strconv"
)

// devProxy forwards every request to the Vite dev server. httputil's proxy
// passes WebSocket upgrades through, so Vite's HMR works unchanged.
func devProxy(target *url.URL, index func(*http.Request, []byte) []byte) http.Handler {
	rp := &httputil.ReverseProxy{
		Rewrite: func(pr *httputil.ProxyRequest) {
			pr.SetURL(target)
			pr.SetXForwarded()
			// Vite rejects Host headers it does not know (server.allowedHosts),
			// so it sees its own. The browser's host is in X-Forwarded-Host.
			pr.Out.Host = target.Host
			if index != nil {
				// Index rewrites HTML, which must arrive uncompressed.
				pr.Out.Header.Del("Accept-Encoding")
			}
		},
		ErrorHandler: func(w http.ResponseWriter, _ *http.Request, err error) {
			http.Error(w, fmt.Sprintf("The Vite dev server at %s is not answering (%v). Start it, or build the web app.", target, err),
				http.StatusBadGateway)
		},
	}
	if index != nil {
		rp.ModifyResponse = func(resp *http.Response) error {
			ct, _, _ := mime.ParseMediaType(resp.Header.Get("Content-Type"))
			if ct != "text/html" || resp.Header.Get("Content-Encoding") != "" {
				return nil
			}
			body, err := io.ReadAll(resp.Body)
			_ = resp.Body.Close()
			if err != nil {
				return err
			}
			body = index(resp.Request, body)
			resp.Body = io.NopCloser(bytes.NewReader(body))
			resp.ContentLength = int64(len(body))
			resp.Header.Set("Content-Length", strconv.Itoa(len(body)))
			return nil
		}
	}
	return rp
}
