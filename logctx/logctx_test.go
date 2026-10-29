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
			ctx := logctx.With(parent, "job", name)
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

func TestEnrichmentPreservesParentAndGroupBoundaries(t *testing.T) {
	var output bytes.Buffer
	base := slog.New(slog.NewJSONHandler(&output, nil)).With("service", "worker")
	parent := logctx.WithContext(t.Context(), base)
	ctx := logctx.With(parent, "request", "one")
	ctx = logctx.WithGroup(ctx, "job")
	ctx = logctx.With(ctx, slog.String("id", "child"), "ready", true)
	logctx.FromContext(ctx).InfoContext(ctx, "working", "attempt", 2)
	logctx.FromContext(parent).InfoContext(parent, "parent")

	decoder := json.NewDecoder(&output)
	var child, original map[string]any
	if err := decoder.Decode(&child); err != nil {
		t.Fatal(err)
	}
	if err := decoder.Decode(&original); err != nil {
		t.Fatal(err)
	}
	job, ok := child["job"].(map[string]any)
	if !ok || child["service"] != "worker" || child["request"] != "one" ||
		job["id"] != "child" || job["ready"] != true || job["attempt"] != float64(2) {
		t.Fatalf("child record = %v", child)
	}
	if original["service"] != "worker" || original["job"] != nil || original["request"] != nil ||
		logctx.FromContext(parent) != base {
		t.Fatalf("parent record = %v", original)
	}
}

func TestEnrichmentUsesDefaultLogger(t *testing.T) {
	var output bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&output, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })

	ctx := logctx.WithGroup(t.Context(), "job")
	ctx = logctx.With(ctx, "id", "one")
	logctx.FromContext(ctx).InfoContext(ctx, "working")
	var record struct {
		Job struct {
			ID string `json:"id"`
		} `json:"job"`
	}
	if err := json.Unmarshal(output.Bytes(), &record); err != nil {
		t.Fatal(err)
	}
	if record.Job.ID != "one" {
		t.Fatalf("record = %+v", record)
	}
}

func TestEmptyEnrichmentKeepsContext(t *testing.T) {
	ctx := t.Context()
	if logctx.With(ctx) != ctx || logctx.WithGroup(ctx, "") != ctx {
		t.Fatal("empty enrichment replaced the context")
	}
}
