module github.com/parallelworks/foundation/dev

go 1.27.0

// A separate module, outside the root module's `godebug fips140=only`: the S3
// emulator computes MD5 ETags, which FIPS mode rejects at runtime. Nothing
// here is linked into a service binary; apps run it with `go tool`.

require (
	github.com/fergusstrange/embedded-postgres v1.34.0
	github.com/fsnotify/fsnotify v1.10.1
	github.com/jackc/pgx/v5 v5.11.0
	github.com/johannesboyne/gofakes3 v1.2.0
	github.com/lmittmann/tint v1.2.1
	github.com/spf13/afero v1.15.0
	github.com/spf13/cobra v1.10.2
)

require (
	github.com/inconshreveable/mousetrap v1.1.0 // indirect
	github.com/jackc/pgpassfile v1.0.0 // indirect
	github.com/jackc/pgservicefile v0.0.0-20240606120523-5a60cdf6a761 // indirect
	github.com/lib/pq v1.10.9 // indirect
	github.com/ryszard/goskiplist v0.0.0-20150312221310-2dfbae5fcf46 // indirect
	github.com/spf13/pflag v1.0.9 // indirect
	github.com/xi2/xz v0.0.0-20171230120015-48954b6210f8 // indirect
	go.shabbyrobe.org/gocovmerge v0.0.0-20230507111327-fa4f82cfbf4d // indirect
	golang.org/x/sys v0.47.0 // indirect
	golang.org/x/text v0.42.0 // indirect
	golang.org/x/tools v0.49.0 // indirect
)
