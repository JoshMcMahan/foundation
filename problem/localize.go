package problem

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"maps"
	"net/http"
	"slices"
	"strings"

	"golang.org/x/text/language"
	"golang.org/x/text/message"
)

// Catalog holds the messages for problem codes, by language: ICU
// MessageFormat strings keyed by code, as clients' catalogs are.
type Catalog struct {
	messages map[string]map[Code]string
}

// NewCatalog reads one JSON file per language from fsys, named for the
// language, such as en.json and ja.json, each an object of messages keyed by
// code. Every message must be valid; English is required.
func NewCatalog(fsys fs.FS) (*Catalog, error) {
	messages, err := readLanguages[map[Code]string](fsys)
	if err != nil {
		return nil, err
	}
	// Sorted so the same broken catalog always reports the same entry.
	for _, lang := range slices.Sorted(maps.Keys(messages)) {
		msgs := messages[lang]
		for _, code := range slices.Sorted(maps.Keys(msgs)) {
			if err := checkSyntax(msgs[code]); err != nil {
				return nil, fmt.Errorf("problem: %s.json %s: %w", lang, code, err)
			}
		}
	}
	if _, ok := messages["en"]; !ok {
		return nil, fmt.Errorf("problem: catalog has no en.json")
	}
	return &Catalog{messages: messages}, nil
}

// readLanguages decodes each JSON file at the root of fsys, keyed by the
// language its name gives, such as ja for ja.json.
func readLanguages[T any](fsys fs.FS) (map[string]T, error) {
	files, err := fs.Glob(fsys, "*.json")
	if err != nil {
		return nil, err
	}
	out := make(map[string]T, len(files))
	for _, file := range files {
		data, err := fs.ReadFile(fsys, file)
		if err != nil {
			return nil, err
		}
		var v T
		if err := json.Unmarshal(data, &v); err != nil {
			return nil, fmt.Errorf("problem: %s: %w", file, err)
		}
		out[strings.TrimSuffix(file, ".json")] = v
	}
	return out, nil
}

// MustCatalog is NewCatalog that panics, for catalogs embedded in the binary.
func MustCatalog(fsys fs.FS) *Catalog {
	c, err := NewCatalog(fsys)
	if err != nil {
		panic(err)
	}
	return c
}

// Languages lists the catalog's languages.
func (c *Catalog) Languages() []string {
	return slices.Sorted(maps.Keys(c.messages))
}

// Messages returns a copy of lang's messages, keyed by code.
func (c *Catalog) Messages(lang string) map[Code]string {
	return maps.Clone(c.messages[lang])
}

// Has reports whether the catalog has an English message for code.
func (c *Catalog) Has(code Code) bool {
	_, ok := c.messages["en"][code]
	return ok
}

//go:embed messages/*.json
var sharedFS embed.FS

// Shared holds the messages for the codes every API shares: the status codes,
// validation and its rules, and the client-side network and unknown.
var Shared = func() *Catalog {
	sub, err := fs.Sub(sharedFS, "messages")
	if err != nil {
		panic(err)
	}
	return MustCatalog(sub)
}()

// checkSyntax formats msg with every param standing in as 1, which reports
// syntax errors without needing real values.
func checkSyntax(msg string) error {
	f := formatter{tag: language.English, printer: message.NewPrinter(language.English), param: func(string) (any, bool) { return 1, true }}
	var b strings.Builder
	return f.message(&b, msg, 0, false, nil)
}

// Localizer writes problems in the reader's language: each one's detail, and
// each field error's, becomes the catalog's message for its code.
type Localizer struct {
	// Locale picks the reader's locale, such as "ja" or "es-MX", from the
	// request's headers. Nil means Accept-Language's first language.
	Locale func(http.Header) string
	// Catalogs hold the app's own codes; the first with a code wins. Shared
	// is always consulted after them.
	Catalogs []*Catalog
}

// Language is the language l writes for a request: the base of its locale
// when a catalog has it, else English.
func (l *Localizer) Language(h http.Header) string {
	var locale string
	if l.Locale != nil {
		locale = l.Locale(h)
	} else {
		locale, _, _ = strings.Cut(h.Get("Accept-Language"), ",")
		locale, _, _ = strings.Cut(locale, ";")
	}
	lang := strings.ToLower(strings.TrimSpace(locale))
	lang, _, _ = strings.Cut(lang, "-")
	lang, _, _ = strings.Cut(lang, "_")
	for _, c := range l.catalogs() {
		if _, ok := c.messages[lang]; ok {
			return lang
		}
	}
	return "en"
}

func (l *Localizer) catalogs() []*Catalog {
	return append(slices.Clip(l.Catalogs), Shared)
}

// Message is code's message in lang with params, falling back to English
// when lang lacks it. ok is false when no catalog has code, or the message
// can't be formatted with params.
func (l *Localizer) Message(lang string, code Code, params map[string]any) (msg string, ok bool) {
	for _, try := range []string{lang, "en"} {
		for _, c := range l.catalogs() {
			if m, has := c.messages[try][code]; has {
				out, err := format(try, m, params)
				return out, err == nil
			}
		}
	}
	return "", false
}

// Localize returns p as clients receive it (see Resolve), in lang. A problem
// of a defined type, and each field error, gets its code's message as its
// detail. An about:blank problem keeps a detail the server wrote when lang is
// English, since that is the language servers write in, and otherwise gets
// its status's message, so the reader never sees two languages. p is not
// modified.
func (l *Localizer) Localize(lang string, p *Problem) *Problem {
	resolved := p.Resolve()
	r := *resolved
	if r.Code != "" || lang != "en" || r.Detail == "" {
		if msg, ok := l.Message(lang, r.Key(), r.Params); ok {
			r.Detail = msg
		}
	}
	if len(resolved.Errors) > 0 {
		r.Errors = make([]*FieldError, len(resolved.Errors))
		for i, e := range resolved.Errors {
			fe := e.resolve()
			if msg, ok := l.Message(lang, fe.Code, fe.Params); ok {
				fe.Detail = msg
			}
			r.Errors[i] = &fe
		}
	}
	return &r
}

// Write sends p in the language r asks for, with Content-Language set.
func (l *Localizer) Write(w http.ResponseWriter, r *http.Request, p *Problem) {
	lang := l.Language(r.Header)
	w.Header().Set("Content-Language", lang)
	Write(w, l.Localize(lang, p))
}
