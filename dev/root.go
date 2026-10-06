package dev

import (
	"log/slog"
	"os"
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
			NoColor:    os.Getenv("NO_COLOR") != "",
		}))
	}

	root := &cobra.Command{
		Use:           "dev",
		Short:         "Run local development tasks",
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	root.PersistentFlags().BoolVarP(&verbose, "verbose", "v", false, "log debug output")
	root.PersistentFlags().StringVar(&cfg.Dir, "dir", cfg.Dir, "directory for Postgres data and S3 objects")

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
