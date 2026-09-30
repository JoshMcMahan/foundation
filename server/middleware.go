package server

import (
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"runtime/debug"
	"strings"
	"time"

	"github.com/parallelworks/foundation/problem"
)

// sameOrigin rejects state-changing requests a browser sent from another
// site, which is what makes cookie sessions safe from cross-site request
// forgery. Requests without browser origin headers come from non-browser
// clients, which carry no ambient cookies, and pass.
func sameOrigin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet, http.MethodHead, http.MethodOptions:
			next.ServeHTTP(w, r)
			return
		}
		if site := r.Header.Get("Sec-Fetch-Site"); site != "" {
			if site != "same-origin" && site != "none" {
				problem.Write(w, problem.Status(http.StatusForbidden, "cross-site request refused"))
				return
			}
		} else if origin := r.Header.Get("Origin"); origin != "" {
			u, err := url.Parse(origin)
			if err != nil || u.Host != r.Host {
				problem.Write(w, problem.Status(http.StatusForbidden, "cross-site request refused"))
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

func securityHeaders(next http.Handler, csp string, hsts bool) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", csp)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "strict-origin-when-cross-origin")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		if hsts {
			h.Set("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
		}
		next.ServeHTTP(w, r)
	})
}

type statusRecorder struct {
	http.ResponseWriter
	status int
	bytes  int
}

func (r *statusRecorder) WriteHeader(code int) {
	r.status = code
	r.ResponseWriter.WriteHeader(code)
}

func (r *statusRecorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	n, err := r.ResponseWriter.Write(b)
	r.bytes += n
	return n, err
}

// Unwrap lets http.ResponseController reach the underlying writer, so
// WebSocket upgrades and flushing work through the recorder.
func (r *statusRecorder) Unwrap() http.ResponseWriter { return r.ResponseWriter }

func logRequests(next http.Handler, logger *slog.Logger) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rec := &statusRecorder{ResponseWriter: w}
		next.ServeHTTP(rec, r)

		if r.URL.Path == "/healthz" || r.URL.Path == "/readyz" {
			return
		}
		logger.LogAttrs(r.Context(), slog.LevelInfo, "http request",
			slog.String("method", r.Method),
			slog.String("path", r.URL.Path),
			slog.Int("status", rec.status),
			slog.Int("bytes", rec.bytes),
			slog.Duration("duration", time.Since(start)),
			slog.String("remote_addr", r.RemoteAddr),
		)
	})
}

func recoverPanics(next http.Handler, logger *slog.Logger, apiPrefix string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				handlePanic(w, r, logger, apiPrefix, v)
			}
		}()
		next.ServeHTTP(w, r)
	})
}

func handlePanic(w http.ResponseWriter, r *http.Request, logger *slog.Logger, apiPrefix string, v any) {
	if err, ok := v.(error); ok && errors.Is(err, http.ErrAbortHandler) {
		panic(v) // let net/http abort the response as the handler intended
	}
	logger.ErrorContext(r.Context(), "panic serving request",
		"panic", v, "path", r.URL.Path, "stack", string(debug.Stack()))
	if strings.HasPrefix(r.URL.Path, apiPrefix) {
		// API clients localize on the error code, so they get one here too.
		problem.Write(w, problem.Status(http.StatusInternalServerError, ""))
		return
	}
	http.Error(w, http.StatusText(http.StatusInternalServerError), http.StatusInternalServerError)
}
