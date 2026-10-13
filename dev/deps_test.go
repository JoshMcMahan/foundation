package dev

import (
	"context"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestServicesWaitForWhatTheyDependOn(t *testing.T) {
	probeStarting = 20 * time.Millisecond
	t.Cleanup(func() { probeStarting = time.Second })
	var ready atomic.Bool
	health := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if !ready.Load() {
			w.WriteHeader(http.StatusServiceUnavailable)
		}
	}))
	defer health.Close()

	root := t.TempDir()
	cfg := Config{Root: root, Services: []Service{
		{Name: "db", Run: []string{"sleep", "300"}, Health: health.URL, Manual: true},
		{Name: "web", Run: []string{"sh", "-c", "touch started; exec sleep 300"}, DependsOn: []string{"db"}, Manual: true},
	}}
	s, err := newSupervisor(t.Context(), cfg, slog.New(slog.DiscardHandler), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	// Naming web alone brings db, which it depends on.
	go func() { done <- s.run(ctx, "web") }()
	t.Cleanup(func() { cancel(); <-done })

	eventually(t, "web to wait for db", func() bool { return stateOf(s.statuses(), "web") == stateWaiting })
	time.Sleep(300 * time.Millisecond)
	if _, err := os.Stat(filepath.Join(root, "started")); err == nil {
		t.Fatal("web started before db was ready")
	}
	ready.Store(true)
	eventually(t, "web to run once db is ready", func() bool { return stateOf(s.statuses(), "web") == stateRunning })
}

func TestRestartOnFailure(t *testing.T) {
	root := t.TempDir()
	crash := []string{"sh", "-c", "echo run >> runs; exit 1"}
	cfg := Config{Root: root, Services: []Service{{Name: "flaky", Run: crash, Restart: "on-failure"}}}
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan struct{})
	go func() { _ = Up(ctx, cfg, slog.New(slog.DiscardHandler), io.Discard); close(done) }()
	t.Cleanup(func() { cancel(); <-done })
	eventually(t, "a second run", func() bool {
		b, _ := os.ReadFile(filepath.Join(root, "runs"))
		return strings.Count(string(b), "run") >= 2
	})

	// A second config, not a reassigned one: the first dev still reads its own.
	once := t.TempDir()
	without := Config{Root: once, Services: []Service{{Name: "flaky", Run: crash}}}
	ctx2, cancel2 := context.WithCancel(t.Context())
	done2 := make(chan struct{})
	go func() { _ = Up(ctx2, without, slog.New(slog.DiscardHandler), io.Discard); close(done2) }()
	time.Sleep(2500 * time.Millisecond)
	cancel2()
	<-done2
	if b, _ := os.ReadFile(filepath.Join(once, "runs")); strings.Count(string(b), "run") != 1 {
		t.Errorf("without restart, runs = %q, want one", b)
	}
}

func TestRebuildOnCheckout(t *testing.T) {
	if _, err := exec.LookPath("git"); err != nil {
		t.Skip("no git")
	}
	root := t.TempDir()
	git := func(args ...string) {
		t.Helper()
		cmd := exec.CommandContext(t.Context(), "git", append([]string{"-C", root, "-c", "user.name=t", "-c", "user.email=t@t", "-c", "commit.gpgsign=false"}, args...)...)
		if out, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("git %v: %v\n%s", args, err, out)
		}
	}
	git("init", "-q", "-b", "main")
	write(t, filepath.Join(root, "main.go"), "package main")
	git("add", ".")
	git("commit", "-qm", "start")

	cfg := Config{Root: root, Services: []Service{{
		Name:              "server",
		Build:             []string{"sh", "-c", "echo built >> builds"},
		Run:               []string{"sleep", "300"},
		RebuildOnCheckout: true,
	}}}
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan struct{})
	go func() { _ = Up(ctx, cfg, slog.New(slog.DiscardHandler), io.Discard); close(done) }()
	t.Cleanup(func() { cancel(); <-done })
	builds := func() int {
		b, _ := os.ReadFile(filepath.Join(root, "builds"))
		return strings.Count(string(b), "built")
	}
	eventually(t, "the first build", func() bool { return builds() == 1 })
	git("checkout", "-q", "-b", "feature")
	eventually(t, "a rebuild after the branch changed", func() bool { return builds() >= 2 })
}

func TestPlaceholdersAndDependencyChecks(t *testing.T) {
	cfg, err := Config{Root: "/work/My Repo", Dir: "/work/My Repo/.devstack", Env: map[string]string{
		"DATA": "{dir}/mongo", "SRC": "{root}", "QUEUE": "jobs-{instance}",
	}}.withDefaults()
	if err != nil {
		t.Fatal(err)
	}
	vars, err := cfg.vars(nil)
	if err != nil {
		t.Fatal(err)
	}
	if vars["DATA"] != "/work/My Repo/.devstack/mongo" || vars["SRC"] != "/work/My Repo" {
		t.Errorf("vars = %v", vars)
	}
	if !regexp.MustCompile(`^jobs-my-repo-[0-9a-f]{4}$`).MatchString(vars["QUEUE"]) {
		t.Errorf("QUEUE = %q, want jobs-<checkout>-<hash>", vars["QUEUE"])
	}
	other, _ := Config{Root: "/elsewhere/My Repo"}.withDefaults()
	if other.instance() == cfg.instance() {
		t.Error("two checkouts with one name share an instance")
	}

	for name, svcs := range map[string][]Service{
		"unknown dependency": {{Name: "web", Run: []string{"a"}, DependsOn: []string{"db"}}},
		"cycle":              {{Name: "a", Run: []string{"a"}, DependsOn: []string{"b"}}, {Name: "b", Run: []string{"b"}, DependsOn: []string{"a"}}},
		"bad restart":        {{Name: "a", Run: []string{"a"}, Restart: "always"}},
		"server run once":    {{Name: "a", Run: []string{"a"}, Build: []string{"b"}, Once: true}},
		"once with health":   {{Name: "a", Run: []string{"a"}, Health: "http://localhost:1/", Once: true}},
	} {
		if _, err := (Config{Services: svcs}).withDefaults(); err == nil {
			t.Errorf("%s accepted", name)
		}
	}
}

func TestServicesWaitForOneThatRunsOnceToFinish(t *testing.T) {
	root := t.TempDir()
	cfg := Config{Root: root, Services: []Service{
		{Name: "db", Run: []string{"sleep", "300"}, Manual: true},
		// Fails until the file it waits for appears, as a seed waits for its database.
		{Name: "seed", Run: []string{"sh", "-c", "test -f ready && sleep 0.3"}, DependsOn: []string{"db"}, Once: true, Restart: "on-failure", Manual: true},
		{Name: "web", Run: []string{"sh", "-c", "touch started; exec sleep 300"}, DependsOn: []string{"seed"}, Manual: true},
	}}
	s, err := newSupervisor(t.Context(), cfg, slog.New(slog.DiscardHandler), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- s.run(ctx, "web") }()
	t.Cleanup(func() { cancel(); <-done })

	eventually(t, "seed to fail and retry", func() bool { return stateOf(s.statuses(), "seed") == stateExited })
	if stateOf(s.statuses(), "web") != stateWaiting {
		t.Fatalf("web = %s while seed fails, want waiting", stateOf(s.statuses(), "web"))
	}
	if err := os.WriteFile(filepath.Join(root, "ready"), nil, 0o600); err != nil {
		t.Fatal(err)
	}
	eventually(t, "seed to run", func() bool { return stateOf(s.statuses(), "seed") == stateStarting })
	if _, err := os.Stat(filepath.Join(root, "started")); err == nil {
		t.Fatal("web started while seed was still running")
	}
	eventually(t, "seed to finish", func() bool { return stateOf(s.statuses(), "seed") == stateFinished })
	eventually(t, "web to run once seed finished", func() bool { return stateOf(s.statuses(), "web") == stateRunning })
}
