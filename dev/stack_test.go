package dev

import (
	"context"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
)

func freePort(t *testing.T) int {
	t.Helper()
	ln, err := (&net.ListenConfig{}).Listen(t.Context(), "tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	return ln.Addr().(*net.TCPAddr).Port //nolint:forcetypeassert // a tcp listener
}

func TestStack(t *testing.T) {
	if testing.Short() {
		t.Skip("starts Postgres, which downloads its binaries on first run")
	}
	ctx := t.Context()
	logger := slog.New(slog.DiscardHandler)
	cfg := Config{
		Name:     "app",
		Dir:      t.TempDir(),
		Postgres: &Postgres{Port: freePort(t), Parameters: map[string]string{"max_connections": "50"}},
		S3:       &S3{Addr: net.JoinHostPort("127.0.0.1", strconv.Itoa(freePort(t)))},
	}

	stack, err := StartStack(ctx, cfg, logger)
	if err != nil {
		t.Fatal(err)
	}
	stopped := false
	t.Cleanup(func() {
		if !stopped {
			_ = stack.Stop(context.WithoutCancel(ctx))
		}
	})

	if err := WaitStack(ctx, cfg, 10*time.Second); err != nil {
		t.Fatal(err)
	}
	for _, url := range []string{cfg.DatabaseURL(), cfg.TestDatabaseURL()} {
		conn, err := pgx.Connect(ctx, url)
		if err != nil {
			t.Fatalf("connect %s: %v", url, err)
		}
		var maxConns string
		if err := conn.QueryRow(ctx, "SHOW max_connections").Scan(&maxConns); err != nil {
			t.Fatal(err)
		}
		if maxConns != "50" {
			t.Errorf("max_connections = %s, want the configured 50", maxConns)
		}
		_ = conn.Close(ctx)
	}

	s3 := "http://" + cfg.S3.Addr
	s3Do(t, http.MethodPut, s3+"/bucket", "")
	s3Do(t, http.MethodPut, s3+"/bucket/key", "kept")

	if err := stack.Stop(ctx); err != nil {
		t.Fatal(err)
	}
	stopped = true

	// Data outlives the stack, and a second start reuses it.
	stack, err = StartStack(ctx, cfg, logger)
	if err != nil {
		t.Fatalf("restart: %v", err)
	}
	if got := s3Do(t, http.MethodGet, s3+"/bucket/key", ""); got != "kept" {
		t.Errorf("object after restart = %q, want %q", got, "kept")
	}
	if err := stack.Stop(ctx); err != nil {
		t.Fatal(err)
	}

	if err := ResetStack(ctx, cfg, logger); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(cfg.Dir); !os.IsNotExist(err) {
		t.Errorf("reset left %s behind: %v", cfg.Dir, err)
	}
}

func s3Do(t *testing.T, method, url, body string) string {
	t.Helper()
	req, err := http.NewRequestWithContext(t.Context(), method, url, strings.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	got, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("%s %s: %s %s", method, url, resp.Status, got)
	}
	return string(got)
}
