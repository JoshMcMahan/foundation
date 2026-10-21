package problemtest_test

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/parallelworks/foundation/problem"
	"github.com/parallelworks/foundation/problem/problemtest"
)

func TestMessageArgs(t *testing.T) {
	tests := []struct {
		msg  string
		want []string
	}{
		{"No arguments.", nil},
		{"Hello {name}.", []string{"name"}},
		{"{count, plural, one {# item} other {# items}}", []string{"count"}},
		{"Must be {exclusive, select, true {greater than} other {at least}} {min, number}.", []string{"exclusive", "min"}},
		{"{exclusive, select, true {{min, number}より大きい} other {{min}以上}}", []string{"exclusive", "min"}},
		{"Quoted '{literal}' and {real}", []string{"real"}},
		{"You don't have {thing}.", []string{"thing"}},
	}
	for _, tt := range tests {
		got, err := problemtest.MessageArgs(tt.msg)
		if err != nil {
			t.Errorf("MessageArgs(%q): %v", tt.msg, err)
			continue
		}
		if !slices.Equal(got, tt.want) {
			t.Errorf("MessageArgs(%q) = %v, want %v", tt.msg, got, tt.want)
		}
	}
	for _, bad := range []string{"{unclosed", "stray }", "{}", "{n, plural, one}"} {
		if _, err := problemtest.MessageArgs(bad); err == nil {
			t.Errorf("MessageArgs(%q) did not fail", bad)
		}
	}
}

// recorder captures what CheckCatalog and CheckMessages report.
type recorder struct {
	testing.TB
	errs []string
}

func (r *recorder) Helper() {}

func (r *recorder) Errorf(format string, args ...any) {
	r.errs = append(r.errs, fmt.Sprintf(format, args...))
}

func (r *recorder) Fatalf(format string, args ...any) {
	r.errs = append(r.errs, fmt.Sprintf(format, args...))
}

func TestCheckCatalog(t *testing.T) {
	reg := problem.NewRegistry("app")
	reg.Define(problem.Type{Code: "slug_taken", Status: http.StatusConflict, Title: "Slug taken", Params: []string{"slug"}})
	reg.Define(problem.Type{Code: "last_admin", Status: http.StatusConflict, Title: "Last admin"})
	reg.Define(problem.Type{Code: "quota", Status: http.StatusForbidden, Title: "Quota"})

	path := filepath.Join(t.TempDir(), "en.json")
	catalog := `{"apiErrors": {
		"slug_taken": "{slug} is taken.",
		"last_admin": "Keep one admin, {name}."
	}}`
	if err := os.WriteFile(path, []byte(catalog), 0o600); err != nil {
		t.Fatal(err)
	}

	r := &recorder{TB: t}
	problemtest.CheckCatalog(r, path, reg)
	if len(r.errs) != 2 ||
		!strings.Contains(r.errs[0], "apiErrors.last_admin") || !strings.Contains(r.errs[0], "{name}") ||
		!strings.Contains(r.errs[1], "no apiErrors.app.quota or apiErrors.quota message") {
		t.Errorf("CheckCatalog reported %q", r.errs)
	}
}

// TestCheckCatalogNested checks a catalog that keeps another registry's
// messages under its name, as useCodeMessage reads them.
func TestCheckCatalogNested(t *testing.T) {
	engine := problem.NewRegistry("workflow")
	engine.Define(problem.Type{Code: "unknown_input", Status: http.StatusUnprocessableEntity, Title: "Unknown input", Params: []string{"input"}})

	tests := []struct {
		name    string
		catalog string
		want    []string // parts of the one error it reports; none when it passes
	}{
		{
			name:    "nested",
			catalog: `{"apiErrors": {"workflow": {"unknown_input": "No input {input}."}}}`,
		},
		{
			// The top-level message takes the app's own params, which would fail if it were checked.
			name: "nested over top level",
			catalog: `{"apiErrors": {"unknown_input": "No field {field}.",
				"workflow": {"unknown_input": "No input {input}."}}}`,
		},
		{
			name:    "top level only",
			catalog: `{"apiErrors": {"unknown_input": "No input {input}."}}`,
		},
		{
			name:    "missing",
			catalog: `{"apiErrors": {"workflow": {}}}`,
			want:    []string{"no apiErrors.workflow.unknown_input or apiErrors.unknown_input message"},
		},
		{
			name: "bad param in a nested message",
			catalog: `{"apiErrors": {"unknown_input": "No input {input}.",
				"workflow": {"unknown_input": "No field {field}."}}}`,
			want: []string{"apiErrors.workflow.unknown_input: uses {field}"},
		},
		{
			name:    "two levels",
			catalog: `{"apiErrors": {"workflow": {"inputs": {"unknown_input": "No input {input}."}}}}`,
			want:    []string{"parse", "apiErrors.workflow.inputs is not a message"},
		},
		{
			name:    "not a message",
			catalog: `{"apiErrors": {"unknown_input": 3}}`,
			want:    []string{"parse", "apiErrors.unknown_input is neither a message"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			path := filepath.Join(t.TempDir(), "en.json")
			if err := os.WriteFile(path, []byte(tt.catalog), 0o600); err != nil {
				t.Fatal(err)
			}
			r := &recorder{TB: t}
			problemtest.CheckCatalog(r, path, engine)
			if len(r.errs) != min(len(tt.want), 1) {
				t.Fatalf("CheckCatalog reported %q, want %q", r.errs, tt.want)
			}
			for _, part := range tt.want {
				if !strings.Contains(r.errs[0], part) {
					t.Errorf("CheckCatalog reported %q, want %q", r.errs, tt.want)
				}
			}
		})
	}
}

func TestCheckMessages(t *testing.T) {
	reg := problem.NewRegistry("app")
	reg.Define(problem.Type{Code: "slug_taken", Status: http.StatusConflict, Title: "Slug taken", Params: []string{"slug"}})
	reg.Define(problem.Type{Code: "quota", Status: http.StatusForbidden, Title: "Quota"})

	r := &recorder{TB: t}
	problemtest.CheckMessages(r, map[string]string{"slug_taken": "{slug} is taken."}, reg)
	if len(r.errs) != 1 || !strings.Contains(r.errs[0], "no apiErrors.app.quota or apiErrors.quota message") {
		t.Errorf("CheckMessages reported %q", r.errs)
	}

	// Another registry's messages, flattened under its name.
	engine := problem.NewRegistry("workflow")
	engine.Define(problem.Type{Code: "unknown_input", Status: http.StatusUnprocessableEntity, Title: "Unknown input", Params: []string{"input"}})
	r = &recorder{TB: t}
	problemtest.CheckMessages(r, map[string]string{
		"unknown_input":          "No field {field}.",
		"workflow.unknown_input": "No input {input}.",
	}, engine)
	if len(r.errs) != 0 {
		t.Errorf("CheckMessages reported %q", r.errs)
	}
}

func TestCheckGoCatalog(t *testing.T) {
	r := problem.NewRegistry("gocat")
	r.Define(problem.Type{Code: "name_taken", Status: 409, Title: "Name taken", Doc: "x", Params: []string{"name"}})
	good := problem.MustCatalog(fstest.MapFS{
		"en.json": {Data: []byte(`{"name_taken": "{name} is taken."}`)},
		"ja.json": {Data: []byte(`{"name_taken": "{name}は使われています。"}`)},
	})
	problemtest.CheckGoCatalog(t, good, r)

	for name, fsys := range map[string]fstest.MapFS{
		"missing en": {"en.json": {Data: []byte(`{}`)}},
		"stray arg":  {"en.json": {Data: []byte(`{"name_taken": "x"}`)}, "ja.json": {Data: []byte(`{"name_taken": "{who}"}`)}},
	} {
		rec := &recorder{TB: t}
		problemtest.CheckGoCatalog(rec, problem.MustCatalog(fsys), r)
		if len(rec.errs) == 0 {
			t.Errorf("%s: no failure", name)
		}
	}
}

func TestCheckGoCatalogComplete(t *testing.T) {
	r := problem.NewRegistry("gocomplete")
	r.Define(problem.Type{Code: "name_taken", Status: 409, Title: "Name taken", Doc: "x", Params: []string{"name"}})
	partial := problem.MustCatalog(fstest.MapFS{
		"en.json": {Data: []byte(`{"name_taken": "{name} is taken."}`)},
		"ja.json": {Data: []byte(`{}`)},
	})
	// English alone is enough for CheckGoCatalog: ja readers get English.
	problemtest.CheckGoCatalog(t, partial, r)

	rec := &recorder{TB: t}
	problemtest.CheckGoCatalogComplete(rec, partial, r)
	if len(rec.errs) != 1 || !strings.Contains(rec.errs[0], "ja catalog has no apiErrors.name_taken message") {
		t.Errorf("CheckGoCatalogComplete reported %q", rec.errs)
	}

	complete := problem.MustCatalog(fstest.MapFS{
		"en.json": {Data: []byte(`{"name_taken": "{name} is taken."}`)},
		"ja.json": {Data: []byte(`{"name_taken": "{name}は使われています。"}`)},
	})
	problemtest.CheckGoCatalogComplete(t, complete, r)

	rec = &recorder{TB: t}
	problemtest.CheckGoCatalogComplete(rec, problem.MustCatalog(fstest.MapFS{
		"en.json": {Data: []byte(`{"name_taken": "{name} is taken."}`)},
		"ja.json": {Data: []byte(`{"name_taken": "{who}"}`)},
	}), r)
	if len(rec.errs) != 1 || !strings.Contains(rec.errs[0], "{who}") {
		t.Errorf("CheckGoCatalogComplete reported %q", rec.errs)
	}
}
