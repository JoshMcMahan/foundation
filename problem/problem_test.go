package problem_test

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"slices"
	"strings"
	"testing"

	"github.com/parallelworks/foundation/problem"
	"github.com/parallelworks/foundation/problem/problemtest"
)

var (
	testRegistry = problem.NewRegistry("shop")
	nameTaken    = testRegistry.Define(problem.Type{
		Code: "name_taken", Status: http.StatusConflict, Title: "Name taken",
		Doc: "Another item already has this name.", Params: []string{"name"},
	})
)

func marshal(t *testing.T, v any) map[string]any {
	t.Helper()
	raw, err := json.Marshal(v)
	if err != nil {
		t.Fatal(err)
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatal(err)
	}
	return m
}

func TestStatusProblemIsBlankWithoutCode(t *testing.T) {
	p := problem.Status(http.StatusNotFound, "no order 1042")
	got := marshal(t, p)
	want := map[string]any{"type": "about:blank", "title": "Not Found", "status": float64(404), "detail": "no order 1042"}
	if !mapsEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
	if p.Key() != problem.NotFound {
		t.Errorf("Key() = %q, want not_found", p.Key())
	}
}

func TestDefinedTypeCarriesCodeAndTitle(t *testing.T) {
	p := nameTaken.New("a product named Lamp exists").With("name", "Lamp")
	got := marshal(t, p)
	want := map[string]any{
		"type": "/problems/shop/name_taken", "title": "Name taken", "status": float64(409),
		"detail": "a product named Lamp exists", "code": "name_taken", "params": map[string]any{"name": "Lamp"},
	}
	if !mapsEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestValidationFailedListsFieldErrors(t *testing.T) {
	p := problem.ValidationFailed(
		problem.TooLong.At(problem.Pointer("name"), "too long").With("max", 64),
		problem.Required.AtParameter("query", "team", "missing"),
	)
	got := marshal(t, p)
	if got["type"] != "/problems/validation" || got["code"] != "validation" || got["status"] != float64(422) {
		t.Errorf("got %v", got)
	}
	errs, _ := got["errors"].([]any)
	if len(errs) != 2 {
		t.Fatalf("errors = %v", got["errors"])
	}
	first, _ := errs[0].(map[string]any)
	if first["type"] != "/problems/too_long" || first["pointer"] != "#/name" || first["code"] != "too_long" {
		t.Errorf("first = %v", first)
	}
	second, _ := errs[1].(map[string]any)
	if second["parameter"] != "team" || second["in"] != "query" || second["pointer"] != nil {
		t.Errorf("second = %v", second)
	}
}

func TestPointerEscapesSegments(t *testing.T) {
	tests := []struct {
		path []any
		want string
	}{
		{nil, "#"},
		{[]any{"items", 3, "name"}, "#/items/3/name"},
		{[]any{"a/b", "c~d"}, "#/a~1b/c~0d"},
		{[]any{"with space"}, "#/with%20space"},
	}
	for _, tt := range tests {
		if got := problem.Pointer(tt.path...); got != tt.want {
			t.Errorf("Pointer(%v) = %q, want %q", tt.path, got, tt.want)
		}
	}
}

func TestCodeForStatusCoversEveryError(t *testing.T) {
	for status := 400; status < 600; status++ {
		if c := problem.CodeForStatus(status); !slices.Contains(problem.StatusCodes, c) {
			t.Errorf("CodeForStatus(%d) = %q, which is not in StatusCodes", status, c)
		}
	}
}

func TestDefineRejectsInvalidTypes(t *testing.T) {
	tests := map[string]problem.Type{
		"bad code":       {Code: "Name-Taken", Status: 409, Title: "x"},
		"not an error":   {Code: "fine", Status: 200, Title: "x"},
		"no title":       {Code: "untitled", Status: 400},
		"duplicate":      {Code: "name_taken", Status: 409, Title: "x"},
		"status code":    {Code: "not_found", Status: 404, Title: "x"},
		"shared rule":    {Code: "too_long", Status: 422, Title: "x"},
		"validation":     {Code: "validation", Status: 422, Title: "x"},
		"leading number": {Code: "1st", Status: 400, Title: "x"},
	}
	for name, typ := range tests {
		t.Run(name, func(t *testing.T) {
			defer func() {
				if recover() == nil {
					t.Errorf("Define(%+v) did not panic", typ)
				}
			}()
			testRegistry.Define(typ)
		})
	}
}

func TestNewRegistryRejectsInvalidName(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Error("NewRegistry(\"Shop\") did not panic")
		}
	}()
	problem.NewRegistry("Shop")
}

func TestWriteSendsProblemJSON(t *testing.T) {
	rec := httptest.NewRecorder()
	problem.Write(rec, nameTaken.New("taken"))
	if ct := rec.Header().Get("Content-Type"); ct != problem.MediaType {
		t.Errorf("Content-Type = %q", ct)
	}
	if rec.Code != http.StatusConflict {
		t.Errorf("status = %d", rec.Code)
	}
}

func TestHandlerServesEveryTypeURI(t *testing.T) {
	h := problem.Handler(testRegistry)
	uris := []string{"/problems/", problem.Validation.URI(), nameTaken.URI()}
	for _, r := range problem.Rules {
		uris = append(uris, r.URI())
	}
	for _, uri := range uris {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, uri, nil))
		if rec.Code != http.StatusOK || !strings.HasPrefix(rec.Header().Get("Content-Type"), "text/html") {
			t.Errorf("GET %s = %d %s", uri, rec.Code, rec.Header().Get("Content-Type"))
		}
	}

	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, nameTaken.URI(), nil))
	for _, want := range []string{"Name taken", "name_taken", "409", "Another item already has this name.", "name"} {
		if !strings.Contains(rec.Body.String(), want) {
			t.Errorf("page for %s lacks %q", nameTaken.URI(), want)
		}
	}

	for _, uri := range []string{"/problems/nope", "/problems/shop/nope", "/problems/other/name_taken"} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, uri, nil))
		if rec.Code != http.StatusNotFound || rec.Header().Get("Content-Type") != problem.MediaType {
			t.Errorf("GET %s = %d %s, want a 404 problem", uri, rec.Code, rec.Header().Get("Content-Type"))
		}
	}

	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(http.MethodPost, "/problems/", nil))
	if rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST = %d", rec.Code)
	}
}

// The shared codes' messages ship with @parallelworks/problem in every
// language it supports, so each catalog needs all of them, and only the
// params each code declares.
func TestSharedCatalogsCoverSharedCodes(t *testing.T) {
	params := map[string][]string{"network": nil, "unknown": nil}
	for _, c := range problem.StatusCodes {
		params[string(c)] = nil
	}
	for _, typ := range append([]*problem.Type{problem.Validation}, problem.Rules...) {
		params[string(typ.Code)] = typ.Params
	}

	for _, lang := range problem.Shared.Languages() {
		msgs := problem.Shared.Messages(lang)
		for code, p := range params {
			msg := msgs[problem.Code(code)]
			if msg == "" {
				t.Errorf("%s has no message for %s", lang, code)
				continue
			}
			if err := problemtest.CheckArgs(msg, p); err != nil {
				t.Errorf("%s %s: %v", lang, code, err)
			}
		}
	}
}

func mapsEqual(a, b map[string]any) bool {
	ja, _ := json.Marshal(a)
	jb, _ := json.Marshal(b)
	return string(ja) == string(jb)
}

func TestDeniedSurvivesWrappingAndIsNotSent(t *testing.T) {
	denial := problem.Status(http.StatusNotFound, "no cluster").AsDenial()
	if !problem.Denied(denial) || !problem.Denied(fmt.Errorf("check: %w", denial)) {
		t.Error("Denied did not recognize a denial")
	}
	if problem.Denied(problem.Status(http.StatusNotFound, "no cluster")) || problem.Denied(errors.New("x")) || problem.Denied(nil) {
		t.Error("Denied recognized a problem that is not a denial")
	}
	if !mapsEqual(marshal(t, denial), marshal(t, problem.Status(http.StatusNotFound, "no cluster"))) {
		t.Error("the denial marker changed the response")
	}
}

func sent(t *testing.T, p *problem.Problem) problem.Problem {
	t.Helper()
	raw, err := json.Marshal(p)
	if err != nil {
		t.Fatal(err)
	}
	var got problem.Problem
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatal(err)
	}
	return got
}

func TestMissingParamIsSentAsStatusProblem(t *testing.T) {
	p := nameTaken.New("an item named Lamp exists")
	if got := sent(t, p); got.Type != problem.Blank || got.Code != "" || got.Params != nil || got.Status != http.StatusConflict {
		t.Errorf("without its param = %+v", got)
	}
	if r := p.Resolve(); r.Key() != problem.Conflict || r.Params != nil {
		t.Errorf("Resolve() = %+v", r)
	}

	p = p.With("name", "Lamp")
	if got := sent(t, p); got.Code != "name_taken" || got.Params["name"] != "Lamp" {
		t.Errorf("with its param = %+v", got)
	}
	if p.Resolve() != p {
		t.Error("Resolve() copied a complete problem")
	}
}

func TestFieldMissingParamIsSentAsInvalid(t *testing.T) {
	got := sent(t, problem.ValidationFailed(problem.TooLong.At("#/name", "too long")))
	if len(got.Errors) != 1 || got.Errors[0].Code != problem.Invalid.Code || got.Errors[0].Pointer != "#/name" || got.Errors[0].Params != nil {
		t.Errorf("without its param = %+v", got.Errors)
	}

	got = sent(t, problem.ValidationFailed(problem.TooLong.At("#/name", "too long").With("max", 64)))
	if len(got.Errors) != 1 || got.Errors[0].Code != problem.TooLong.Code {
		t.Errorf("with its param = %+v", got.Errors)
	}
}
