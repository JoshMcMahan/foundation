package dev

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log/slog"
	"os"
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
	"github.com/charmbracelet/x/ansi"
)

func switchable(root string) Config {
	return Config{
		Root: root,
		Profiles: map[string]Profile{
			"a": {Env: map[string]string{"SIDE": "a"}},
			"b": {Env: map[string]string{"SIDE": "b"}},
		},
		DefaultProfiles: []string{"a"},
		Services: []Service{
			{Name: "x", Run: []string{"sleep", "300"}, Profiles: []string{"a"}},
			{Name: "y", Run: []string{"sleep", "300"}, Profiles: []string{"b"}},
		},
	}
}

func TestARunningDevSwitchesProfiles(t *testing.T) {
	cfg := switchable(t.TempDir())
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan error, 1)
	go func() { done <- Up(ctx, cfg, slog.New(slog.DiscardHandler), io.Discard) }()
	t.Cleanup(func() {
		cancel()
		if err := <-done; err != nil {
			t.Error(err)
		}
	})
	eventually(t, "x on profile a", func() bool {
		s, err := control(t.Context(), cfg, controlRequest{Command: "status"})
		return err == nil && stateOf(s, "x") == stateRunning
	})

	if _, err := controlFull(t.Context(), cfg, controlRequest{Command: "use", Profiles: []string{"b"}}); err != nil {
		t.Fatal(err)
	}
	eventually(t, "y on profile b, without x", func() bool {
		s, err := control(t.Context(), cfg, controlRequest{Command: "status"})
		return err == nil && stateOf(s, "y") == stateRunning && stateOf(s, "x") == ""
	})
	select {
	case err := <-done:
		t.Fatalf("dev ended instead of switching: %v", err)
	default:
	}
	c, _ := cfg.withDefaults()
	if b, _ := os.ReadFile(c.profilesFile()); strings.TrimSpace(string(b)) != "b" {
		t.Errorf("the checkout's choice = %q, want b", b)
	}
}

func TestUseRecordsTheChoiceWhenNothingRuns(t *testing.T) {
	cfg := switchable(t.TempDir())
	root := NewRootCmd(cfg)
	var out bytes.Buffer
	root.SetOut(&out)
	root.SetArgs([]string{"use", "b"})
	if err := root.ExecuteContext(t.Context()); err != nil {
		t.Fatal(err)
	}
	if c, _ := cfg.withDefaults(); len(c.active) != 1 || c.active[0] != "b" {
		t.Errorf("active after use = %v", c.active)
	}
	if !strings.Contains(out.String(), "from its next start") {
		t.Errorf("use said %q", out.String())
	}
}

func TestViewPicksAProfile(t *testing.T) {
	cfg := switchable(t.TempDir())
	s, err := newSupervisor(t.Context(), cfg, slog.New(slog.DiscardHandler), io.Discard)
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	ran := make(chan error, 1)
	go func() { ran <- s.run(ctx) }()
	eventually(t, "x", func() bool { return stateOf(s.statuses(), "x") == stateRunning })

	m := &model{sup: s, ctx: ctx, cancel: cancel}
	m.Update(tea.WindowSizeMsg{Width: 100, Height: 12})
	m.Update(tea.KeyPressMsg{Code: 'p', Text: "p"})
	if v := ansi.Strip(m.View().Content); !strings.Contains(v, "profiles") || !strings.Contains(v, "● a") {
		t.Errorf("picker =\n%s", v)
	}
	m.Update(tea.KeyPressMsg{Code: tea.KeyDown})
	_, cmd := m.Update(tea.KeyPressMsg{Code: tea.KeyEnter})
	if cmd == nil {
		t.Fatal("enter did nothing")
	}
	if msg, ok := cmd().(actionMsg); !ok || msg.err != nil {
		t.Fatalf("switching = %+v", msg)
	}
	select {
	case err := <-ran:
		if !errors.Is(err, errSwitch) {
			t.Errorf("run ended with %v, want a switch", err)
		}
		if strings.Join(s.switchTo, ",") != "b" {
			t.Errorf("switching to %v, want b", s.switchTo)
		}
	case <-time.After(15 * time.Second):
		t.Fatal("the run did not end to switch")
	}
}
