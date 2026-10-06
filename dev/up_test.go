package dev

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

// syncBuffer is a bytes.Buffer the test can read while processes write it.
type syncBuffer struct {
	mu  sync.Mutex
	buf bytes.Buffer
}

func (b *syncBuffer) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.Write(p)
}

func (b *syncBuffer) String() string {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.buf.String()
}

func eventually(t *testing.T, what string, cond func() bool) {
	t.Helper()
	deadline := time.Now().Add(15 * time.Second)
	for !cond() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func alive(pid int) bool {
	return syscall.Kill(pid, 0) == nil
}

func write(t *testing.T, path, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatal(err)
	}
}

func TestStopKillsChildrenThatIgnoreSIGTERM(t *testing.T) {
	var out syncBuffer
	p, err := startProc([]string{"sh", "-c", `(trap "" TERM; exec sleep 300) & echo $!; wait`}, "", nil, &out)
	if err != nil {
		t.Fatal(err)
	}
	var child int
	eventually(t, "the child's pid", func() bool {
		child, err = strconv.Atoi(strings.TrimSpace(out.String()))
		return err == nil
	})

	p.stop()
	eventually(t, "the child to die", func() bool { return !alive(child) })
}

func TestLineWriterPrefixesWholeLines(t *testing.T) {
	var out bytes.Buffer
	w := &lineWriter{mu: &sync.Mutex{}, out: &out, prefix: "web │ "}
	for _, s := range []string{"one\ntw", "o\n", "three"} {
		if _, err := w.Write([]byte(s)); err != nil {
			t.Fatal(err)
		}
	}
	w.flush()
	if want := "web │ one\nweb │ two\nweb │ three\n"; out.String() != want {
		t.Errorf("output = %q, want %q", out.String(), want)
	}
}

func TestEnvironUnderTheRealEnvironment(t *testing.T) {
	path := filepath.Join(t.TempDir(), ".env")
	write(t, path, "# local\n\nDEV_TEST_A=from-file\nexport DEV_TEST_B=\"quoted value\"\nDEV_TEST_C='x=y'\n")
	t.Setenv("DEV_TEST_A", "from-env")

	env, err := environ(path)
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, kv := range env {
		k, v, _ := strings.Cut(kv, "=")
		got[k] = v
	}
	for k, want := range map[string]string{"DEV_TEST_A": "from-env", "DEV_TEST_B": "quoted value", "DEV_TEST_C": "x=y"} {
		if got[k] != want {
			t.Errorf("%s = %q, want %q", k, got[k], want)
		}
	}

	if _, err := environ(filepath.Join(t.TempDir(), "missing")); err != nil {
		t.Errorf("a missing env file should be skipped: %v", err)
	}
	write(t, path, "not an assignment\n")
	if _, err := environ(path); err == nil {
		t.Error("a malformed line was accepted")
	}
}

func TestWatcherReportsSourceChangesOnly(t *testing.T) {
	root := t.TempDir()
	for _, dir := range []string{"pkg", "web", ".git", "node_modules"} {
		if err := os.MkdirAll(filepath.Join(root, dir), 0o750); err != nil {
			t.Fatal(err)
		}
	}
	w, err := newWatcher([]string{root}, []string{"web"}, []string{".go"}, slog.New(slog.DiscardHandler))
	if err != nil {
		t.Fatal(err)
	}
	changed := make(chan struct{}, 1)
	go w.run(t.Context(), changed)

	expect := func(what string, want bool) {
		t.Helper()
		select {
		case <-changed:
			if !want {
				t.Errorf("%s triggered a rebuild", what)
			}
		case <-time.After(3 * settle):
			if want {
				t.Errorf("%s did not trigger a rebuild", what)
			}
		}
	}

	write(t, filepath.Join(root, "pkg", "notes.txt"), "x")
	expect("a .txt file", false)
	for _, dir := range []string{"web", ".git", "node_modules"} {
		write(t, filepath.Join(root, dir, "x.go"), "package x")
		expect("a .go file in "+dir, false)
	}
	write(t, filepath.Join(root, "pkg", "a.go"), "package pkg")
	expect("a .go file", true)

	// A directory created after the watch started, as a new package is.
	if err := os.Mkdir(filepath.Join(root, "pkg", "sub"), 0o750); err != nil {
		t.Fatal(err)
	}
	expect("a new directory", true)
	write(t, filepath.Join(root, "pkg", "sub", "b.go"), "package sub")
	expect("a .go file in a new directory", true)
}

func TestUpRebuildsTheServerAndRunsProcesses(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "src", "msg.go"), "one")
	write(t, filepath.Join(root, ".env"), "GREETING=hello\n")
	cfg := Config{
		Name: "app",
		Root: root,
		Server: &Server{
			// A stand-in for go build: fails when the source says so.
			Build:   []string{"sh", "-c", `! grep -q broken src/msg.go && mkdir -p bin && cp src/msg.go bin/msg`},
			Run:     []string{"sh", "-c", `echo "$GREETING $(cat bin/msg)"; echo $$ > bin/pid; exec sleep 300`},
			Watch:   []string{"src"},
			Exclude: []string{"bin"},
		},
		Processes: []Process{{Name: "web", Run: []string{"sh", "-c", `echo web up; exec sleep 300`}}},
	}

	var out syncBuffer
	logger := slog.New(slog.NewTextHandler(&out, nil))
	ctx, cancel := context.WithCancel(t.Context())
	var upErr error
	done := make(chan struct{})
	go func() {
		upErr = Up(ctx, cfg, logger, &out)
		close(done)
	}()
	t.Cleanup(func() {
		cancel()
		<-done
	})

	has := func(s string) func() bool { return func() bool { return strings.Contains(out.String(), s) } }
	eventually(t, "the server", has("server │ hello one"))
	eventually(t, "the process", has("web    │ web up"))

	write(t, filepath.Join(root, "src", "msg.go"), "two")
	eventually(t, "a rebuild", has("server │ hello two"))

	write(t, filepath.Join(root, "src", "msg.go"), "broken")
	eventually(t, "the failed build", has("build failed"))
	pid, err := os.ReadFile(filepath.Join(root, "bin", "pid"))
	if err != nil {
		t.Fatal(err)
	}
	serverPID, _ := strconv.Atoi(strings.TrimSpace(string(pid)))
	eventually(t, "the stale server to stop", func() bool { return !alive(serverPID) })

	write(t, filepath.Join(root, "src", "msg.go"), "three")
	eventually(t, "recovery", has("server │ hello three"))

	cancel()
	select {
	case <-done:
		if upErr != nil {
			t.Fatal(upErr)
		}
	case <-time.After(stopGrace):
		t.Fatal("Up did not return after cancel")
	}
	pid, err = os.ReadFile(filepath.Join(root, "bin", "pid"))
	if err != nil {
		t.Fatal(err)
	}
	serverPID, _ = strconv.Atoi(strings.TrimSpace(string(pid)))
	if alive(serverPID) {
		t.Error("the server outlived Up")
	}
}

func TestUpRunsBeforeCommandsFirst(t *testing.T) {
	root := t.TempDir()
	cfg := Config{
		Root: root,
		Before: [][]string{
			{"sh", "-c", "echo first > order"},
			{"sh", "-c", "echo second >> order; echo prepared"},
		},
		Processes: []Process{{Name: "web", Run: []string{"sh", "-c", `cat order; exec sleep 300`}}},
	}

	var out syncBuffer
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan struct{})
	go func() {
		_ = Up(ctx, cfg, slog.New(slog.DiscardHandler), &out)
		close(done)
	}()
	t.Cleanup(func() {
		cancel()
		<-done
	})

	eventually(t, "the process to see both steps", func() bool {
		return strings.Contains(out.String(), "web    │ first\nweb    │ second")
	})
	if !strings.Contains(out.String(), "before │ prepared") {
		t.Errorf("before's output is missing its prefix:\n%s", out.String())
	}
}

func TestUpStopsWhenABeforeCommandFails(t *testing.T) {
	root := t.TempDir()
	cfg := Config{
		Root:      root,
		Before:    [][]string{{"sh", "-c", "exit 3"}, {"touch", "ran"}},
		Processes: []Process{{Name: "web", Run: []string{"touch", "started"}}},
	}
	err := Up(t.Context(), cfg, slog.New(slog.DiscardHandler), io.Discard)
	if err == nil || !strings.Contains(err.Error(), "exit status 3") {
		t.Fatalf("Up error = %v, want the failed command's status", err)
	}
	for _, f := range []string{"ran", "started"} {
		if _, err := os.Stat(filepath.Join(root, f)); err == nil {
			t.Errorf("%s ran after a before command failed", f)
		}
	}
}
