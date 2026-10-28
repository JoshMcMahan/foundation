// Package logctx carries structured loggers through a context.
package logctx

import (
	"context"
	"log/slog"
)

type loggerKey struct{}

// WithContext preserves the logger's handler and attributes.
func WithContext(ctx context.Context, logger *slog.Logger) context.Context {
	return context.WithValue(ctx, loggerKey{}, logger)
}

// FromContext falls back to slog.Default when no logger is attached.
func FromContext(ctx context.Context) *slog.Logger {
	if logger, ok := ctx.Value(loggerKey{}).(*slog.Logger); ok && logger != nil {
		return logger
	}
	return slog.Default()
}
