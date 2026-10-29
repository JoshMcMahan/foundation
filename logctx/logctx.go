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

// With enriches a child context's logger while preserving the parent's logger.
func With(ctx context.Context, args ...any) context.Context {
	if len(args) == 0 {
		return ctx
	}
	return WithContext(ctx, FromContext(ctx).With(args...))
}

// WithGroup groups subsequent attributes without regrouping existing ones.
func WithGroup(ctx context.Context, name string) context.Context {
	if name == "" {
		return ctx
	}
	return WithContext(ctx, FromContext(ctx).WithGroup(name))
}
