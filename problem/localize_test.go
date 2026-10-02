package problem_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"testing/fstest"

	"github.com/parallelworks/foundation/problem"
)

var (
	catalog = problem.MustCatalog(fstest.MapFS{
		"en.json": {Data: []byte(`{"name_taken": "{name} is taken.", "not_found": "Nothing here."}`)},
		"ja.json": {Data: []byte(`{"name_taken": "{name}は使われています。"}`)},
	})

	localizer = &problem.Localizer{Catalogs: []*problem.Catalog{catalog}}
)

func TestLocalizeTypedProblem(t *testing.T) {
	p := nameTaken.New("name taken").With("name", "lamp")
	for lang, want := range map[string]string{"en": "lamp is taken.", "ja": "lampは使われています。"} {
		if got := localizer.Localize(lang, p).Detail; got != want {
			t.Errorf("%s: detail %q, want %q", lang, got, want)
		}
	}
	if p.Detail != "name taken" {
		t.Errorf("Localize changed its input: %q", p.Detail)
	}
	// Without its param the problem resolves to about:blank, with the status's message.
	want, _ := localizer.Message("ja", problem.CodeForStatus(http.StatusConflict), nil)
	if got := localizer.Localize("ja", nameTaken.New("name taken")); got.Code != "" || got.Detail != want {
		t.Errorf("unresolvable problem = code %q detail %q, want %q", got.Code, got.Detail, want)
	}
}

func TestLocalizeStatusProblem(t *testing.T) {
	p := problem.Status(http.StatusNotFound, "no cluster named gpu-1")
	if got := localizer.Localize("en", p).Detail; got != "no cluster named gpu-1" {
		t.Errorf("en keeps the server's detail, got %q", got)
	}
	if got := localizer.Localize("ja", p).Detail; got == "no cluster named gpu-1" || got == "" {
		t.Errorf("ja got %q, want the status's message in Japanese", got)
	}
	// An app catalog overrides a shared code, in the languages it has.
	if got := localizer.Localize("en", problem.Status(http.StatusNotFound, "")).Detail; got != "Nothing here." {
		t.Errorf("app message for not_found = %q", got)
	}
	// A 5xx detail is empty (its cause is never sent), so it gets the message.
	if got := localizer.Localize("en", problem.Status(http.StatusInternalServerError, "")).Detail; got == "" {
		t.Error("500 has no detail")
	}
}

func TestLocalizeFieldErrors(t *testing.T) {
	p := problem.ValidationFailed(
		problem.TooLong.At(problem.Pointer("name"), "too long").With("max", 64),
		problem.TooLong.At(problem.Pointer("title"), "too long"),
	)
	got := localizer.Localize("en", p)
	if got.Detail == "" || got.Detail == "validation failed" {
		t.Errorf("validation detail = %q", got.Detail)
	}
	if got.Errors[0].Detail != "Must be at most 64 characters." {
		t.Errorf("field detail = %q", got.Errors[0].Detail)
	}
	// Missing max: the field error is sent as invalid, with invalid's message.
	if got.Errors[1].Code != problem.Invalid.Code || got.Errors[1].Detail == "too long" {
		t.Errorf("unresolvable field error = %q %q", got.Errors[1].Code, got.Errors[1].Detail)
	}
	if p.Errors[0].Detail != "too long" {
		t.Error("Localize changed its input's field errors")
	}
}

func TestLanguage(t *testing.T) {
	tests := map[string]string{"": "en", "ja": "ja", "ja-JP,en;q=0.5": "ja", "es-MX": "es", "fr": "en", "zh_TW": "zh"}
	for header, want := range tests {
		h := http.Header{"Accept-Language": {header}}
		if got := localizer.Language(h); got != want {
			t.Errorf("Accept-Language %q: %q, want %q", header, got, want)
		}
	}
	cookie := &problem.Localizer{Locale: func(h http.Header) string {
		r := http.Request{Header: h}
		c, err := r.Cookie("locale")
		if err != nil {
			return ""
		}
		return c.Value
	}}
	if got := cookie.Language(http.Header{"Cookie": {"locale=ko"}}); got != "ko" {
		t.Errorf("Locale func: %q, want ko", got)
	}
}

func TestLocalizerWrite(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("Accept-Language", "ja")
	rec := httptest.NewRecorder()
	localizer.Write(rec, req, nameTaken.New("x").With("name", "lamp"))
	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if rec.Header().Get("Content-Language") != "ja" || body["detail"] != "lampは使われています。" || body["code"] != "name_taken" {
		t.Errorf("wrote %s with Content-Language %q", rec.Body, rec.Header().Get("Content-Language"))
	}
}

func TestNewCatalogRejectsBadMessages(t *testing.T) {
	for name, fsys := range map[string]fstest.MapFS{
		"no en":      {"ja.json": {Data: []byte(`{}`)}},
		"bad json":   {"en.json": {Data: []byte(`{`)}},
		"bad syntax": {"en.json": {Data: []byte(`{"x": "{n, plural, one {x}"}`)}},
		"nested":     {"en.json": {Data: []byte(`{"x": {"y": "z"}}`)}},
	} {
		if _, err := problem.NewCatalog(fsys); err == nil {
			t.Errorf("%s: no error", name)
		}
	}
}
