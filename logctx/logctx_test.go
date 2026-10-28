package logctx_test

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"testing"

	"github.com/parallelworks/foundation/logctx"
)

func TestFallback(t *testing.T) {
	for _, ctx := range []context.Context{t.Context(), logctx.WithContext(t.Context(), nil)} {
		if got := logctx.FromContext(ctx); got != slog.Default() {
			t.Fatalf("logger = %p, want default %p", got, slog.Default())
		}
	}
}

func TestLoggerSurvivesCancellation(t *testing.T) {
	var output bytes.Buffer
	logger := slog.New(slog.NewJSONHandler(&output, nil)).With("request", "one")
	ctx, cancel := context.WithCancel(logctx.WithContext(t.Context(), logger))
	cancel()
	logctx.FromContext(ctx).ErrorContext(ctx, "finished")
	var record map[string]any
	if err := json.Unmarshal(output.Bytes(), &record); err != nil {
		t.Fatal(err)
	}
	if record["request"] != "one" || record["msg"] != "finished" {
		t.Fatalf("record = %v", record)
	}
}

func TestChildLoggersAreIsolated(t *testing.T) {
	var output bytes.Buffer
	base := slog.New(slog.NewJSONHandler(&output, nil))
	parent := logctx.WithContext(t.Context(), base)
	var workers sync.WaitGroup
	for _, name := range []string{"one", "two"} {
		workers.Go(func() {
			ctx := logctx.WithContext(parent, logctx.FromContext(parent).With("job", name))
			logctx.FromContext(ctx).InfoContext(ctx, "working")
		})
	}
	workers.Wait()
	seen := map[string]bool{}
	decoder := json.NewDecoder(&output)
	for range 2 {
		var record struct {
			Job string `json:"job"`
		}
		if err := decoder.Decode(&record); err != nil {
			t.Fatal(err)
		}
		seen[record.Job] = true
	}
	if !seen["one"] || !seen["two"] || logctx.FromContext(parent) != base {
		t.Fatalf("child jobs = %v, parent logger = %p", seen, logctx.FromContext(parent))
	}
}
