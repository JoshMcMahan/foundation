// Package problemtest checks that a client's message catalog covers an
// application's problem types.
package problemtest

import (
	"encoding/json"
	"fmt"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"

	"github.com/parallelworks/foundation/problem"
)

// CheckCatalog fails tb unless the JSON catalog at path has a message for
// every type in registries, using only the type's Params as ICU arguments. It
// reads apiErrors as useCodeMessage in @parallelworks/problem/react does: a
// type's message is at apiErrors.<name>.<code>, under its registry's name,
// when the catalog has one there, and otherwise at apiErrors.<code>. So an
// application's own codes can stay at the top level while another registry's
// go under its name. Messages nest one level, as a type URI names one
// application; a deeper object, or a value that is no message, fails to
// parse. The shared codes' messages ship with @parallelworks/problem, so the
// catalog needs only the applications' own.
func CheckCatalog(tb testing.TB, path string, registries ...*problem.Registry) {
	tb.Helper()
	raw, err := os.ReadFile(filepath.Clean(path))
	if err != nil {
		tb.Fatalf("read catalog: %v", err)
		return
	}
	var catalog struct {
		APIErrors map[string]any `json:"apiErrors"`
	}
	if err := json.Unmarshal(raw, &catalog); err != nil {
		tb.Fatalf("parse %s: %v", path, err)
		return
	}
	messages, err := flatten(catalog.APIErrors)
	if err != nil {
		tb.Fatalf("parse %s: %v", path, err)
		return
	}
	check(tb, path, messages, registries, clientKeys)
}

// CheckMessages is CheckCatalog for an apiErrors map the caller has already
// loaded, such as a catalog split into one file per namespace. Its keys are
// those CheckCatalog reads, with a message under an application's name at
// <name>.<code>, so a split catalog can pass an application's messages either
// flattened under its name or at the top level.
func CheckMessages(tb testing.TB, messages map[string]string, registries ...*problem.Registry) {
	tb.Helper()
	check(tb, "catalog", messages, registries, clientKeys)
}

// CheckGoCatalog fails tb unless c, a catalog a server localizes problems
// with, has an English message for every type in registries, and every
// language's message for a type uses only the type's Params.
func CheckGoCatalog(tb testing.TB, c *problem.Catalog, registries ...*problem.Registry) {
	tb.Helper()
	for _, lang := range c.Languages() {
		msgs := map[string]string{}
		for code, msg := range c.Messages(lang) {
			msgs[string(code)] = msg
		}
		if lang == "en" {
			check(tb, "en catalog", msgs, registries, goKeys)
			continue
		}
		for _, r := range registries {
			for _, typ := range r.Types() {
				if msg, ok := msgs[string(typ.Code)]; ok {
					if err := CheckArgs(msg, typ.Params); err != nil {
						tb.Errorf("%s catalog %s: %v", lang, typ.Code, err)
					}
				}
			}
		}
	}
}

// flatten reads a catalog's apiErrors as use-intl does, into dotted keys: a
// message stays at its code, and one under an application's name, such as
// {"workflow": {"unknown_input": "..."}}, is at "workflow.unknown_input".
func flatten(apiErrors map[string]any) (map[string]string, error) {
	messages := make(map[string]string, len(apiErrors))
	// Sorted, so a catalog with several bad values always reports the same one.
	for _, key := range slices.Sorted(maps.Keys(apiErrors)) {
		switch v := apiErrors[key].(type) {
		case string:
			messages[key] = v
		case map[string]any:
			for _, code := range slices.Sorted(maps.Keys(v)) {
				msg, ok := v[code].(string)
				if !ok {
					return nil, fmt.Errorf("apiErrors.%s.%s is not a message: messages nest one level, under an application's name", key, code)
				}
				messages[key+"."+code] = msg
			}
		default:
			return nil, fmt.Errorf("apiErrors.%s is neither a message nor an application's messages", key)
		}
	}
	return messages, nil
}

// clientKeys are the keys a client catalog may keep a type's message at, in
// the order useCodeMessage reads them: under its registry's name, then at the
// top level.
func clientKeys(r *problem.Registry, code problem.Code) []string {
	return []string{r.Name() + "." + string(code), string(code)}
}

// goKeys is the key a Go catalog, which holds one registry's messages, keeps a
// type's message at.
func goKeys(_ *problem.Registry, code problem.Code) []string {
	return []string{string(code)}
}

// check reports each type in registries that messages has no message for at
// any of its keys, or whose message, at the first key messages has, uses an
// argument the type doesn't declare.
func check(tb testing.TB, where string, messages map[string]string, registries []*problem.Registry, keys func(*problem.Registry, problem.Code) []string) {
	tb.Helper()
	for _, r := range registries {
		for _, typ := range r.Types() {
			tried := keys(r, typ.Code)
			i := slices.IndexFunc(tried, func(key string) bool {
				_, ok := messages[key]
				return ok
			})
			switch {
			case i < 0:
				tb.Errorf("%s has no apiErrors.%s message", where, strings.Join(tried, " or apiErrors."))
			case messages[tried[i]] == "":
				tb.Errorf("%s has no apiErrors.%s message", where, tried[i])
			default:
				if err := CheckArgs(messages[tried[i]], typ.Params); err != nil {
					tb.Errorf("%s apiErrors.%s: %v", where, tried[i], err)
				}
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
