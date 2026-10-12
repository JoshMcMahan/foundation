package dev

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/lmittmann/tint"
	"github.com/spf13/cobra"
)

// NewRootCmd returns the dev command with the standard subcommands. An app
// with its own development tasks adds them with AddCommand, and extends the
// view and the MCP server with options.
func NewRootCmd(cfg Config, opts ...Option) *cobra.Command {
	var ext extension
	for _, o := range opts {
		o(&ext)
	}
	for _, k := range ext.keys {
		if viewKeys[k.Key] {
			// A programming error in the app's own dev, found on its first run.
			panic(fmt.Sprintf("dev.WithKey: %q is one of the view's own keys", k.Key))
		}
	}
	var verbose, plain bool
	var profiles []string
	var lifetime time.Duration
	logger := func() *slog.Logger {
		level := slog.LevelInfo
		if verbose {
			level = slog.LevelDebug
		}
		return slog.New(tint.NewTextHandler(os.Stderr, &tint.Options{
			Level:      level,
			TimeFormat: time.TimeOnly,
			NoColor:    !colorEnabled(os.Stderr),
		}))
	}

	root := &cobra.Command{
		Use:   "dev [service...]",
		Short: "Run the stack and the app's services, rebuilding servers when their sources change",
		Long: "With no command, dev runs what dev.json describes until interrupted: Postgres and S3, " +
			"and the services named, or every service not marked manual. In a terminal it shows them in an " +
			"interactive view; where a dev already runs in this checkout, the view attaches to it.\n\n" +
			"Each checkout runs its own dev, on ports of its own when the preferred ones are taken. " +
			"dev.json, at the repository root, describes the app: see " +
			"https://github.com/parallelworks/foundation/tree/canary/dev.",
		Example: `  dev                     # every service, in the interactive view
  dev web api             # only these, and what they depend on
  dev up && dev status    # in the background, then what runs and where
  dev logs api            # its output, from another terminal or a tool
  dev exec -- go test ./... # with this checkout's ports and database
  dev down`,
		Args:          cobra.ArbitraryArgs,
		Version:       version(),
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, names []string) error {
			ctx := cmd.Context()
			if lifetime > 0 {
				var cancel context.CancelFunc
				ctx, cancel = context.WithTimeout(ctx, lifetime)
				defer cancel()
			}
			if !plain && interactive() {
				return runTUI(ctx, cfg, names, ext)
			}
			return Up(ctx, cfg, logger(), os.Stdout, names...)
		},
	}
	root.Flags().DurationVar(&lifetime, "for", 0, "stop after this long, such as 2h (default: until interrupted)")
	root.Flags().BoolVar(&plain, "plain", false, "print prefixed output instead of the interactive view")
	root.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "log debug output")
	var dir string
	root.PersistentFlags().StringVar(&dir, "dir", "", "directory for Postgres data and S3 objects (default .devstack beside dev.json)")
	root.PersistentFlags().StringSliceVar(&profiles, "profile", nil, "use these profiles, and keep using them in this checkout (see dev profiles)")
	root.PersistentPreRunE = func(*cobra.Command, []string) error {
		if dir != "" {
			// A flag is relative to where it was typed, not to the root.
			abs, err := filepath.Abs(dir)
			if err != nil {
				return err
			}
			cfg.Dir = abs
		}
		if profiles == nil {
			return nil
		}
		cfg.Active = profiles
		c, err := cfg.withDefaults()
		if err != nil {
			return err
		}
		return c.chooseProfiles(profiles)
	}

	root.AddCommand(&cobra.Command{
		Use:   "stack",
		Short: "Run Postgres and S3 until interrupted",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			ctx := cmd.Context()
			stack, err := StartStack(ctx, cfg, logger())
			if err != nil {
				return err
			}
			<-ctx.Done()
			return stack.Stop(ctx)
		},
	})

	var timeout time.Duration
	wait := &cobra.Command{
		Use:   "wait [service...]",
		Short: "Wait until a running stack accepts connections, or until services are up",
		Long: "With no services, wait until the stack accepts connections. With services, wait until each " +
			"is ready (or running, without a health URL), and fail as soon as one fails, exits or turns unhealthy.",
		Example: `  dev wait                # the stack accepts connections
  dev wait --timeout 5m api web`,
		RunE: func(cmd *cobra.Command, names []string) error {
			if len(names) > 0 {
				return waitServices(cmd.Context(), cfg, names, timeout)
			}
			return WaitStack(cmd.Context(), cfg, timeout)
		},
	}
	wait.Flags().DurationVar(&timeout, "timeout", 2*time.Minute, "how long to wait")
	root.AddCommand(wait)

	var statusJSON bool
	status := &cobra.Command{
		Use:   "status",
		Short: "Show the services of the dev running here",
		Long: "Show each service of the dev running in this checkout: its state, how long it has had it, and its URL. " +
			"--json adds the instance: its ports, PID, version and profiles.",
		Example: `  dev status
  dev status --json | jq .info.ports`,
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			command := "status"
			if statusJSON {
				command = "info" // services too, and the instance: ports, pid, version
			}
			resp, err := controlFull(cmd.Context(), cfg, controlRequest{Command: command})
			if err != nil {
				return err
			}
			if statusJSON {
				return printJSON(cmd.OutOrStdout(), resp)
			}
			if resp.Starting != "" {
				fmt.Fprintf(cmd.OutOrStdout(), "dev is %s…\n", resp.Starting)
			}
			printStatuses(cmd.OutOrStdout(), resp.Services)
			return nil
		},
	}
	status.Flags().BoolVar(&statusJSON, "json", false, "print services, their states and URLs, and the instance's ports as JSON")
	root.AddCommand(status)

	var upTimeout time.Duration
	upCmd := &cobra.Command{
		Use:   "up [service...]",
		Short: "Start dev in the background, and return once its services are up",
		Long: "Start dev in the background, in its own session so that closing the terminal does not stop it, " +
			"and return once the services named (or every one not marked manual) are up, or with why they are not. " +
			"`dev down` stops it; it also stops itself if the checkout is deleted, or after --for.",
		Example: `  dev up                  # every service not marked manual
  dev up --for 2h api     # api and what it depends on, stopping after two hours`,
		RunE: func(cmd *cobra.Command, names []string) error {
			args := slices.Clone(names)
			if lifetime > 0 {
				args = append(args, "--for", lifetime.String())
			}
			if dir != "" {
				args = append(args, "--dir", cfg.Dir)
			}
			if profiles != nil {
				args = append(args, "--profile", strings.Join(profiles, ","))
			}
			return up(cmd.Context(), cfg, args, names, upTimeout, cmd.OutOrStdout())
		},
	}
	upCmd.Flags().DurationVar(&lifetime, "for", 0, "stop after this long, such as 2h")
	upCmd.Flags().DurationVar(&upTimeout, "timeout", 5*time.Minute, "how long to wait for the services")
	root.AddCommand(upCmd)

	root.AddCommand(&cobra.Command{
		Use:   "mcp",
		Short: "Answer MCP over stdio, so an agent can drive this checkout's dev as tools",
		Long: "Answer the Model Context Protocol over stdin and stdout. An agent configured to run " +
			"`dev mcp` in the repository, as .mcp.json does, gets tools to start dev in the background (up), see services, their states, " +
			"URLs and ports (status), read output (logs), start, stop and restart services, wait for them, and stop dev (down).",
		Args: cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return serveMCP(cmd.Context(), cfg, ext)
		},
	})

	root.AddCommand(&cobra.Command{
		Use:   "down [checkout]",
		Short: "Stop the dev running here, foreground or background",
		Long: "Stop the dev running in this checkout, whether in a terminal or started with dev up, and every service it started. " +
			"Name a checkout, as dev ps lists them, to stop the dev running there instead, from anywhere.",
		Example: `  dev down
  dev down ~/src/shop-feature`,
		Args:        cobra.MaximumNArgs(1),
		Annotations: map[string]string{anywhere: "yes"},
		RunE: func(cmd *cobra.Command, args []string) error {
			if len(args) == 1 {
				in, err := instanceAt(cmd.Context(), args[0])
				if err != nil {
					return err
				}
				return down(cmd.Context(), Config{Root: in.Root, Dir: in.Dir})
			}
			if cfg.Root == "" {
				return errors.New("no dev.json here or in its parents; name a checkout to stop, as dev ps lists them")
			}
			return down(cmd.Context(), cfg)
		},
	})

	root.AddCommand(&cobra.Command{
		Use:   "profiles",
		Short: "List the profiles dev.json defines, marking those this checkout uses",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			c, err := cfg.withDefaults()
			if err != nil {
				return err
			}
			for _, name := range slices.Sorted(maps.Keys(c.Profiles)) {
				p := c.Profiles[name]
				mark := " "
				if slices.Contains(c.active, name) {
					mark = "*"
				}
				line := fmt.Sprintf("%s %s", mark, name)
				if len(p.Include) > 0 {
					line += " (" + strings.Join(p.Include, " + ") + ")"
				}
				if p.Description != "" {
					line += ": " + p.Description
				}
				fmt.Fprintln(cmd.OutOrStdout(), line)
			}
			return nil
		},
	})

	root.AddCommand(&cobra.Command{
		Use:   "use profile[,profile...]",
		Short: "Switch this checkout to other profiles, restarting the dev running here",
		Long: "Choose the profiles this checkout uses from now on, such as `dev use local` or " +
			"`dev use local-db,remote-cache`. A dev running here stops its services and starts again with them, " +
			"keeping its ports where they are free.",
		Example: `  dev use local
  dev use canary,socks`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			names := strings.Split(args[0], ",")
			next := cfg
			next.Active = names
			c, err := next.withDefaults()
			if err != nil {
				return err
			}
			if _, err := controlFull(cmd.Context(), cfg, controlRequest{Command: "use", Profiles: names}); err != nil {
				if !errors.Is(err, errNotRunning) {
					return err
				}
				if err := c.chooseProfiles(names); err != nil {
					return err
				}
				fmt.Fprintf(cmd.OutOrStdout(), "this checkout uses %s from its next start\n", strings.Join(c.active, " + "))
				return nil
			}
			// Wait for dev to come back on them.
			ctx, cancel := context.WithTimeout(cmd.Context(), 5*time.Minute)
			defer cancel()
			for {
				resp, err := controlFull(ctx, cfg, controlRequest{Command: "info"})
				if err == nil && resp.Starting == "" && resp.Info != nil && slices.Equal(resp.Info.Profiles, c.active) {
					fmt.Fprintf(cmd.OutOrStdout(), "dev runs with %s\n", strings.Join(c.active, " + "))
					return nil
				}
				select {
				case <-ctx.Done():
					return errors.New("dev did not come back in time; see `dev status`")
				case <-time.After(300 * time.Millisecond):
				}
			}
		},
	})

	var psJSON bool
	psCmd := &cobra.Command{
		Use:         "ps",
		Short:       "List every dev running on this machine",
		Args:        cobra.NoArgs,
		Annotations: map[string]string{anywhere: "yes"},
		RunE: func(cmd *cobra.Command, _ []string) error {
			list, err := Instances(cmd.Context())
			if err != nil {
				return err
			}
			if psJSON {
				return printJSON(cmd.OutOrStdout(), list)
			}
			for _, in := range list {
				fmt.Fprintf(cmd.OutOrStdout(), "%-7d %5s  %-10s %s  %s\n", in.PID, strings.TrimSpace(since(in.Started)), in.Version, in.Root, formatPorts(in.Ports))
			}
			// For a person only: stdout stays the table for scripts.
			if len(list) > 0 && isTerminal(os.Stderr) {
				fmt.Fprintln(cmd.ErrOrStderr(), "stop one: dev down <checkout>, or kill <pid>")
			}
			return nil
		},
	}
	psCmd.Flags().BoolVar(&psJSON, "json", false, "print as JSON")
	root.AddCommand(psCmd)

	root.AddCommand(&cobra.Command{
		Use:   "exec -- command [arg...]",
		Short: "Run a command with the running dev's environment",
		Long: "Run a command with the environment the running dev gives its services, under your own: " +
			"allocated ports, {postgres}, {s3} and the rest. Tests, migrations and scripts then reach this checkout's stack.",
		Example: `  dev exec -- go test ./...
  dev exec -- psql "$DATABASE_URL"`,
		Args: cobra.MinimumNArgs(1),
		RunE: func(cmd *cobra.Command, argv []string) error {
			return execWith(cmd.Context(), cfg, argv)
		},
	})
	for _, c := range []struct{ name, short string }{
		{"start", "Start a service in the dev running here"},
		{"stop", "Stop a service in the dev running here"},
		{"restart", "Restart a service in the dev running here, rebuilding a server"},
	} {
		root.AddCommand(&cobra.Command{
			Use:   c.name + " service",
			Short: c.short,
			Long: c.short + ", from another terminal or a tool while it runs, foreground or background. " +
				"It prints every service's state after.",
			Example: "  dev " + c.name + " web",
			Args:    cobra.ExactArgs(1),
			RunE: func(cmd *cobra.Command, args []string) error {
				services, err := control(cmd.Context(), cfg, controlRequest{Command: c.name, Service: args[0]})
				if err != nil {
					return err
				}
				printStatuses(cmd.OutOrStdout(), services)
				return nil
			},
		})
	}

	var follow bool
	logs := &cobra.Command{
		Use:   "logs [service...]",
		Short: "Print services' output from the latest run",
		Long: "Print services' output from the latest run, as dev wrote it to their logs: one service as it is, " +
			"several (or, with none named, every service) with each line prefixed by its service. " +
			"Use it from another terminal, or from a tool, while dev runs.",
		Example: `  dev logs api
  dev logs                # every service, prefixed`,
		RunE: func(cmd *cobra.Command, names []string) error {
			c, err := cfg.withDefaults()
			if err != nil {
				return err
			}
			if len(names) == 0 {
				for _, svc := range c.Services {
					names = append(names, svc.Name)
				}
			}
			return printLogs(cmd.Context(), filepath.Join(c.Dir, "logs"), names, follow, cmd.OutOrStdout())
		},
	}
	logs.Flags().BoolVarP(&follow, "follow", "f", false, "keep printing new output until interrupted")
	root.AddCommand(logs)

	root.AddCommand(&cobra.Command{
		Use:   "reset",
		Short: "Delete the stack's Postgres and S3 data",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return ResetStack(cmd.Context(), cfg, logger())
		},
	})
	root.AddCommand(newCleanCmd(&verbose))
	return root
}

// colorEnabled follows the NO_COLOR convention, and keeps escape codes out
// of files and pipes.
func colorEnabled(w io.Writer) bool {
	f, ok := w.(*os.File)
	if !ok || os.Getenv("NO_COLOR") != "" {
		return false
	}
	info, err := f.Stat()
	return err == nil && info.Mode()&os.ModeCharDevice != 0
}

// printLogs prints services' logs, prefixing lines with their service when
// there are several. Following, it interleaves them as they grow.
func printLogs(ctx context.Context, dir string, names []string, follow bool, out io.Writer) error {
	if len(names) == 1 {
		return printLog(ctx, LogPath(dir, names[0]), follow, out)
	}
	width := 0
	for _, n := range names {
		width = max(width, len(n))
	}
	var mu sync.Mutex
	errs := make([]error, len(names))
	var wg sync.WaitGroup
	for i, name := range names {
		w := &lineWriter{mu: &mu, out: out, prefix: fmt.Sprintf("%-*s │ ", width, name)}
		run := func() {
			errs[i] = printLog(ctx, LogPath(dir, name), follow, w)
			w.flush()
		}
		// Without following, keep each service's lines together.
		if follow {
			wg.Go(run)
		} else {
			run()
		}
	}
	wg.Wait()
	return errors.Join(errs...)
}

// printLog copies a log to out and, when following, keeps copying what is
// appended. A new run truncates the log, which starts the copy over.
func printLog(ctx context.Context, path string, follow bool, out io.Writer) error {
	f, err := os.Open(path) //nolint:gosec // a log under the stack's directory
	if err != nil {
		return err
	}
	defer f.Close()
	var offset int64
	for {
		n, err := io.Copy(out, f)
		if err != nil {
			return err
		}
		offset += n
		if !follow {
			return nil
		}
		select {
		case <-ctx.Done():
			return nil
		case <-time.After(250 * time.Millisecond):
		}
		if info, err := f.Stat(); err == nil && info.Size() < offset {
			if _, err := f.Seek(0, io.SeekStart); err != nil {
				return err
			}
			offset = 0
		}
	}
}

// anywhere marks a command that needs no dev.json, such as `dev ps`.
const anywhere = "dev/anywhere"

// RequireConfig makes every command but those that need no dev.json fail
// with err, for a dev run where no dev.json was found.
func RequireConfig(root *cobra.Command, err error) {
	next := root.PersistentPreRunE
	root.PersistentPreRunE = func(cmd *cobra.Command, args []string) error {
		for c := cmd; c != nil; c = c.Parent() {
			if c.Annotations[anywhere] != "" || c.Name() == "help" || c.Name() == "completion" {
				if next != nil {
					return next(cmd, args)
				}
				return nil
			}
		}
		return err
	}
}

// interactive reports whether both ends of the terminal are a person, which
// the full-screen view needs; pipes, CI and tools get prefixed lines.
func interactive() bool {
	return isTerminal(os.Stdin) && isTerminal(os.Stdout) && os.Getenv("TERM") != "dumb"
}

func isTerminal(f *os.File) bool {
	info, err := f.Stat()
	return err == nil && info.Mode()&os.ModeCharDevice != 0
}

func printStatuses(w io.Writer, services []status) {
	width := 0
	for _, s := range services {
		width = max(width, len(s.Name))
	}
	for _, s := range services {
		detail := s.Detail
		if s.State == stateStopped && s.Manual {
			detail = "manual"
		}
		fmt.Fprintf(w, "%-*s  %-9s  %4s  %s\n", width, s.Name, s.State, strings.TrimSpace(since(s.Since)),
			strings.TrimSpace(strings.Join([]string{s.URL, detail}, "  ")))
	}
}

func formatPorts(ports map[string]int) string {
	parts := make([]string, 0, len(ports))
	for _, name := range slices.Sorted(maps.Keys(ports)) {
		parts = append(parts, fmt.Sprintf("%s:%d", name, ports[name]))
	}
	return strings.Join(parts, " ")
}
