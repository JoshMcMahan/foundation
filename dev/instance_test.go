package dev

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func runUp(t *testing.T, cfg Config) (done <-chan error) {
	t.Helper()
	ctx, stop := context.WithCancel(t.Context())
	finished := make(chan error, 1)
	go func() { finished <- Up(ctx, cfg, slog.New(slog.DiscardHandler), io.Discard) }()
	eventually(t, "dev to answer", func() bool {
		_, err := control(t.Context(), cfg, controlRequest{Command: "status"})
		return err == nil
	})
	t.Cleanup(stop)
	return finished
}

func TestDownStopsAnotherCheckoutsDev(t *testing.T) {
	root := t.TempDir()
	write(t, filepath.Join(root, "cmd", "app", "main.go"), "package main\n")
	cfg := Config{Root: root, Services: []Service{{Name: "web", Run: []string{"sleep", "300"}}}}
	done := runUp(t, cfg)

	if _, err := instanceAt(t.Context(), t.TempDir()); err == nil || !strings.Contains(err.Error(), "no dev runs in") {
		t.Errorf("a directory no dev runs in: %v", err)
	}
	// Named by a directory inside the checkout, as from a shell in it.
	in, err := instanceAt(t.Context(), filepath.Join(root, "cmd", "app"))
	if err != nil {
		t.Fatal(err)
	}
	if err := down(t.Context(), Config{Root: in.Root, Dir: in.Dir}); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("dev kept running after down named its checkout")
	}
}

func TestDownStopsARunningDev(t *testing.T) {
	cfg := Config{Root: t.TempDir(), Services: []Service{{Name: "web", Run: []string{"sleep", "300"}}}}
	done := runUp(t, cfg)
	if err := down(t.Context(), cfg); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("dev kept running after down")
	}
}

func TestEnvHandsOutOnlyDevsOwnVariables(t *testing.T) {
	t.Setenv("DEV_TEST_SHELL_SECRET", "from the shell that started dev")
	cfg := Config{
		Root:     t.TempDir(),
		Ports:    map[string]int{"server": freePort(t)},
		Env:      map[string]string{"ADDR": ":{port.server}"},
		Services: []Service{{Name: "web", Run: []string{"sleep", "300"}}},
	}
	runUp(t, cfg)
	resp, err := controlFull(t.Context(), cfg, controlRequest{Command: "env"})
	if err != nil {
		t.Fatal(err)
	}
	if resp.Env["ADDR"] == "" || resp.Env["ADDR"] == ":{port.server}" {
		t.Errorf("ADDR = %q, want the allocated port", resp.Env["ADDR"])
	}
	for _, leaked := range []string{"DEV_TEST_SHELL_SECRET", "PATH", "HOME"} {
		if _, ok := resp.Env[leaked]; ok {
			t.Errorf("env handed out %s from dev's own environment", leaked)
		}
	}
}

func TestPSListsRunningDevsAndClearsStaleSockets(t *testing.T) {
	cfg := Config{Root: t.TempDir(), Services: []Service{{Name: "web", Run: []string{"sleep", "300"}}}}
	runUp(t, cfg)
	dir, err := socketDir()
	if err != nil {
		t.Fatal(err)
	}
	stale := filepath.Join(dir, "0000000000000000.sock")
	if err := os.WriteFile(stale, nil, 0o600); err != nil {
		t.Fatal(err)
	}

	list, err := Instances(t.Context())
	if err != nil {
		t.Fatal(err)
	}
	root, _ := filepath.Abs(cfg.Root)
	found := false
	for _, in := range list {
		if in.Root == root && in.PID == os.Getpid() && !in.Started.IsZero() {
			found = true
		}
	}
	if !found {
		t.Errorf("ps = %+v, missing the dev in %s", list, root)
	}
	if _, err := os.Stat(stale); !errors.Is(err, os.ErrNotExist) {
		t.Error("ps left a socket no dev answers on")
	}
}

func TestExecPassesOnTheEnvironmentAndExitStatus(t *testing.T) {
	cfg := Config{
		Root:     t.TempDir(),
		Env:      map[string]string{"DEV_TEST_FROM_DEV": "yes"},
		Services: []Service{{Name: "web", Run: []string{"sleep", "300"}}},
	}
	runUp(t, cfg)
	if env, err := Env(t.Context(), cfg); err != nil || env["DEV_TEST_FROM_DEV"] != "yes" {
		t.Errorf("Env = %v, %v", env, err)
	}
	if err := execWith(t.Context(), cfg, []string{"sh", "-c", `test "$DEV_TEST_FROM_DEV" = yes`}); err != nil {
		t.Errorf("the command did not get dev's environment: %v", err)
	}
	var exit ExitError
	if err := execWith(t.Context(), cfg, []string{"sh", "-c", "exit 3"}); !errors.As(err, &exit) || exit.Code != 3 {
		t.Errorf("exec = %v, want exit status 3", err)
	}
}

func TestDevStopsWhenItsCheckoutIsDeleted(t *testing.T) {
	checkoutCheck = 50 * time.Millisecond
	t.Cleanup(func() { checkoutCheck = 5 * time.Second })
	root := filepath.Join(t.TempDir(), "worktree")
	if err := os.Mkdir(root, 0o750); err != nil {
		t.Fatal(err)
	}
	// The stack's directory lives elsewhere, as --dir puts it, so that it
	// is not deleted along with the checkout.
	cfg := Config{Root: root, Dir: t.TempDir(), Services: []Service{{Name: "web", Run: []string{"sleep", "300"}}}}
	done := runUp(t, cfg)
	if err := os.RemoveAll(root); err != nil {
		t.Fatal(err)
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("dev kept running after its checkout was deleted")
	}
}

func TestPSRunsWithoutADevJSON(t *testing.T) {
	missing := errors.New("no dev.json here")
	run := func(args ...string) error {
		root := NewRootCmd(Config{})
		RequireConfig(root, missing)
		root.SetArgs(args)
		root.SetOut(io.Discard)
		return root.ExecuteContext(t.Context())
	}
	if err := run("ps"); err != nil {
		t.Errorf("ps without a dev.json: %v", err)
	}
	for _, args := range [][]string{{"status"}, {"logs", "web"}, {}} {
		if err := run(args...); !errors.Is(err, missing) {
			t.Errorf("dev %v without a dev.json = %v, want the missing dev.json", args, err)
		}
	}
}
