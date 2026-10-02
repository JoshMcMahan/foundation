// Package pgdbtest gives integration tests an isolated schema in a test
// database.
package pgdbtest

import (
	"context"
	"crypto/rand"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/parallelworks/foundation/pgdb"
)

// Schema reserves a fresh schema name in the database whose URL is in the
// environment variable urlEnv, dropped when the test ends, and returns the
// URL with it. It skips the test when urlEnv is not set.
func Schema(tb testing.TB, urlEnv string) (url, schema string) {
	tb.Helper()
	url = os.Getenv(urlEnv)
	if url == "" {
		tb.Skip(urlEnv + " not set")
	}
	schema = "test_" + strings.ToLower(rand.Text())
	base := tb.Context()
	tb.Cleanup(func() {
		// tb.Context is already canceled during cleanup.
		ctx := context.WithoutCancel(base)
		conn, err := pgx.Connect(ctx, url)
		if err != nil {
			tb.Errorf("drop schema %s: %v", schema, err)
			return
		}
		defer conn.Close(ctx)
		if _, err := conn.Exec(ctx, "DROP SCHEMA IF EXISTS "+pgx.Identifier{schema}.Sanitize()+" CASCADE"); err != nil {
			tb.Errorf("drop schema %s: %v", schema, err)
		}
	})
	return url, schema
}

// Open returns a pool on a fresh, empty schema, dropped when the test ends.
// params are added to the URL's query, such as "pool_max_conns=2".
func Open(tb testing.TB, urlEnv, params string) *pgxpool.Pool {
	tb.Helper()
	url, schema := Schema(tb, urlEnv)
	if params != "" {
		sep := "?"
		if strings.Contains(url, "?") {
			sep = "&"
		}
		url += sep + params
	}
	pool, err := pgdb.Open(tb.Context(), url, schema)
	if err != nil {
		tb.Fatal(err)
	}
	tb.Cleanup(pool.Close)
	return pool
}

// Migrated is Open with hopper's tables and m applied.
func Migrated(tb testing.TB, urlEnv string, m pgdb.Migrations) *pgxpool.Pool {
	tb.Helper()
	pool := Open(tb, urlEnv, "")
	if err := pgdb.Migrate(tb.Context(), pool, m); err != nil {
		tb.Fatal(err)
	}
	return pool
}
