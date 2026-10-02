package problem_test

import (
	"crypto/sha256"
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/parallelworks/foundation/problem"
)

var pageDocs = problem.MustDocs(fstest.MapFS{
	"en.json": {Data: []byte(`{"name_taken": {"title": "That name is taken", "why": "Names are unique.", "fix": ["Pick another name.", "Or rename the other item."], "links": [{"title": "Naming rules", "href": "https://example.com/naming"}]}}`)},
	"ja.json": {Data: []byte(`{"name_taken": {"title": "その名前は使われています", "why": "名前は一意です。"}}`)},
})

func pagesHandler() http.Handler {
	return problem.Pages(problem.PagesOptions{
		Registries: []*problem.Registry{testRegistry},
		Localizer:  &problem.Localizer{Catalogs: []*problem.Catalog{catalog}},
		Docs:       []*problem.Docs{pageDocs},
	})
}

func getPage(t *testing.T, target string, header ...string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodGet, target, nil)
	for i := 0; i+1 < len(header); i += 2 {
		req.Header.Set(header[i], header[i+1])
	}
	rec := httptest.NewRecorder()
	pagesHandler().ServeHTTP(rec, req)
	return rec
}

func TestPagesIndex(t *testing.T) {
	rec := getPage(t, "/problems/")
	body := rec.Body.String()
	for _, want := range []string{"Error reference", `href="/problems/not_found"`, `href="/problems/validation"`, `href="/problems/too_long"`, `href="/problems/shop/name_taken"`, "That name is taken"} {
		if !strings.Contains(body, want) {
			t.Errorf("index lacks %q", want)
		}
	}
	if rec.Header().Get("Content-Language") != "en" {
		t.Errorf("Content-Language %q", rec.Header().Get("Content-Language"))
	}
}

// The page's only style is allowed by its hash, so the CSP stays strict.
func TestPagesStyleMatchesCSP(t *testing.T) {
	rec := getPage(t, "/problems/shop/name_taken")
	style := regexp.MustCompile(`(?s)<style>(.*?)</style>`).FindStringSubmatch(rec.Body.String())
	if style == nil {
		t.Fatal("no style element")
	}
	sum := sha256.Sum256([]byte(style[1]))
	want := "default-src 'none'; style-src 'sha256-" + base64.StdEncoding.EncodeToString(sum[:]) + "'"
	if got := rec.Header().Get("Content-Security-Policy"); got != want {
		t.Errorf("CSP %q, want %q", got, want)
	}
}

func TestTypePage(t *testing.T) {
	body := getPage(t, "/problems/shop/name_taken").Body.String()
	for _, want := range []string{"409 · <code>name_taken</code>", "That name is taken", "{name} is taken.", "Names are unique.", "<li>Pick another name.</li>", `href="https://example.com/naming"`, `&#34;code&#34;: &#34;name_taken&#34;`} {
		if !strings.Contains(body, want) {
			t.Errorf("type page lacks %q", want)
		}
	}
}

func TestTypePageInTheReadersLanguage(t *testing.T) {
	body := getPage(t, "/problems/shop/name_taken", "Accept-Language", "ja-JP").Body.String()
	for _, want := range []string{`lang="ja"`, "その名前は使われています", "{name}は使われています。", "名前は一意です。", "解決方法", "<li>Pick another name.</li>"} {
		if !strings.Contains(body, want) {
			t.Errorf("ja page lacks %q", want)
		}
	}
	// ?lang= wins, so a shared link keeps its language.
	if body := getPage(t, "/problems/shop/name_taken?lang=es", "Accept-Language", "ja").Body.String(); !strings.Contains(body, "Cómo solucionarlo") {
		t.Error("?lang=es did not override Accept-Language")
	}
}

func TestStatusAndRulePages(t *testing.T) {
	for path, want := range map[string]string{
		"/problems/not_found":  "404 · <code>not_found</code>",
		"/problems/internal":   "500 · <code>internal</code>",
		"/problems/too_long":   "Shorten the value",
		"/problems/validation": "errors list",
	} {
		if rec := getPage(t, path); rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), want) {
			t.Errorf("%s = %d, lacks %q", path, rec.Code, want)
		}
	}
}

func TestPagesNotFoundAndMethods(t *testing.T) {
	if rec := getPage(t, "/problems/shop/nope"); rec.Code != http.StatusNotFound || rec.Header().Get("Content-Type") != problem.MediaType {
		t.Errorf("unknown type = %d %s", rec.Code, rec.Header().Get("Content-Type"))
	}
	rec := httptest.NewRecorder()
	pagesHandler().ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/problems/", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST = %d", rec.Code)
	}
}

func TestNewDocsRejectsUnsafeLinks(t *testing.T) {
	for _, href := range []string{"javascript:alert(1)", "http://example.com", ""} {
		_, err := problem.NewDocs(fstest.MapFS{"en.json": {Data: []byte(`{"x": {"links": [{"title": "t", "href": "` + href + `"}]}}`)}})
		if err == nil {
			t.Errorf("href %q accepted", href)
		}
	}
}

func TestSharedDocsCoverSharedCodes(t *testing.T) {
	codes := append([]problem.Code{problem.Validation.Code}, problem.StatusCodes...)
	for _, r := range problem.Rules {
		codes = append(codes, r.Code)
	}
	for _, c := range codes {
		path := "/problems/" + string(c)
		if body := getPage(t, path).Body.String(); !strings.Contains(body, "Why this happened") || !strings.Contains(body, "How to fix it") {
			t.Errorf("%s lacks guidance", path)
		}
	}
}
