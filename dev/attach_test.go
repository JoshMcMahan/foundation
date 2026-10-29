package dev

import (
	"context"
	"strings"
	"testing"
	"time"

	tea "charm.land/bubbletea/v2"
)

func TestViewAttachesToARunningDev(t *testing.T) {
	cfg := testServices(t.TempDir())
	done := runUp(t, cfg)
	eventually(t, "web to run", func() bool {
		s, err := control(t.Context(), cfg, controlRequest{Command: "status"})
		return err == nil && stateOf(s, "web") == stateRunning
	})

	ctx, cancel := context.WithCancel(t.Context())
	defer cancel()
	r, err := newRemote(ctx, cfg)
	if err != nil {
		t.Fatal(err)
	}
	m := &model{sup: r, ctx: ctx, cancel: cancel, attached: true}
	m.Update(tea.WindowSizeMsg{Width: 100, Height: 20})
	press := func(msg tea.KeyPressMsg) tea.Cmd {
		_, cmd := m.Update(msg)
		return cmd
	}
	key := func(k string) tea.KeyPressMsg { return tea.KeyPressMsg{Code: rune(k[0]), Text: k} }

	home := m.View().Content
	for _, want := range []string{"(attached)", "api", "web", "q detach · Q stop dev"} {
		if !strings.Contains(home, want) {
			t.Errorf("attached view lacks %q:\n%s", want, home)
		}
	}

	press(tea.KeyPressMsg{Code: tea.KeyDown})
	if cmd := press(key("s")); cmd != nil {
		m.Update(cmd())
	}
	eventually(t, "web stopped through the socket", func() bool {
		s, err := control(t.Context(), cfg, controlRequest{Command: "status"})
		return err == nil && stateOf(s, "web") == stateStopped
	})

	press(key("a"))
	eventually(t, "every service's output, from all.log", func() bool {
		v := m.View().Content
		return strings.Contains(v, "api up") && strings.Contains(v, "web up")
	})

	// q leaves the view and dev running.
	if cmd := press(key("q")); cmd == nil {
		t.Fatal("q returned no command")
	} else if _, ok := cmd().(tea.QuitMsg); !ok {
		t.Error("q did not quit the view")
	}
	if _, err := control(t.Context(), cfg, controlRequest{Command: "status"}); err != nil {
		t.Errorf("q stopped dev: %v", err)
	}

	// Q stops it.
	if cmd := press(tea.KeyPressMsg{Code: 'Q', Text: "Q"}); cmd != nil {
		cmd()
	}
	select {
	case err := <-done:
		if err != nil {
			t.Fatal(err)
		}
	case <-time.After(30 * time.Second):
		t.Fatal("Q did not stop dev")
	}
}
