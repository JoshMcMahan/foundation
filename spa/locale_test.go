package spa_test

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/parallelworks/foundation/spa"
)

var locales = []string{"en", "es", "zh-TW", "ja"}

// The cases mirror @parallelworks/i18n's negotiateLocale tests, so the server
// and the client choose alike.
func TestNegotiateLocale(t *testing.T) {
	tests := []struct {
		preferred []string
		want      string
	}{
		{[]string{"zh-tw", "en"}, "zh-TW"},
		{[]string{"es-MX"}, "es"},
		{[]string{"ja-JP", "es"}, "ja"},
		{[]string{"fr-FR", "es"}, "es"},
		{[]string{"zh-HK"}, "zh-TW"},
		{[]string{"fr", "!!"}, "en"},
		{nil, "en"},
		{[]string{"cmn-Hant-TW"}, "zh-TW"},
		{[]string{"es_MX"}, "en"},
		// A region implies a language, but only the tag's own language counts.
		{[]string{"und-JP"}, "en"},
	}
	for _, tt := range tests {
		if got := spa.NegotiateLocale(tt.preferred, locales, "en"); got != tt.want {
			t.Errorf("NegotiateLocale(%q) = %q, want %q", tt.preferred, got, tt.want)
		}
	}
}

func TestLocalesNegotiate(t *testing.T) {
	l := spa.Locales{Available: locales, Cookie: "locale"}
	tests := []struct {
		name, accept, cookie, want string
	}{
		{"no preference", "", "", "en"},
		{"first preference", "ja-JP,ja;q=0.9,en;q=0.8", "", "ja"},
		{"ordered by q", "en;q=0.5, es;q=0.9", "", "es"},
		{"q=0 excluded", "es;q=0, fr, *", "", "en"},
		{"malformed q skipped", "es;q=x, ja", "", "ja"},
		{"cookie wins", "ja", "es-AR", "es"},
		{"unknown cookie ignored", "ja", "fr", "ja"},
	}
	for _, tt := range tests {
		r := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)
		if tt.accept != "" {
			r.Header.Set("Accept-Language", tt.accept)
		}
		if tt.cookie != "" {
			r.AddCookie(&http.Cookie{Name: "locale", Value: tt.cookie})
		}
		if got := l.Negotiate(r); got != tt.want {
			t.Errorf("%s: Negotiate = %q, want %q", tt.name, got, tt.want)
		}
	}

	r := httptest.NewRequestWithContext(t.Context(), http.MethodGet, "/", nil)
	if got := (spa.Locales{Available: locales, Fallback: "ja"}).Negotiate(r); got != "ja" {
		t.Errorf("Fallback: Negotiate = %q, want ja", got)
	}
}

func TestSetsHTMLLang(t *testing.T) {
	tests := []struct{ shell, want string }{
		{`<!doctype html><html><head></head></html>`, `<html lang="es"><head>`},
		{`<!doctype html><html lang="en"><head></head></html>`, `<html lang="es"><head>`},
		{`<!doctype html><html class="dark" lang='en' dir="ltr"><head></head></html>`, `<html class="dark" lang="es" dir="ltr"><head>`},
		{`<!doctype html><html lang=en><head></head></html>`, `<html lang="es"><head>`},
	}
	for _, tt := range tests {
		h, err := spa.Handler(fstest.MapFS{"index.html": {Data: []byte(tt.shell)}}, spa.Options{
			Locales: spa.Locales{Available: locales, Cookie: "locale"},
			Index: func(_ *http.Request, html []byte) []byte {
				return []byte(strings.Replace(string(html), "<head>", `<head><base href="/">`, 1))
			},
		})
		if err != nil {
			t.Fatal(err)
		}
		rec := get(t, h, "/issues/1", "Accept-Language", "es-MX")
		if body := rec.Body.String(); !strings.Contains(body, tt.want) || !strings.Contains(body, `<base href="/">`) {
			t.Errorf("%s: body = %s, want %s and Index applied", tt.shell, body, tt.want)
		}
		if vary := rec.Header().Values("Vary"); strings.Join(vary, ",") != "Accept-Language,Cookie,Accept-Encoding" {
			t.Errorf("Vary = %q", vary)
		}
	}
}

func TestNoLocalesLeavesLang(t *testing.T) {
	h := newHandler(t, spa.Options{})
	rec := get(t, h, "/", "Accept-Language", "es")
	if rec.Body.String() != shell || rec.Header().Get("Vary") != "Accept-Encoding" {
		t.Errorf("body = %s, Vary %q, want only Accept-Encoding", rec.Body, rec.Header().Get("Vary"))
	}
}

func TestDevServerLang(t *testing.T) {
	vite := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = io.WriteString(w, `<!doctype html><html lang="en"><head></head></html>`)
	}))
	defer vite.Close()
	h, err := spa.Handler(placeholder, spa.Options{DevServer: vite.URL, Locales: spa.Locales{Available: locales}})
	if err != nil {
		t.Fatal(err)
	}
	app := httptest.NewServer(h)
	defer app.Close()

	req, err := http.NewRequestWithContext(t.Context(), http.MethodGet, app.URL+"/", nil)
	if err != nil {
		t.Fatal(err)
	}
	req.Header.Set("Accept-Language", "ja")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	body, _ := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if !strings.Contains(string(body), `<html lang="ja">`) || resp.Header.Get("Vary") != "Accept-Language" {
		t.Errorf("body = %s, Vary %q", body, resp.Header.Get("Vary"))
	}
}

func TestNegotiateHeader(t *testing.T) {
	l := spa.Locales{Available: []string{"en", "ja", "es"}, Cookie: "locale"}
	if got := l.NegotiateHeader(http.Header{"Cookie": {"locale=es-MX"}, "Accept-Language": {"ja"}}); got != "es" {
		t.Errorf("cookie: %q, want es", got)
	}
	if got := l.NegotiateHeader(http.Header{"Accept-Language": {"ja-JP"}}); got != "ja" {
		t.Errorf("Accept-Language: %q, want ja", got)
	}
}
