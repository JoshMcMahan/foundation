package problem

import (
	"embed"
	"encoding/json"
	"strings"
)

//go:embed pagetext/*.json
var pageTextFS embed.FS

// pageText holds the problem pages' own words, by language.
var pageText = func() map[string]map[string]string {
	out := map[string]map[string]string{}
	files, _ := pageTextFS.ReadDir("pagetext")
	for _, f := range files {
		data, err := pageTextFS.ReadFile("pagetext/" + f.Name())
		if err != nil {
			panic(err)
		}
		var words map[string]string
		if err := json.Unmarshal(data, &words); err != nil {
			panic(err)
		}
		out[strings.TrimSuffix(f.Name(), ".json")] = words
	}
	return out
}()
