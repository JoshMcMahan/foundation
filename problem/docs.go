package problem

import (
	"embed"
	"fmt"
	"io/fs"
	"maps"
	"slices"
	"strings"
)

// Doc is the guidance a problem type's page shows: what it means, why it
// happens and how to fix it.
type Doc struct {
	// Title replaces the type's English title on its page.
	Title string `json:"title,omitempty"`
	// Why explains what causes the problem.
	Why string `json:"why,omitempty"`
	// Fix lists the steps that resolve it, in order.
	Fix []string `json:"fix,omitempty"`
	// Links point to further reading.
	Links []Link `json:"links,omitempty"`
}

// Link is a further-reading link on a problem type's page.
type Link struct {
	Title string `json:"title"`
	Href  string `json:"href"`
}

// Docs holds Doc entries for problem codes, by language.
type Docs struct {
	docs map[string]map[Code]Doc
}

// NewDocs reads one JSON file per language from fsys, named for the language
// (en.json, ja.json, ...), each an object of Doc entries keyed by code.
func NewDocs(fsys fs.FS) (*Docs, error) {
	docs, err := readLanguages[map[Code]Doc](fsys)
	if err != nil {
		return nil, err
	}
	// Sorted so the same broken file always reports the same entry.
	for _, lang := range slices.Sorted(maps.Keys(docs)) {
		entries := docs[lang]
		for _, code := range slices.Sorted(maps.Keys(entries)) {
			for _, l := range entries[code].Links {
				if l.Title == "" || (!strings.HasPrefix(l.Href, "https://") && !strings.HasPrefix(l.Href, "/")) {
					return nil, fmt.Errorf("problem: %s.json %s: links need a title and an https:// or / href", lang, code)
				}
			}
		}
	}
	return &Docs{docs: docs}, nil
}

// MustDocs is NewDocs that panics, for docs embedded in the binary.
func MustDocs(fsys fs.FS) *Docs {
	d, err := NewDocs(fsys)
	if err != nil {
		panic(err)
	}
	return d
}

//go:embed docs/*.json
var sharedDocsFS embed.FS

// SharedDocs holds the guidance for the shared codes' pages.
var SharedDocs = func() *Docs {
	sub, err := fs.Sub(sharedDocsFS, "docs")
	if err != nil {
		panic(err)
	}
	return MustDocs(sub)
}()

// doc merges code's entries from docs in lang, field by field, falling back
// to English for anything lang lacks. The first of docs to have a field wins.
func doc(docs []*Docs, lang string, code Code) Doc {
	var out Doc
	for _, try := range []string{lang, "en"} {
		for _, d := range docs {
			e, ok := d.docs[try][code]
			if !ok {
				continue
			}
			if out.Title == "" {
				out.Title = e.Title
			}
			if out.Why == "" {
				out.Why = e.Why
			}
			if len(out.Fix) == 0 {
				out.Fix = e.Fix
			}
			if len(out.Links) == 0 {
				out.Links = e.Links
			}
		}
	}
	return out
}
