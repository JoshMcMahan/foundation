package pgdb_test

import (
	"context"
	"crypto/rand"
	"errors"
	"log/slog"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/sync/errgroup"

	"github.com/parallelworks/foundation/pgdb"
	"github.com/parallelworks/foundation/pgdb/pgdbtest"
)

const urlEnv = "FOUNDATION_TEST_DATABASE_URL"

func migrations() pgdb.Migrations {
	return pgdb.Migrations{FS: os.DirFS("testdata/migrations"), Logger: slog.New(slog.DiscardHandler)}
}

func TestOpenRejectsInvalidSchema(t *testing.T) {
	for _, schema := range []string{"", "App", "app; DROP TABLE x", "1app"} {
		if _, err := pgdb.Open(t.Context(), "postgres://localhost/x", schema); err == nil {
			t.Errorf("Open accepted schema %q", schema)
		}
	}
}

func TestMigrateKeepsEverythingInTheSchema(t *testing.T) {
	ctx := t.Context()
	// A small pool reproduces replicas contending for connections while they
	// wait on the migration lock.
	pool := pgdbtest.Open(t, urlEnv, "pool_max_conns=2")
	schema := pgdb.Schema(pool)

	var g errgroup.Group
	for range 4 {
		g.Go(func() error { return pgdb.Migrate(ctx, pool, migrations()) })
	}
	if err := g.Wait(); err != nil {
		t.Fatalf("concurrent migrate: %v", err)
	}

	for _, table := range []string{"widgets", "goose_db_version"} {
		var where string
		err := pool.QueryRow(ctx,
			"SELECT table_schema FROM information_schema.tables WHERE table_name = $1 AND table_schema = ANY($2)",
			table, []string{schema, "public"}).Scan(&where)
		if err != nil {
			t.Errorf("table %s: %v", table, err)
		} else if where != schema {
			t.Errorf("table %s is in schema %s, want %s", table, where, schema)
		}
	}
	var n int
	if err := pool.QueryRow(ctx,
		"SELECT count(*) FROM information_schema.tables WHERE table_schema = $1", schema).Scan(&n); err != nil || n != 2 {
		t.Errorf("schema has %d tables (%v); want only the app table and migration history", n, err)
	}
	if _, err := pool.Exec(ctx, "INSERT INTO widgets VALUES (1, 'a')"); err != nil {
		t.Errorf("app table unreachable through the pool: %v", err)
	}
}

func TestMigrateWithoutMigrationsCreatesEmptySchema(t *testing.T) {
	pool := pgdbtest.Migrated(t, urlEnv, pgdb.Migrations{})
	schema := pgdb.Schema(pool)
	var current string
	if err := pool.QueryRow(t.Context(), "SELECT current_schema()").Scan(&current); err != nil || current != schema {
		t.Fatalf("current schema = %q, %v; want %q", current, err, schema)
	}
	var n int
	if err := pool.QueryRow(t.Context(),
		"SELECT count(*) FROM information_schema.tables WHERE table_schema = $1", schema).Scan(&n); err != nil || n != 0 {
		t.Errorf("schema has %d tables (%v); want an empty schema", n, err)
	}
}

func TestMigrateConcurrentIndex(t *testing.T) {
	ctx, cancel := context.WithTimeout(t.Context(), 10*time.Second)
	defer cancel()
	name := "pgdb_" + rand.Text()
	pool := pgdbtest.Open(t, urlEnv, "pool_max_conns=2&application_name="+name)
	conn, key := holdMigrationLock(t, pool)
	m := migrations()
	m.LockKey = key
	var g errgroup.Group
	defer func() {
		cancel()
		_ = g.Wait()
	}()
	for range 4 {
		g.Go(func() error { return pgdb.Migrate(ctx, pool, m) })
	}
	// Every replica must contend before one starts the concurrent index build.
	waitForMigrationLocks(t, ctx, conn, name, 4)
	if _, err := conn.Exec(ctx, "SELECT pg_advisory_unlock($1)", key); err != nil {
		t.Fatal(err)
	}
	if err := g.Wait(); err != nil {
		t.Fatalf("concurrent migrate: %v", err)
	}
	var valid bool
	if err := pool.QueryRow(ctx,
		"SELECT indisvalid FROM pg_index WHERE indexrelid = 'widgets_name_idx'::regclass").Scan(&valid); err != nil || !valid {
		t.Errorf("concurrent index valid = %v, %v; want true", valid, err)
	}
}

func TestMigrateCanceledWhileWaiting(t *testing.T) {
	ctx, stop := context.WithTimeout(t.Context(), 10*time.Second)
	defer stop()
	name := "pgdb_" + rand.Text()
	pool := pgdbtest.Open(t, urlEnv, "pool_max_conns=1&application_name="+name)
	conn, key := holdMigrationLock(t, pool)
	m := migrations()
	m.LockKey = key
	waitCtx, cancel := context.WithCancel(ctx)
	var g errgroup.Group
	defer func() {
		cancel()
		_ = g.Wait()
	}()
	g.Go(func() error { return pgdb.Migrate(waitCtx, pool, m) })
	waitForMigrationLocks(t, ctx, conn, name, 1)
	cancel()
	if err := g.Wait(); !errors.Is(err, context.Canceled) {
		t.Fatalf("waiting migrate = %v; want context.Canceled", err)
	}
	if _, err := conn.Exec(ctx, "SELECT pg_advisory_unlock($1)", key); err != nil {
		t.Fatal(err)
	}
	if err := pgdb.Migrate(ctx, pool, m); err != nil {
		t.Fatalf("migrate after cancellation: %v", err)
	}
}

func holdMigrationLock(t *testing.T, pool *pgxpool.Pool) (*pgx.Conn, int64) {
	t.Helper()
	ctx := t.Context()
	conn, err := pgx.ConnectConfig(ctx, pool.Config().ConnConfig.Copy())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		if err := conn.Close(context.WithoutCancel(ctx)); err != nil {
			t.Error(err)
		}
	})
	key := int64(conn.PgConn().PID())
	if _, err := conn.Exec(ctx, "SELECT pg_advisory_lock($1)", key); err != nil {
		t.Fatal(err)
	}
	return conn, key
}

func waitForMigrationLocks(t *testing.T, ctx context.Context, conn *pgx.Conn, name string, want int) {
	t.Helper()
	tick := time.NewTicker(10 * time.Millisecond)
	defer tick.Stop()
	for {
		var n int
		if err := conn.QueryRow(ctx,
			`SELECT count(*) FROM pg_stat_activity
			 WHERE application_name = $1 AND query LIKE $2 AND pid <> pg_backend_pid()`,
			name, "%advisory_lock%").Scan(&n); err != nil {
			t.Fatal(err)
		}
		if n == want {
			return
		}
		select {
		case <-ctx.Done():
			t.Fatalf("waiting for %d migration lock attempts: %v", want, ctx.Err())
		case <-tick.C:
		}
	}
}

func TestTwoSchemasShareADatabase(t *testing.T) {
	a := pgdbtest.Migrated(t, urlEnv, migrations())
	b := pgdbtest.Migrated(t, urlEnv, migrations())
	if _, err := a.Exec(t.Context(), "INSERT INTO widgets VALUES (1, 'a')"); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := b.QueryRow(t.Context(), "SELECT count(*) FROM widgets").Scan(&n); err != nil || n != 0 {
		t.Errorf("schema b sees %d of schema a's widgets (%v)", n, err)
	}
}

func TestSchemaIsDroppedAfterTheTest(t *testing.T) {
	var schema string
	t.Run("inner", func(t *testing.T) {
		schema = pgdb.Schema(pgdbtest.Migrated(t, urlEnv, migrations()))
	})
	if schema == "" {
		t.Skip("no test database")
	}
	pool := pgdbtest.Open(t, urlEnv, "")
	var exists bool
	if err := pool.QueryRow(context.WithoutCancel(t.Context()),
		"SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1)", schema).Scan(&exists); err != nil || exists {
		t.Errorf("schema %s left behind (%v)", schema, err)
	}
}
