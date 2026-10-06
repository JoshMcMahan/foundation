package dev

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
	"github.com/jackc/pgx/v5"
	"github.com/johannesboyne/gofakes3"
	"github.com/johannesboyne/gofakes3/backend/s3afero"
	"github.com/spf13/afero"
)

// Stack is a running set of local dependencies.
type Stack struct {
	cfg    Config
	logger *slog.Logger
	pg     *embeddedpostgres.EmbeddedPostgres
	s3     *http.Server
}

// StartStack starts the configured dependencies and returns once they accept
// connections. The first run downloads the Postgres binaries.
func StartStack(ctx context.Context, cfg Config, logger *slog.Logger) (*Stack, error) {
	cfg, err := cfg.withDefaults()
	if err != nil {
		return nil, err
	}
	s := &Stack{cfg: cfg, logger: logger}
	if cfg.Postgres != nil {
		if s.pg, err = startPostgres(ctx, cfg, logger); err != nil {
			return nil, err
		}
	}
	if cfg.S3 != nil {
		if s.s3, err = startS3(ctx, filepath.Join(cfg.Dir, "s3"), cfg.S3.Addr, logger); err != nil {
			_ = s.Stop(ctx)
			return nil, err
		}
	}

	attrs := []any{"data", cfg.Dir}
	if cfg.Postgres != nil {
		attrs = append(attrs, "postgres", cfg.DatabaseURL())
	}
	if cfg.S3 != nil {
		attrs = append(attrs, "s3", "http://"+cfg.S3.Addr)
	}
	logger.InfoContext(ctx, "ready", attrs...)
	return s, nil
}

// Stop shuts the dependencies down; Postgres flushes its data first.
func (s *Stack) Stop(ctx context.Context) error {
	var errs []error
	if s.s3 != nil {
		shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
		errs = append(errs, s.s3.Shutdown(shutdownCtx))
		cancel()
	}
	if s.pg != nil {
		s.logger.InfoContext(ctx, "stopping postgres")
		errs = append(errs, s.pg.Stop())
	}
	return errors.Join(errs...)
}

func startPostgres(ctx context.Context, cfg Config, logger *slog.Logger) (*embeddedpostgres.EmbeddedPostgres, error) {
	dataPath := filepath.Join(cfg.Dir, "postgres", "data")
	runtimePath := filepath.Join(cfg.Dir, "postgres", "runtime")
	stopStalePostgres(ctx, dataPath, runtimePath, logger)

	logFile, err := openLog(filepath.Join(cfg.Dir, "postgres.log"))
	if err != nil {
		return nil, err
	}

	logger.InfoContext(ctx, "starting postgres", "port", cfg.Postgres.Port)
	pg := embeddedpostgres.NewDatabase(embeddedpostgres.DefaultConfig().
		Version(embeddedpostgres.V18).
		Port(uint32(cfg.Postgres.Port)). //nolint:gosec // withDefaults checked the range
		Username(cfg.Name).
		Password(cfg.Name).
		Database(cfg.Name).
		DataPath(dataPath).
		RuntimePath(runtimePath).
		StartParameters(cfg.Postgres.Parameters).
		Logger(logFile).
		StartTimeout(time.Minute))
	if err := pg.Start(); err != nil {
		return nil, fmt.Errorf("start postgres (log: %s): %w", logFile.Name(), err)
	}
	if err := createDatabase(ctx, cfg, cfg.Name+"_test"); err != nil {
		_ = pg.Stop()
		return nil, err
	}
	return pg, nil
}

// stopStalePostgres stops a server left running by a stack that was killed
// without cleanup, which would otherwise hold the port and the data directory.
func stopStalePostgres(ctx context.Context, dataPath, runtimePath string, logger *slog.Logger) {
	if _, err := os.Stat(filepath.Join(dataPath, "postmaster.pid")); err != nil {
		return
	}
	pgCtl := filepath.Join(runtimePath, "bin", "pg_ctl")
	if _, err := os.Stat(pgCtl); err != nil {
		return
	}
	logger.WarnContext(ctx, "stopping postgres left over from a previous run")
	cmd := exec.CommandContext(ctx, pgCtl, "stop", "-D", dataPath, "-m", "fast", "-w") //nolint:gosec // pg_ctl from our own runtime dir
	if out, err := cmd.CombinedOutput(); err != nil {
		logger.WarnContext(ctx, "pg_ctl stop", "error", err, "output", string(out))
	}
}

func createDatabase(ctx context.Context, cfg Config, name string) error {
	conn, err := pgx.Connect(ctx, cfg.databaseURL("postgres"))
	if err != nil {
		return err
	}
	defer conn.Close(context.WithoutCancel(ctx))

	var exists bool
	if err := conn.QueryRow(ctx, "SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = $1)", name).Scan(&exists); err != nil {
		return fmt.Errorf("check database %s: %w", name, err)
	}
	if exists {
		return nil
	}
	if _, err := conn.Exec(ctx, "CREATE DATABASE "+pgx.Identifier{name}.Sanitize()+" OWNER "+pgx.Identifier{cfg.Name}.Sanitize()); err != nil {
		return fmt.Errorf("create database %s: %w", name, err)
	}
	return nil
}

func startS3(ctx context.Context, dir, addr string, logger *slog.Logger) (*http.Server, error) {
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return nil, err
	}
	backend, err := s3afero.MultiBucket(afero.NewBasePathFs(afero.NewOsFs(), dir))
	if err != nil {
		return nil, fmt.Errorf("create s3 backend: %w", err)
	}
	ln, err := (&net.ListenConfig{}).Listen(ctx, "tcp", addr)
	if err != nil {
		return nil, fmt.Errorf("listen for s3: %w", err)
	}

	srv := &http.Server{
		Handler:           gofakes3.New(backend).Server(),
		ReadHeaderTimeout: 10 * time.Second,
	}
	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.ErrorContext(ctx, "s3 server", "error", err)
		}
	}()
	return srv, nil
}

func openLog(path string) (*os.File, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return nil, err
	}
	return os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0o600) //nolint:gosec // path is under the stack's directory
}

// WaitStack blocks until a stack started elsewhere accepts connections, so
// that a server started alongside it does not race it.
func WaitStack(ctx context.Context, cfg Config, timeout time.Duration) error {
	cfg, err := cfg.withDefaults()
	if err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	ready := func() bool {
		if cfg.Postgres != nil {
			conn, err := pgx.Connect(ctx, cfg.DatabaseURL()+"&connect_timeout=2")
			if err != nil {
				return false
			}
			_ = conn.Close(ctx)
		}
		if cfg.S3 != nil {
			conn, err := (&net.Dialer{Timeout: 2 * time.Second}).DialContext(ctx, "tcp", cfg.S3.Addr)
			if err != nil {
				return false
			}
			_ = conn.Close()
		}
		return true
	}

	for !ready() {
		select {
		case <-ctx.Done():
			return errors.New("timed out waiting for the stack; is `dev stack` running?")
		case <-time.After(500 * time.Millisecond):
		}
	}
	return nil
}

// ResetStack deletes the stack's data. A server still running from the same
// directory is stopped first, since it would recreate files as they go.
func ResetStack(ctx context.Context, cfg Config, logger *slog.Logger) error {
	cfg, err := cfg.withDefaults()
	if err != nil {
		return err
	}
	stopStalePostgres(ctx, filepath.Join(cfg.Dir, "postgres", "data"), filepath.Join(cfg.Dir, "postgres", "runtime"), logger)
	logger.InfoContext(ctx, "deleting", "data", cfg.Dir)
	return os.RemoveAll(cfg.Dir)
}
