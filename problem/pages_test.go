package problem_test

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
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

func TestTypePageAsJSON(t *testing.T) {
	rec := getPage(t, "/problems/shop/name_taken", "Accept", "application/json", "Accept-Language", "ja")
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("Content-Type %q", ct)
	}
	var got struct {
		Type, Code, Title, Message, Why, Language string
		Status                                    int
		Fix                                       []string
		Links                                     []problem.Link
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	if got.Type != "/problems/shop/name_taken" || got.Code != "name_taken" || got.Status != 409 || got.Language != "ja" {
		t.Errorf("identity = %+v", got)
	}
	if got.Title != "その名前は使われています" || got.Message != "{name}は使われています。" || got.Why != "名前は一意です。" {
		t.Errorf("localized text = %+v", got)
	}
	// Guidance falls back to English field by field, as on the page.
	if len(got.Fix) != 2 || got.Fix[0] != "Pick another name." || len(got.Links) != 1 {
		t.Errorf("fallback guidance = %+v", got)
	}
	if !strings.Contains(rec.Header().Get("Vary"), "Accept") {
		t.Errorf("Vary %q lacks Accept", rec.Header().Get("Vary"))
	}
}

func TestIndexAsJSON(t *testing.T) {
	rec := getPage(t, "/problems/", "Accept", "application/json")
	var got struct {
		Language string
		Types    []struct {
			Type, Code, Title string
			Status            int
		}
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
		t.Fatal(err)
	}
	codes := map[string]string{}
	for _, e := range got.Types {
		codes[e.Code] = e.Type
	}
	for code, uri := range map[string]string{"not_found": "/problems/not_found", "validation": "/problems/validation", "too_long": "/problems/too_long", "name_taken": "/problems/shop/name_taken"} {
		if codes[code] != uri {
			t.Errorf("%s -> %q, want %q", code, codes[code], uri)
		}
	}
}

func TestBrowsersStillGetHTML(t *testing.T) {
	rec := getPage(t, "/problems/shop/name_taken", "Accept", "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8")
	if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
		t.Errorf("Content-Type %q", ct)
	}
	if !strings.Contains(rec.Header().Get("Vary"), "Accept") {
		t.Errorf("Vary %q lacks Accept", rec.Header().Get("Vary"))
	}
}
