package dev

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	tea "charm.land/bubbletea/v2"
)

// pidOf reads the pid a test service wrote, once it has.
func pidOf(t *testing.T, path string) int {
	t.Helper()
	var pid int
	eventually(t, "a pid in "+filepath.Base(path), func() bool {
		b, err := os.ReadFile(path)
		pid, _ = strconv.Atoi(strings.TrimSpace(string(b)))
		return err == nil && pid > 0
	})
	return pid
}

func stateOf(services []status, name string) state {
	for _, s := range services {
		if s.Name == name {
			return s.State
		}
	}
	return ""
}

func testServices(root string) Config {
	write := func(name string) []string {
		return []string{"sh", "-c", "echo $$ > " + name + ".pid; echo " + name + " up; exec sleep 300"}
	}
	return Config{Root: root, Services: []Service{
		{Name: "api", Build: []string{"true"}, Run: write("api"), Watch: []string{"."}, URL: "http://localhost:8080"},
		{Name: "web", Run: write("web")},
		{Name: "worker", Run: write("worker"), Manual: true},
	}}
}

func TestControlDrivesARunningDev(t *testing.T) {
	root := t.TempDir()
	cfg := testServices(root)
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- Up(ctx, cfg, slog.New(slog.DiscardHandler), io.Discard) }()
	t.Cleanup(func() {
		cancel()
		if err := <-done; err != nil {
			t.Error(err)
		}
	})

	status := func() []status {
		t.Helper()
		s, err := control(t.Context(), cfg, controlRequest{Command: "status"})
		if err != nil {
			t.Fatal(err)
		}
		return s
	}
	eventually(t, "api and web to run", func() bool {
		s, err := control(t.Context(), cfg, controlRequest{Command: "status"})
		return err == nil && stateOf(s, "api") == stateRunning && stateOf(s, "web") == stateRunning
	})
	if got := stateOf(status(), "worker"); got != stateStopped {
		t.Errorf("manual worker = %s, want stopped until started", got)
	}

	web := pidOf(t, filepath.Join(root, "web.pid"))
	if _, err := control(t.Context(), cfg, controlRequest{Command: "stop", Service: "web"}); err != nil {
		t.Fatal(err)
	}
	if alive(web) || stateOf(status(), "web") != stateStopped {
		t.Errorf("after stop: web alive=%v state=%s", alive(web), stateOf(status(), "web"))
	}
	if stateOf(status(), "api") != stateRunning {
		t.Error("stopping web stopped api")
	}

	if _, err := control(t.Context(), cfg, controlRequest{Command: "start", Service: "worker"}); err != nil {
		t.Fatal(err)
	}
	eventually(t, "worker to run", func() bool { return stateOf(status(), "worker") == stateRunning })
	if _, err := control(t.Context(), cfg, controlRequest{Command: "start", Service: "worker"}); err == nil {
		t.Error("starting a running service succeeded")
	}

	api := pidOf(t, filepath.Join(root, "api.pid"))
	_ = os.Remove(filepath.Join(root, "api.pid"))
	if _, err := control(t.Context(), cfg, controlRequest{Command: "restart", Service: "api"}); err != nil {
		t.Fatal(err)
	}
	if next := pidOf(t, filepath.Join(root, "api.pid")); next == api || alive(api) {
		t.Errorf("restart kept api: old %d (alive %v), new %d", api, alive(api), next)
	}

	if _, err := control(t.Context(), cfg, controlRequest{Command: "stop", Service: "nope"}); err == nil {
		t.Error("an unknown service was accepted")
	}
	if err := Up(t.Context(), cfg, slog.New(slog.DiscardHandler), io.Discard); err == nil || !strings.Contains(err.Error(), "already running") {
		t.Errorf("a second dev in the same place: %v", err)
	}

	cancel()
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	done <- nil
	if _, err := control(t.Context(), cfg, controlRequest{Command: "status"}); err == nil || !strings.Contains(err.Error(), "not running") {
		t.Errorf("status after dev stopped: %v", err)
	}
}

func TestTUIKeysDriveServices(t *testing.T) {
	root := t.TempDir()
	cfg := testServices(root)
	s, err := newSupervisor(t.Context(), cfg, slog.New(slog.DiscardHandler), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- s.run(ctx) }()
	t.Cleanup(func() {
		cancel()
		if err := <-done; err != nil {
			t.Error(err)
		}
	})
	eventually(t, "web to run", func() bool { return stateOf(s.statuses(), "web") == stateRunning })

	m := &model{sup: s, ctx: ctx, cancel: cancel, name: "shop"}
	m.Update(tea.WindowSizeMsg{Width: 100, Height: 20})
	press := func(k string) tea.Cmd {
		var msg tea.KeyPressMsg
		switch k {
		case "down":
			msg = tea.KeyPressMsg{Code: tea.KeyDown}
		case "enter":
			msg = tea.KeyPressMsg{Code: tea.KeyEnter}
		case "esc":
			msg = tea.KeyPressMsg{Code: tea.KeyEscape}
		case "ctrl+u":
			msg = tea.KeyPressMsg{Code: 'u', Mod: tea.ModCtrl}
		default:
			msg = tea.KeyPressMsg{Code: rune(k[0]), Text: k}
		}
		_, cmd := m.Update(msg)
		if cmd != nil {
			if done, ok := cmd().(actionMsg); ok {
				m.Update(done)
			}
		}
		return cmd
	}

	home := m.View().Content
	for _, want := range []string{"dev · shop", "api", "web", "worker", "manual"} {
		if !strings.Contains(home, want) {
			t.Errorf("home view lacks %q:\n%s", want, home)
		}
	}
	// An OSC 8 hyperlink, which terminals open on cmd-click.
	if !strings.Contains(home, "\x1b]8;;http://localhost:8080") {
		t.Errorf("api's URL is not a link:\n%q", home)
	}
	lines := strings.Split(home, "\n")
	if len(lines) != 20 || !strings.Contains(lines[19], "q quit") {
		t.Errorf("help is not on the last of 20 lines: %d lines, last %q", len(lines), lines[len(lines)-1])
	}

	press("down") // web
	press("s")
	if got := stateOf(s.statuses(), "web"); got != stateStopped {
		t.Errorf("s on a running service: web = %s, want stopped", got)
	}
	press("s")
	eventually(t, "web to run again", func() bool { return stateOf(s.statuses(), "web") == stateRunning })

	press("enter")
	eventually(t, "web's output in its view", func() bool { return strings.Contains(m.View().Content, "web up") })
	if strings.Contains(m.View().Content, "api up") {
		t.Error("web's view shows api's output")
	}
	// Paging works with the keys a laptop has.
	press("ctrl+u")
	if m.scroll != 0 {
		t.Errorf("ctrl+u scrolled past the top of a short log: %d", m.scroll)
	}
	press("esc")
	press("a")
	eventually(t, "every service in all output", func() bool {
		v := m.View().Content
		return strings.Contains(v, "api") && strings.Contains(v, "api up") && strings.Contains(v, "web up")
	})

	press("q")
	if !m.quitting || ctx.Err() == nil {
		t.Error("q did not stop dev")
	}
}

func TestSocketsLiveInRuntimeState(t *testing.T) {
	t.Setenv("XDG_RUNTIME_DIR", "/run/user/1000")
	if dir, err := socketDir(); err != nil || dir != "/run/user/1000/foundation-dev" {
		t.Errorf("with XDG_RUNTIME_DIR: %q, %v", dir, err)
	}
	t.Setenv("XDG_RUNTIME_DIR", "")
	home, _ := os.UserHomeDir()
	if dir, err := socketDir(); err != nil || dir != filepath.Join(home, ".local", "state", "foundation-dev") {
		t.Errorf("without: %q, %v", dir, err)
	}
}

func TestServicesLearnWhereToOpenThem(t *testing.T) {
	root := t.TempDir()
	cfg := Config{Root: root, S3: &S3{Addr: "127.0.0.1:" + strconv.Itoa(freePort(t))}, Services: []Service{
		// As Vite prints it, colors and all.
		{Name: "web", Run: []string{"sh", "-c", `printf '  \033[32m➜\033[0m  Local:   \033[36mhttp://localhost:5173/\033[0m\n'; exec sleep 300`}},
		{Name: "api", Run: []string{"sleep", "300"}, Health: "http://localhost:8080/readyz"},
		{Name: "set", Run: []string{"sh", "-c", "echo http://localhost:9999; exec sleep 300"}, URL: "http://localhost:3000"},
	}}
	s, err := newSupervisor(t.Context(), cfg, slog.New(slog.DiscardHandler), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- s.run(ctx) }()
	t.Cleanup(func() {
		cancel()
		if err := <-done; err != nil {
			t.Error(err)
		}
	})

	urlOf := func(name string) string {
		for _, st := range s.statuses() {
			if st.Name == name {
				return st.URL
			}
		}
		return ""
	}
	eventually(t, "web's printed address", func() bool { return urlOf("web") == "http://localhost:5173/" })
	if got := urlOf("api"); got != "http://localhost:8080" {
		t.Errorf("api = %q, want its health URL's origin", got)
	}
	eventually(t, "set's output", func() bool { return len(s.lines("set")) > 0 })
	if got := urlOf("set"); got != "http://localhost:3000" {
		t.Errorf("set = %q, want the url dev.json gives over what it prints", got)
	}

	// Rendered inside another style, a link loses its styling from the first
	// character on; it must reach the screen exactly as link renders it.
	m := &model{sup: s, ctx: ctx, cancel: cancel}
	m.Update(tea.WindowSizeMsg{Width: 120, Height: 10})
	if s3 := link("http://"+cfg.S3.Addr, true); !strings.Contains(m.View().Content, s3) {
		t.Errorf("the S3 link was restyled:\n%q", m.View().Content)
	}
}

func TestViewShowsStartupProgress(t *testing.T) {
	root := t.TempDir()
	cfg := Config{
		Root:     root,
		Before:   [][]string{{"sh", "-c", "echo regenerating content; sleep 300"}},
		Services: []Service{{Name: "web", Run: []string{"sleep", "300"}}},
	}
	s, err := newSupervisor(t.Context(), cfg, slog.New(slog.DiscardHandler), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- s.run(ctx) }()
	t.Cleanup(func() {
		cancel()
		if err := <-done; err != nil {
			t.Error(err)
		}
	})

	m := &model{sup: s, ctx: ctx, cancel: cancel}
	m.Update(tea.WindowSizeMsg{Width: 100, Height: 12})
	eventually(t, "the before command's output in the view", func() bool {
		v := m.View().Content
		return strings.Contains(v, "running before commands…") && strings.Contains(v, "regenerating content")
	})
}

func TestTUIStaysWithWhyDevFailedToStart(t *testing.T) {
	cfg := testServices(t.TempDir())
	s, err := newSupervisor(t.Context(), cfg, slog.New(slog.DiscardHandler), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	m := &model{sup: s, ctx: ctx, cancel: cancel, name: "shop"}
	m.Update(tea.WindowSizeMsg{Width: 100, Height: 20})

	if _, cmd := m.Update(stoppedMsg{err: errors.New("before: secrets failed")}); cmd != nil {
		t.Fatal("the view left at once on a failed start")
	}
	if home := m.View().Content; !strings.Contains(home, "dev stopped: before: secrets failed") {
		t.Errorf("the view does not say why dev stopped:\n%s", home)
	}
	_, cmd := m.Update(tea.KeyPressMsg{Code: 'q', Text: "q"})
	if cmd == nil {
		t.Fatal("q did not leave")
	}
	if _, ok := cmd().(tea.QuitMsg); !ok {
		t.Error("q after a failed start did not quit")
	}
	if m.err == nil {
		t.Error("the failure is not returned for dev to print")
	}
}
