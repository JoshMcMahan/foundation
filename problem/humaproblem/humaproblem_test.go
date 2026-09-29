package humaproblem_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/humatest"

	"github.com/parallelworks/foundation/problem"
	"github.com/parallelworks/foundation/problem/humaproblem"
)

var (
	registry  = problem.NewRegistry("test")
	nameTaken = registry.Define(problem.Type{Code: "name_taken", Status: http.StatusConflict, Title: "Name taken", Params: []string{"name"}})
)

type itemBody struct {
	Name  string   `json:"name" minLength:"2" maxLength:"5"`
	Count int      `json:"count" minimum:"1" maximum:"10"`
	Ratio float64  `json:"ratio,omitempty" exclusiveMinimum:"0"`
	Kind  string   `json:"kind,omitempty" enum:"a,b"`
	Tags  []string `json:"tags,omitempty" maxItems:"1" uniqueItems:"true"`
	Email string   `json:"email,omitempty" format:"email"`
	Items []struct {
		Label string `json:"label" maxLength:"3"`
	} `json:"items,omitempty"`
}

var errNoItem = errors.New("no such item")

func newAPI(t *testing.T) humatest.TestAPI {
	t.Helper()
	return newAPIWith(t, humaproblem.Options{})
}

func newAPIWith(t *testing.T, opts humaproblem.Options, transformers ...huma.Transformer) humatest.TestAPI {
	t.Helper()
	humaproblem.Install(opts)
	cfg := huma.DefaultConfig("test", "1")
	cfg.Transformers = append(cfg.Transformers, transformers...)
	_, api := humatest.New(t, cfg)
	huma.Register(api, huma.Operation{Method: http.MethodPost, Path: "/items"},
		func(_ context.Context, in *struct {
			Limit int    `query:"limit" minimum:"1"`
			Mode  string `query:"mode" required:"true"`
			Body  itemBody
		},
		) (*struct{}, error) {
			switch in.Body.Name {
			case "taken":
				return nil, nameTaken.New("an item named taken exists").With("name", "taken")
			case "boom":
				return nil, errors.New("dial tcp 10.0.0.5:5432: connection refused")
			case "gone":
				return nil, fmt.Errorf("load item: %w", errNoItem)
			}
			return nil, nil
		})
	humaproblem.Document(api, registry)
	return api
}

func decode(t *testing.T, body string) *problem.Problem {
	t.Helper()
	var p problem.Problem
	if err := json.Unmarshal([]byte(body), &p); err != nil {
		t.Fatalf("decode %s: %v", body, err)
	}
	return &p
}

func TestValidationNamesEachRule(t *testing.T) {
	api := newAPI(t)
	resp := api.Post("/items?limit=0", map[string]any{
		"count": 0, "ratio": 0, "kind": "c", "tags": []string{"x", "y"}, "email": "nope",
		"extra": true, "items": []map[string]any{{"label": "long"}},
	})
	if resp.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d: %s", resp.Code, resp.Body)
	}
	if ct := resp.Header().Get("Content-Type"); ct != problem.MediaType {
		t.Errorf("Content-Type = %q", ct)
	}
	p := decode(t, resp.Body.String())
	if p.Type != "/problems/validation" || p.Code != "validation" {
		t.Errorf("type %q code %q", p.Type, p.Code)
	}

	type want struct {
		code   problem.Code
		params map[string]any
	}
	wants := map[string]want{
		"#/name":          {code: "required"},
		"#/count":         {code: "below_minimum", params: map[string]any{"min": float64(1), "exclusive": "false"}},
		"#/ratio":         {code: "below_minimum", params: map[string]any{"min": float64(0), "exclusive": "true"}},
		"#/kind":          {code: "invalid_choice", params: map[string]any{"allowed": "a, b"}},
		"#/tags":          {code: "too_many", params: map[string]any{"max": float64(1)}},
		"#/email":         {code: "invalid_format"},
		"#/extra":         {code: "unexpected_field"},
		"#/items/0/label": {code: "too_long", params: map[string]any{"max": float64(3)}},
		"query limit":     {code: "below_minimum", params: map[string]any{"min": float64(1), "exclusive": "false"}},
		"query mode":      {code: "required"},
	}
	got := map[string]*problem.FieldError{}
	for _, e := range p.Errors {
		key := e.Pointer
		if e.Parameter != "" {
			key = e.In + " " + e.Parameter
		}
		got[key] = e
	}
	for key, w := range wants {
		e, ok := got[key]
		if !ok {
			t.Errorf("no error at %s; got %s", key, resp.Body)
			continue
		}
		if e.Code != w.code || e.Type != "/problems/"+string(w.code) {
			t.Errorf("%s: code %q type %q, want %q", key, e.Code, e.Type, w.code)
		}
		for k, v := range w.params {
			if e.Params[k] != v {
				t.Errorf("%s: params[%s] = %#v, want %#v", key, k, e.Params[k], v)
			}
		}
		if e.Detail == "" {
			t.Errorf("%s has no detail", key)
		}
	}
}

func TestLengthAndDuplicateRules(t *testing.T) {
	api := newAPI(t)
	resp := api.Post("/items?mode=x", map[string]any{"name": "x", "count": 11, "tags": []string{"x", "x"}})
	p := decode(t, resp.Body.String())
	codes := map[string]problem.Code{}
	for _, e := range p.Errors {
		codes[e.Pointer+"|"+string(e.Code)] = e.Code
	}
	for _, want := range []string{"#/name|too_short", "#/count|above_maximum", "#/tags|duplicate_items"} {
		if _, ok := codes[want]; !ok {
			t.Errorf("missing %s in %s", want, resp.Body)
		}
	}
}

func TestHandlerProblemPassesThrough(t *testing.T) {
	api := newAPI(t)
	resp := api.Post("/items?mode=x", map[string]any{"name": "taken", "count": 1})
	if resp.Code != http.StatusConflict {
		t.Fatalf("status = %d", resp.Code)
	}
	p := decode(t, resp.Body.String())
	if p.Type != "/problems/test/name_taken" || p.Code != "name_taken" || p.Title != "Name taken" || p.Params["name"] != "taken" {
		t.Errorf("got %+v", p)
	}
}

func TestServerErrorHidesDetail(t *testing.T) {
	api := newAPI(t)
	resp := api.Post("/items?mode=x", map[string]any{"name": "boom", "count": 1})
	if resp.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d", resp.Code)
	}
	if strings.Contains(resp.Body.String(), "10.0.0.5") {
		t.Errorf("response leaks the cause: %s", resp.Body)
	}
	p := decode(t, resp.Body.String())
	if p.Type != problem.Blank || p.Code != "" || p.Key() != problem.Internal {
		t.Errorf("got %+v", p)
	}
}

func TestServerErrorKeepsCause(t *testing.T) {
	humaproblem.Install(humaproblem.Options{})
	cause := errors.New("connection refused")
	se := humaproblem.NewError(http.StatusBadGateway, "upstream failed", cause)
	p, ok := se.(*problem.Problem)
	if !ok {
		t.Fatalf("NewError returned %T", se)
	}
	if p.Detail != "" || !errors.Is(p, cause) {
		t.Errorf("detail %q, cause kept: %v", p.Detail, errors.Is(p, cause))
	}
}

func TestMalformedBodyIsBlank(t *testing.T) {
	api := newAPI(t)
	resp := api.Post("/items?mode=x", strings.NewReader("{not json"))
	if resp.Code != http.StatusBadRequest {
		t.Fatalf("status = %d", resp.Code)
	}
	p := decode(t, resp.Body.String())
	if p.Type != problem.Blank || p.Code != "" || len(p.Errors) != 0 || p.Key() != problem.InvalidRequest {
		t.Errorf("got %+v", p)
	}
}

func TestDocumentListsCodes(t *testing.T) {
	api := newAPI(t)
	schemas := api.OpenAPI().Components.Schemas.Map()
	prob, fe := schemas["Problem"], schemas["FieldError"]
	if prob == nil || fe == nil {
		t.Fatalf("schemas: %v", keys(schemas))
	}
	if !contains(prob.Properties["code"].Enum, "validation", "name_taken") || contains(prob.Properties["code"].Enum, "too_long") {
		t.Errorf("Problem.code enum = %v", prob.Properties["code"].Enum)
	}
	if !contains(fe.Properties["code"].Enum, "too_long", "required", "name_taken") {
		t.Errorf("FieldError.code enum = %v", fe.Properties["code"].Enum)
	}
	op := api.OpenAPI().Paths["/items"].Post
	if _, ok := op.Responses["default"].Content[problem.MediaType]; !ok {
		t.Errorf("default response is not %s", problem.MediaType)
	}
}

func contains(enum []any, want ...string) bool {
	for _, w := range want {
		found := false
		for _, e := range enum {
			if e == w {
				found = true
			}
		}
		if !found {
			return false
		}
	}
	return true
}

func keys[V any](m map[string]V) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	return out
}

func TestMapTurnsDomainErrorsIntoProblems(t *testing.T) {
	api := newAPIWith(t, humaproblem.Options{Map: func(err error) *problem.Problem {
		if errors.Is(err, errNoItem) {
			return problem.Status(http.StatusNotFound, "no such item")
		}
		return nil
	}})
	resp := api.Post("/items?mode=x", map[string]any{"name": "gone", "count": 1})
	if resp.Code != http.StatusNotFound {
		t.Fatalf("status = %d: %s", resp.Code, resp.Body)
	}
	if p := decode(t, resp.Body.String()); p.Key() != problem.NotFound || p.Detail != "no such item" {
		t.Errorf("got %+v", p)
	}

	// An error Map does not recognize is still a 500 that hides its message.
	resp = api.Post("/items?mode=x", map[string]any{"name": "boom", "count": 1})
	if resp.Code != http.StatusInternalServerError || strings.Contains(resp.Body.String(), "10.0.0.5") {
		t.Errorf("status = %d: %s", resp.Code, resp.Body)
	}
}

func TestReportSeesEveryProblemWithItsCause(t *testing.T) {
	var reported []*problem.Problem
	var ctxOK bool
	api := newAPIWith(t, humaproblem.Options{},
		humaproblem.Report(func(ctx context.Context, p *problem.Problem) {
			reported = append(reported, p)
			ctxOK = ctx != nil
		}))

	api.Post("/items?mode=x", map[string]any{"name": "taken", "count": 1})
	api.Post("/items?mode=x", map[string]any{"name": "boom", "count": 1})
	api.Post("/items", map[string]any{"count": 1})

	if len(reported) != 3 || !ctxOK {
		t.Fatalf("reported %d problems, context passed: %v", len(reported), ctxOK)
	}
	if reported[0].Code != "name_taken" {
		t.Errorf("first = %+v", reported[0])
	}
	if cause := reported[1].Unwrap(); cause == nil || !strings.Contains(cause.Error(), "10.0.0.5") {
		t.Errorf("500 cause = %v", cause)
	}
	if reported[2].Code != "validation" {
		t.Errorf("third = %+v", reported[2])
	}
}

func TestDebugSendsServerErrorCause(t *testing.T) {
	api := newAPIWith(t, humaproblem.Options{Debug: true})
	resp := api.Post("/items?mode=x", map[string]any{"name": "boom", "count": 1})
	if p := decode(t, resp.Body.String()); !strings.Contains(p.Detail, "10.0.0.5") {
		t.Errorf("detail = %q", p.Detail)
	}
}
