// Package problemtest checks that a client's message catalog covers an
// application's problem types.
package problemtest

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/parallelworks/foundation/problem"
)

// CheckCatalog fails t unless the JSON catalog at path has a message at
// apiErrors.<code> for every type in registries, using only the type's Params
// as ICU arguments. The shared codes' messages ship with @parallelworks/problem,
// so the catalog needs only the application's own.
func CheckCatalog(tb testing.TB, path string, registries ...*problem.Registry) {
	tb.Helper()
	raw, err := os.ReadFile(filepath.Clean(path))
	if err != nil {
		tb.Fatalf("read catalog: %v", err)
	}
	var catalog struct {
		APIErrors map[string]string `json:"apiErrors"`
	}
	if err := json.Unmarshal(raw, &catalog); err != nil {
		tb.Fatalf("parse %s: %v", path, err)
	}
	check(tb, path, catalog.APIErrors, registries)
}

// CheckMessages is CheckCatalog for an apiErrors map the caller has already
// loaded, such as a catalog split into one file per namespace.
func CheckMessages(tb testing.TB, messages map[string]string, registries ...*problem.Registry) {
	tb.Helper()
	check(tb, "catalog", messages, registries)
}

func check(tb testing.TB, where string, messages map[string]string, registries []*problem.Registry) {
	tb.Helper()
	for _, r := range registries {
		for _, typ := range r.Types() {
			msg, ok := messages[string(typ.Code)]
			if !ok || msg == "" {
				tb.Errorf("%s has no apiErrors.%s message", where, typ.Code)
				continue
			}
			if err := CheckArgs(msg, typ.Params); err != nil {
				tb.Errorf("%s apiErrors.%s: %v", where, typ.Code, err)
			}
		}
	}
}

// CheckArgs returns an error if the ICU message msg does not parse or uses an
// argument not in params.
func CheckArgs(msg string, params []string) error {
	args, err := MessageArgs(msg)
	if err != nil {
		return err
	}
	for _, a := range args {
		if !slices.Contains(params, a) {
			return fmt.Errorf("uses {%s}, which is not one of its params %v", a, params)
		}
	}
	return nil
}

// MessageArgs returns the names of the arguments an ICU message format
// string uses, including those inside plural and select branches.
func MessageArgs(msg string) ([]string, error) {
	p := &icu{s: msg}
	if err := p.message(0); err != nil {
		return nil, err
	}
	if p.i < len(p.s) {
		return nil, fmt.Errorf("unmatched } at %d in %q", p.i, msg)
	}
	return p.args, nil
}

type icu struct {
	s    string
	i    int
	args []string
}

// message reads text up to an unmatched } or the end of the string.
func (p *icu) message(depth int) error {
	for p.i < len(p.s) {
		switch p.s[p.i] {
		case '\'':
			// As in ICU, an apostrophe quotes only before a special character
			// ('{literal}'); '' is one apostrophe, and any other is literal.
			var next byte
			if p.i+1 < len(p.s) {
				next = p.s[p.i+1]
			}
			switch {
			case next != 0 && strings.ContainsRune("{}#|", rune(next)):
				end := strings.IndexByte(p.s[p.i+1:], '\'')
				if end < 0 {
					return nil
				}
				p.i += end + 2
			case next == '\'':
				p.i += 2
			default:
				p.i++
			}
		case '{':
			p.i++
			if err := p.argument(depth); err != nil {
				return err
			}
		case '}':
			if depth == 0 {
				return fmt.Errorf("unmatched } at %d in %q", p.i, p.s)
			}
			return nil
		default:
			p.i++
		}
	}
	if depth > 0 {
		return fmt.Errorf("unclosed { in %q", p.s)
	}
	return nil
}

// argument reads {name}, {name, type} or {name, type, options} after the {.
func (p *icu) argument(depth int) error {
	name := strings.TrimSpace(p.until(",}"))
	if name == "" {
		return fmt.Errorf("empty argument in %q", p.s)
	}
	if !slices.Contains(p.args, name) {
		p.args = append(p.args, name)
	}
	unclosed := fmt.Errorf("unclosed {%s} in %q", name, p.s)
	switch p.next() {
	case '}':
		return nil
	case 0:
		return unclosed
	}
	kind := strings.TrimSpace(p.until(",}"))
	switch p.next() {
	case '}':
		return nil
	case 0:
		return unclosed
	}
	if kind != "plural" && kind != "select" && kind != "selectordinal" {
		// A style such as {n, number, percent}: skip to the closing brace.
		p.until("}")
		if p.next() == 0 {
			return unclosed
		}
		return nil
	}
	for {
		p.skipSpace()
		if p.i >= len(p.s) {
			return unclosed
		}
		if p.s[p.i] == '}' {
			p.i++
			return nil
		}
		p.until("{")
		if p.next() != '{' {
			return fmt.Errorf("option without a message in {%s} in %q", name, p.s)
		}
		if err := p.message(depth + 1); err != nil {
			return err
		}
		if p.next() != '}' {
			return fmt.Errorf("unclosed option in {%s} in %q", name, p.s)
		}
	}
}

func (p *icu) until(stop string) string {
	start := p.i
	for p.i < len(p.s) && !strings.ContainsRune(stop, rune(p.s[p.i])) {
		p.i++
	}
	return p.s[start:p.i]
}

func (p *icu) next() byte {
	if p.i >= len(p.s) {
		return 0
	}
	c := p.s[p.i]
	p.i++
	return c
}

func (p *icu) skipSpace() {
	for p.i < len(p.s) && strings.ContainsRune(" \t\n", rune(p.s[p.i])) {
		p.i++
	}
}
