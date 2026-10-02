module github.com/parallelworks/foundation

go 1.27.0

// Enforce FIPS 140-3 mode everywhere, including `go test`: non-approved
// algorithms fail at runtime.
godebug fips140=only

require (
	github.com/danielgtaylor/huma/v2 v2.39.1
	github.com/jackc/pgx/v5 v5.11.0
	github.com/parallelworks/hopper v0.3.1
	github.com/pressly/goose/v3 v3.28.0
	github.com/quasilyte/go-ruleguard v0.4.5
	github.com/quasilyte/go-ruleguard/dsl v0.3.23
	golang.org/x/sync v0.23.0
	golang.org/x/text v0.42.0
	golang.org/x/tools v0.50.0
)

require (
	github.com/go-toolsmith/astcopy v1.0.2 // indirect
	github.com/go-toolsmith/astequal v1.0.3 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.2 // indirect
	github.com/mfridman/interpolate v0.0.2 // indirect
	github.com/quasilyte/gogrep v0.5.0 // indirect
	github.com/quasilyte/stdinfo v0.0.0-20220114132959-f7386bf02567 // indirect
	github.com/sethvargo/go-retry v0.4.0 // indirect
	go.uber.org/multierr v1.11.0 // indirect
	golang.org/x/exp/typeparams v0.0.0-20240213143201-ec583247a57a // indirect
	golang.org/x/mod v0.41.0 // indirect
)
