package problemtest_test

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

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

// recorder captures what CheckCatalog reports.
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
		!strings.Contains(r.errs[1], "no apiErrors.quota") {
		t.Errorf("CheckCatalog reported %q", r.errs)
	}
}
