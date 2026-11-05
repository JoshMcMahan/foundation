package dev

import (
	"bytes"
	"context"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
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

func TestEnvironLayers(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, ".env"), "# local\n\nDEV_TEST_FILE=from-file\nexport DEV_TEST_QUOTED=\"quoted value\"\nDEV_TEST_REAL=from-file\n")
	write(t, filepath.Join(root, "api", ".env"), "DEV_TEST_SVC_FILE='x=y'\nDEV_TEST_FILE=from-service-file\n")
	t.Setenv("DEV_TEST_REAL", "from-env")
	cfg, err := Config{
		Name:     "app",
		Root:     root,
		Postgres: &Postgres{Port: 5433},
		S3:       &S3{},
		Env: map[string]string{
			"DEV_TEST_DB":   "{postgres}",
			"DEV_TEST_BOTH": "{postgres_test} {s3}",
			"DEV_TEST_SVC":  "from-config",
			"DEV_TEST_FILE": "from-config",
		},
		Services: []Service{{Name: "api", Dir: "api", Run: []string{"api"}, EnvFile: ".env", Env: map[string]string{"DEV_TEST_SVC": "from-service"}}},
	}.withDefaults()
	if err != nil {
		t.Fatal(err)
	}

	env, err := cfg.environ(&cfg.Services[0])
	if err != nil {
		t.Fatal(err)
	}
	got := map[string]string{}
	for _, kv := range env {
		k, v, _ := strings.Cut(kv, "=")
		got[k] = v
	}
	for k, want := range map[string]string{
		"DEV_TEST_DB":       "postgres://app:app@localhost:5433/app?sslmode=disable",
		"DEV_TEST_BOTH":     "postgres://app:app@localhost:5433/app_test?sslmode=disable http://127.0.0.1:8333",
		"DEV_TEST_SVC":      "from-service",
		"DEV_TEST_FILE":     "from-service-file",
		"DEV_TEST_QUOTED":   "quoted value",
		"DEV_TEST_SVC_FILE": "x=y",
		"DEV_TEST_REAL":     "from-env",
	} {
		if got[k] != want {
			t.Errorf("%s = %q, want %q", k, got[k], want)
		}
	}

	before, err := cfg.environ(nil)
	if err != nil {
		t.Fatal(err)
	}
	if slices.Contains(before, "DEV_TEST_SVC=from-service") {
		t.Error("a before command got a service's env")
	}
}

func TestEnvironRejectsWhatIsNotThere(t *testing.T) {
	root := t.TempDir()
	cfg := Config{Root: root, Env: map[string]string{"DATABASE_URL": "{postgres}"}}
	if _, err := cfg.environ(nil); err == nil || !strings.Contains(err.Error(), "{postgres} needs postgres") {
		t.Errorf("{postgres} without Postgres: %v", err)
	}
	cfg.Env = nil
	cfg.EnvFile = filepath.Join(root, "missing")
	if _, err := cfg.environ(nil); err != nil {
		t.Errorf("a missing env file should be skipped: %v", err)
	}
	write(t, cfg.EnvFile, "not an assignment\n")
	if _, err := cfg.environ(nil); err == nil {
		t.Error("a malformed line was accepted")
	}
}

func TestEnvironReadsSecretsInto(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, ".env"), "DEV_TEST_PASS=s3cret\n")
	t.Setenv("DEV_TEST_USER", "me")
	cfg, err := Config{
		Root:  root,
		Ports: map[string]int{"db": 27017},
		Env: map[string]string{
			"DEV_TEST_URL":  "mongodb://${DEV_TEST_USER}:${DEV_TEST_PASS}@localhost:{port.db}/",
			"DEV_TEST_KEPT": "costs $5 or {not-a-ref}",
		},
	}.withDefaults()
	if err != nil {
		t.Fatal(err)
	}
	vars, err := cfg.vars(nil)
	if err != nil {
		t.Fatal(err)
	}
	if got, want := vars["DEV_TEST_URL"], "mongodb://me:s3cret@localhost:27017/"; got != want {
		t.Errorf("DEV_TEST_URL = %q, want %q", got, want)
	}
	if got, want := vars["DEV_TEST_KEPT"], "costs $5 or {not-a-ref}"; got != want {
		t.Errorf("DEV_TEST_KEPT = %q, want %q", got, want)
	}

	svc := Service{Name: "api", Env: map[string]string{
		"DEV_TEST_PROXY": "${DEV_TEST_LAYERED:-none}",
		"DEV_TEST_EMPTY": "[${DEV_TEST_NOWHERE:-}]",
	}}
	vars, err = cfg.vars(&svc)
	if err != nil {
		t.Fatal(err)
	}
	if vars["DEV_TEST_PROXY"] != "none" || vars["DEV_TEST_EMPTY"] != "[]" {
		t.Errorf("defaults: DEV_TEST_PROXY = %q, DEV_TEST_EMPTY = %q", vars["DEV_TEST_PROXY"], vars["DEV_TEST_EMPTY"])
	}
	cfg.Env["DEV_TEST_LAYERED"] = "socks5://127.0.0.1:1080"
	if vars, err = cfg.vars(&svc); err != nil || vars["DEV_TEST_PROXY"] != "socks5://127.0.0.1:1080" {
		t.Errorf("a service value should follow dev.json's: %q, %v", vars["DEV_TEST_PROXY"], err)
	}

	cfg.Env = map[string]string{"DEV_TEST_URL": "x${DEV_TEST_NOWHERE}${DEV_TEST_ALSO}"}
	_, err = cfg.vars(nil)
	if err == nil || !strings.Contains(err.Error(), "DEV_TEST_URL: ${DEV_TEST_NOWHERE}, ${DEV_TEST_ALSO} is set in no env file") {
		t.Errorf("an unset ${NAME}: %v", err)
	}
}

func TestBeforeCommandsRunBeforeTheSecretsTheyWrite(t *testing.T) {
	root := t.TempDir()
	cfg, err := Config{
		Root:    root,
		EnvFile: ".env",
		Env:     map[string]string{"DEV_TEST_URL": "amqp://app:${DEV_TEST_SECRET}@localhost/", "DEV_TEST_PLAIN": "kept"},
	}.withDefaults()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := cfg.environ(nil); err == nil {
		t.Fatal("a service's environment should fail while the secret is unset")
	}
	before, err := cfg.beforeEnviron()
	if err != nil {
		t.Fatalf("before commands should run without the secret their env file will hold: %v", err)
	}
	if !slices.Contains(before, "DEV_TEST_PLAIN=kept") || slices.ContainsFunc(before, func(kv string) bool { return strings.HasPrefix(kv, "DEV_TEST_URL=") }) {
		t.Errorf("before env should keep what resolves and leave out what does not: %v", before)
	}

	write(t, filepath.Join(root, ".env"), "DEV_TEST_SECRET=s3cret\n")
	vars, err := cfg.vars(nil)
	if err != nil || vars["DEV_TEST_URL"] != "amqp://app:s3cret@localhost/" {
		t.Errorf("once written, the secret should reach the services: %q, %v", vars["DEV_TEST_URL"], err)
	}
}

func TestWatcherReportsSourceChangesOnly(t *testing.T) {
	root := t.TempDir()
	for _, dir := range []string{"pkg", "web", ".git", "node_modules"} {
		if err := os.MkdirAll(filepath.Join(root, dir), 0o750); err != nil {
			t.Fatal(err)
		}
	}
	w, err := newWatcher([]string{root}, []string{"web"}, []string{".go"}, nil, slog.New(slog.DiscardHandler))
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
		Services: []Service{
			{
				Name: "server",
				// A stand-in for go build: fails when the source says so.
				Build: []string{"sh", "-c", `! grep -q broken src/msg.go && mkdir -p bin && cp src/msg.go bin/msg`},
				// The pid comes before the greeting the test waits on, so stopping the server right after never leaves the file empty.
				Run:     []string{"sh", "-c", `echo $$ > bin/pid; echo "$GREETING $(cat bin/msg)"; exec sleep 300`},
				Watch:   []string{"src"},
				Exclude: []string{"bin"},
			},
			{Name: "web", Run: []string{"sh", "-c", `echo web up; exec sleep 300`}},
		},
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
	pidFile := filepath.Join(root, "bin", "pid")
	serverPID := pidOf(t, pidFile)
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
	serverPID = pidOf(t, pidFile)
	// Briefly allow for a process killed a moment ago: a leaked one is a
	// sleep 300 that is still there long after.
	deadline := time.Now().Add(2 * time.Second)
	for alive(serverPID) && time.Now().Before(deadline) {
		time.Sleep(20 * time.Millisecond)
	}
	if alive(serverPID) {
		out, _ := exec.CommandContext(t.Context(), "ps", "-o", "pid,ppid,stat,command", "-p", strconv.Itoa(serverPID)).CombinedOutput()
		t.Errorf("the server outlived Up:\n%s", out)
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
		Services: []Service{{Name: "web", Run: []string{"sh", "-c", `cat order; exec sleep 300`}}},
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
		Root:     root,
		Before:   [][]string{{"sh", "-c", "exit 3"}, {"touch", "ran"}},
		Services: []Service{{Name: "web", Run: []string{"touch", "started"}}},
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

func TestBuildsRunOneAtATime(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "src", "a.go"), "package a")
	// Each build holds a lock directory; a second build at the same time fails.
	build := []string{"sh", "-c", "mkdir lock && sleep 0.3 && rmdir lock"}
	svc := func(name string) Service {
		return Service{Name: name, Build: build, Run: []string{"sleep", "300"}, Watch: []string{"src"}}
	}
	cfg := Config{Root: root, Services: []Service{svc("one"), svc("two"), svc("three")}}

	var out syncBuffer
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan struct{})
	go func() {
		_ = Up(ctx, cfg, slog.New(slog.NewTextHandler(&out, nil)), &out)
		close(done)
	}()
	t.Cleanup(func() {
		cancel()
		<-done
	})
	eventually(t, "three builds", func() bool { return strings.Count(out.String(), "msg=built") == 3 })
	if strings.Contains(out.String(), "build failed") {
		t.Errorf("builds overlapped:\n%s", out.String())
	}
}

func TestServiceLogsKeepUnprefixedOutput(t *testing.T) {
	root := t.TempDir()
	cfg := Config{Root: root, Services: []Service{{Name: "web", Run: []string{"sh", "-c", "echo first; echo second; exec sleep 300"}}}}

	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan struct{})
	go func() {
		_ = Up(ctx, cfg, slog.New(slog.DiscardHandler), io.Discard)
		close(done)
	}()
	t.Cleanup(func() {
		cancel()
		<-done
	})

	path := LogPath(filepath.Join(root, ".devstack", "logs"), "web")
	eventually(t, "the log", func() bool {
		b, _ := os.ReadFile(path)
		return string(b) == "first\nsecond\n"
	})
}

func TestPrintLogFollowsAcrossRuns(t *testing.T) {
	path := filepath.Join(t.TempDir(), "web.log")
	write(t, path, "run one\n")
	var out syncBuffer
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- printLog(ctx, path, true, &out) }()

	eventually(t, "the first run", func() bool { return out.String() == "run one\n" })
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_APPEND, 0)
	if err != nil {
		t.Fatal(err)
	}
	_, _ = f.WriteString("more\n")
	_ = f.Close()
	eventually(t, "appended output", func() bool { return strings.HasSuffix(out.String(), "more\n") })

	// A new run truncates the log in place.
	write(t, path, "run two\n")
	eventually(t, "the next run", func() bool { return strings.HasSuffix(out.String(), "run two\n") })
	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}

	out = syncBuffer{}
	if err := printLog(t.Context(), path, false, &out); err != nil || out.String() != "run two\n" {
		t.Errorf("printLog = %q, %v", out.String(), err)
	}
}

func TestPrintLogsPrefixesSeveral(t *testing.T) {
	dir := t.TempDir()
	write(t, LogPath(dir, "api"), "one\ntwo\n")
	write(t, LogPath(dir, "web"), "ready\n")

	var out bytes.Buffer
	if err := printLogs(t.Context(), dir, []string{"api", "web"}, false, &out); err != nil {
		t.Fatal(err)
	}
	if want := "api │ one\napi │ two\nweb │ ready\n"; out.String() != want {
		t.Errorf("several = %q, want %q", out.String(), want)
	}
	out.Reset()
	if err := printLogs(t.Context(), dir, []string{"web"}, false, &out); err != nil || out.String() != "ready\n" {
		t.Errorf("one = %q, %v; want it unprefixed", out.String(), err)
	}
	if err := printLogs(t.Context(), dir, []string{"nope"}, false, &out); err == nil {
		t.Error("a service with no log printed nothing and no error")
	}
}
