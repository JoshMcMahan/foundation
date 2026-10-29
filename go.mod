module github.com/parallelworks/foundation

go 1.27.3

// Enforce FIPS 140-3 mode everywhere, including `go test`: non-approved
// algorithms fail at runtime.
godebug fips140=only

require (
	github.com/danielgtaylor/huma/v2 v2.40.0
	github.com/jackc/pgx/v5 v5.11.0
	github.com/pressly/goose/v3 v3.29.0
	github.com/quasilyte/go-ruleguard v0.4.5
	github.com/quasilyte/go-ruleguard/dsl v0.3.23
	golang.org/x/sync v0.24.0
	golang.org/x/text v0.43.0
	golang.org/x/tools v0.52.0
)

require (
	github.com/go-toolsmith/astcopy v1.1.0 // indirect
	github.com/go-toolsmith/astequal v1.2.0 // indirect
	github.com/google/go-cmp v0.7.0 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/jackc/puddle/v2 v2.2.3 // indirect
	github.com/mfridman/interpolate v0.0.2 // indirect
	github.com/quasilyte/gogrep v0.5.0 // indirect
	github.com/quasilyte/stdinfo v0.0.0-20220114132959-f7386bf02567 // indirect
	github.com/sethvargo/go-retry v0.5.0 // indirect
	go.uber.org/multierr v1.11.0 // indirect
	golang.org/x/exp/typeparams v0.0.0-20261014143641-f0251eb4aa3e // indirect
	golang.org/x/mod v0.42.0 // indirect
)
