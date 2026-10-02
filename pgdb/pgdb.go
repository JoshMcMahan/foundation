// Package pgdb gives an application its own schema in a PostgreSQL
// database: a pool whose connections use it, hopper's job tables in it, and
// goose migrations applied to it, so several applications can share one
// database without their tables meeting.
package pgdb

import (
	"context"
	"errors"
	"fmt"
	"hash/fnv"
	"io/fs"
	"log/slog"
	"regexp"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/jackc/pgx/v5/stdlib"
	"github.com/parallelworks/hopper/driver/hopperpgx"
	"github.com/parallelworks/hopper/hoppermigrate"
	"github.com/pressly/goose/v3"
)

var schemaName = regexp.MustCompile(`^[a-z_][a-z0-9_]{0,62}$`)

// ValidSchema reports whether name is usable as a schema: lowercase letters,
// digits and underscores, not starting with a digit, at most 63 bytes.
func ValidSchema(name string) bool { return schemaName.MatchString(name) }

// Open creates a connection pool whose connections use schema as their
// search_path, and verifies connectivity. TLS to the database is negotiated
// by crypto/tls, which uses the FIPS 140-3 module.
func Open(ctx context.Context, url, schema string) (*pgxpool.Pool, error) {
	if !ValidSchema(schema) {
		return nil, fmt.Errorf("pgdb: invalid schema name %q", schema)
	}
	cfg, err := pgxpool.ParseConfig(url)
	if err != nil {
		return nil, fmt.Errorf("pgdb: parse database url: %w", err)
	}
	cfg.ConnConfig.RuntimeParams["search_path"] = schema
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("pgdb: create pool: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("pgdb: ping database: %w", err)
	}
	return pool, nil
}

// Schema is the schema of a pool from Open.
func Schema(pool *pgxpool.Pool) string {
	return pool.Config().ConnConfig.RuntimeParams["search_path"]
}

// HopperDriver returns hopper's driver for a pool from Open, with hopper's
// tables in the pool's schema. hopper's own default is a schema named hopper.
func HopperDriver(pool *pgxpool.Pool) *hopperpgx.Driver {
	return hopperpgx.NewWithConfig(pool, &hopperpgx.Config{Schema: Schema(pool)})
}

// Migrations are an application's goose migrations.
type Migrations struct {
	// FS holds the migration files at its root.
	FS fs.FS
	// LockKey is the pg_advisory_lock key held while migrating, so that one
	// replica migrates at a time. Zero derives one from the schema.
	LockKey int64
	// Logger defaults to slog.Default().
	Logger *slog.Logger
}

// Migrate creates the pool's schema, installs or upgrades hopper's tables in
// it and applies the application's migrations. It is safe to call from
// several replicas at once.
//
// The lock is held on a dedicated connection outside the pool, so replicas
// waiting on it never starve the migration itself of pool connections.
func Migrate(ctx context.Context, pool *pgxpool.Pool, m Migrations) (err error) {
	schema := Schema(pool)
	if !ValidSchema(schema) {
		return fmt.Errorf("pgdb: pool has no schema from Open (search_path %q)", schema)
	}
	logger := m.Logger
	if logger == nil {
		logger = slog.Default()
	}
	key := m.LockKey
	if key == 0 {
		h := fnv.New64a()
		_, _ = h.Write([]byte("pgdb/" + schema))
		key = int64(h.Sum64()) //nolint:gosec // any 64 bits will do as a lock key
	}

	conn, err := pgx.ConnectConfig(ctx, pool.Config().ConnConfig.Copy())
	if err != nil {
		return fmt.Errorf("pgdb: connect for migration lock: %w", err)
	}
	defer func() {
		err = errors.Join(err, conn.Close(context.WithoutCancel(ctx)))
	}()
	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock($1)", key); err != nil {
		return fmt.Errorf("pgdb: acquire migration lock: %w", err)
	}
	defer func() {
		// A fresh context releases the lock even on cancellation.
		if _, uerr := conn.Exec(context.WithoutCancel(ctx), "SELECT pg_advisory_unlock($1)", key); uerr != nil {
			err = errors.Join(err, fmt.Errorf("pgdb: release migration lock: %w", uerr))
		}
	}()

	if _, err := conn.Exec(ctx, "CREATE SCHEMA IF NOT EXISTS "+pgx.Identifier{schema}.Sanitize()); err != nil {
		return fmt.Errorf("pgdb: create schema %s: %w", schema, err)
	}
	if _, err := hoppermigrate.Up(ctx, HopperDriver(pool), &hoppermigrate.Options{Logger: logger}); err != nil {
		return fmt.Errorf("pgdb: migrate hopper: %w", err)
	}
	return migrateApp(ctx, pool, m.FS, logger)
}

func migrateApp(ctx context.Context, pool *pgxpool.Pool, fsys fs.FS, logger *slog.Logger) error {
	if fsys == nil {
		return nil
	}
	db := stdlib.OpenDBFromPool(pool)
	defer db.Close()
	provider, err := goose.NewProvider(goose.DialectPostgres, db, fsys)
	if err != nil {
		return fmt.Errorf("pgdb: goose: %w", err)
	}
	results, err := provider.Up(ctx)
	if err != nil {
		return fmt.Errorf("pgdb: migrate: %w", err)
	}
	for _, r := range results {
		logger.InfoContext(ctx, "applied migration", "version", r.Source.Version, "file", r.Source.Path, "duration", r.Duration)
	}
	return nil
}
