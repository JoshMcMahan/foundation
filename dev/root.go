package dev

import (
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/lmittmann/tint"
	"github.com/spf13/cobra"
)

// NewRootCmd returns the dev command with the standard subcommands. An app
// with its own development tasks adds them with AddCommand.
func NewRootCmd(cfg Config) *cobra.Command {
	var verbose bool
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
		Use:   "dev",
		Short: "Run the stack, the server with hot reload, and the app's processes",
		Long: "With no command, dev runs everything dev.json describes until interrupted: " +
			"Postgres and S3, the server (rebuilt when its sources change) and the processes beside it.",
		Args:          cobra.NoArgs,
		SilenceUsage:  true,
		SilenceErrors: true,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return Up(cmd.Context(), cfg, logger(), os.Stdout)
		},
	}
	root.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "log debug output")
	var dir string
	root.PersistentFlags().StringVar(&dir, "dir", "", "directory for Postgres data and S3 objects (default .devstack beside dev.json)")
	root.PersistentPreRunE = func(*cobra.Command, []string) error {
		if dir == "" {
			return nil
		}
		// A flag is relative to where it was typed, not to the root.
		abs, err := filepath.Abs(dir)
		cfg.Dir = abs
		return err
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
		Use:   "wait",
		Short: "Wait until a running stack accepts connections",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return WaitStack(cmd.Context(), cfg, timeout)
		},
	}
	wait.Flags().DurationVar(&timeout, "timeout", 2*time.Minute, "how long to wait")
	root.AddCommand(wait)

	root.AddCommand(&cobra.Command{
		Use:   "reset",
		Short: "Delete the stack's Postgres and S3 data",
		Args:  cobra.NoArgs,
		RunE: func(cmd *cobra.Command, _ []string) error {
			return ResetStack(cmd.Context(), cfg, logger())
		},
	})
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
