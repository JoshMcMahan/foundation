package problem

import (
	"embed"
	"io/fs"
)

//go:embed pagetext/*.json
var pageTextFS embed.FS

// pageText holds the problem pages' own words, by language.
var pageText = func() map[string]map[string]string {
	sub, err := fs.Sub(pageTextFS, "pagetext")
	if err != nil {
		panic(err)
	}
	words, err := readLanguages[map[string]string](sub)
	if err != nil {
		panic(err)
	}
	return words
}()
