package problemrules_test

import (
	"testing"

	"github.com/quasilyte/go-ruleguard/analyzer"
	"golang.org/x/tools/go/analysis/analysistest"
)

func TestRules(t *testing.T) {
	if err := analyzer.Analyzer.Flags.Set("rules", "problemrules.go"); err != nil {
		t.Fatal(err)
	}
	analysistest.Run(t, analysistest.TestData(), analyzer.Analyzer, "example")
}
