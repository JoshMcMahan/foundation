package dev

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"strings"
	"sync"
	"time"
)

// stopGrace bounds a server's or process's graceful shutdown before it is
// killed; servers drain requests on SIGTERM.
const stopGrace = 10 * time.Second

// Up runs the stack, the server and the processes until ctx ends. The server
// is rebuilt and restarted when its sources change; a failed build stops it,
// so that nothing is tested against stale code.
func Up(ctx context.Context, cfg Config, logger *slog.Logger, out io.Writer) error {
	cfg, err := cfg.withDefaults()
	if err != nil {
		return err
	}
	env, err := environ(cfg.Env)
	if err != nil {
		return err
	}
	o := newOutputs(out, cfg)
	if err := runBefore(ctx, cfg, env, o.writer("before")); err != nil || ctx.Err() != nil {
		return err
	}

	if cfg.Postgres != nil || cfg.S3 != nil {
		stack, err := StartStack(ctx, cfg, logger)
		if err != nil {
			return err
		}
		defer func() {
			if err := stack.Stop(context.WithoutCancel(ctx)); err != nil {
				logger.ErrorContext(ctx, "stop stack", "error", err)
			}
		}()
	}

	var wg sync.WaitGroup
	for _, p := range cfg.Processes {
		w := o.writer(p.Name)
		wg.Go(func() { runProcess(ctx, p, cfg.path(p.Dir), env, w, logger) })
	}
	if cfg.Server != nil {
		w := o.writer("server")
		wg.Go(func() { runServer(ctx, cfg, env, w, logger) })
	}
	wg.Wait()
	return nil
}

func runBefore(ctx context.Context, cfg Config, env []string, out *lineWriter) error {
	defer out.flush()
	for _, cmd := range cfg.Before {
		p, err := startProc(cmd, cfg.Root, env, out)
		if err != nil {
			return fmt.Errorf("before: %w", err)
		}
		select {
		case <-ctx.Done():
			p.stop()
			return nil
		case <-p.done:
			p.drain()
		}
		if p.err != nil {
			return fmt.Errorf("before: %s: %s", strings.Join(cmd, " "), exitStatus(p.err))
		}
	}
	return nil
}

func runProcess(ctx context.Context, p Process, dir string, env []string, out *lineWriter, logger *slog.Logger) {
	defer out.flush()
	proc, err := startProc(p.Run, dir, env, out)
	if err != nil {
		logger.ErrorContext(ctx, "start", "process", p.Name, "error", err)
		return
	}
	select {
	case <-ctx.Done():
		proc.stop()
	case <-proc.done:
		proc.drain()
		// Left stopped: restarting a process that fails at startup would
		// bury its error under repeats.
		logger.WarnContext(ctx, "exited", "process", p.Name, "status", exitStatus(proc.err))
	}
}

func runServer(ctx context.Context, cfg Config, env []string, out *lineWriter, logger *slog.Logger) {
	defer out.flush()
	dirs := make([]string, len(cfg.Server.Watch))
	for i, d := range cfg.Server.Watch {
		dirs[i] = cfg.path(d)
	}
	// The stack's own data changes constantly and is never source.
	w, err := newWatcher(dirs, append([]string{cfg.Dir}, cfg.Server.Exclude...), cfg.Server.Extensions, logger)
	if err != nil {
		logger.ErrorContext(ctx, "watch", "error", err)
		return
	}
	changed := make(chan struct{}, 1)
	go w.run(ctx, changed)

	var server *proc
	defer func() {
		if server != nil {
			server.stop()
		}
	}()
	for {
		start := time.Now()
		built := build(ctx, cfg, env, out)
		if ctx.Err() != nil {
			return
		}
		if server != nil {
			server.stop()
			server = nil
		}
		if built {
			logger.InfoContext(ctx, "built", "in", time.Since(start).Round(time.Millisecond))
			if server, err = startProc(cfg.Server.Run, cfg.Root, env, out); err != nil {
				logger.ErrorContext(ctx, "start server", "error", err)
			}
		} else {
			logger.ErrorContext(ctx, "build failed; waiting for a change")
		}

		var exited <-chan struct{}
		if server != nil {
			exited = server.done
		}
		select {
		case <-ctx.Done():
			return
		case <-changed:
		case <-exited:
			logger.WarnContext(ctx, "server exited; waiting for a change", "status", exitStatus(server.err))
			server = nil
			select {
			case <-ctx.Done():
				return
			case <-changed:
			}
		}
	}
}

func build(ctx context.Context, cfg Config, env []string, out io.Writer) bool {
	p, err := startProc(cfg.Server.Build, cfg.Root, env, out)
	if err != nil {
		fmt.Fprintln(out, err)
		return false
	}
	select {
	case <-ctx.Done():
		p.stop()
		return false
	case <-p.done:
		return p.err == nil
	}
}

// outputs prefixes each source's lines with its name, padded to align.
type outputs struct {
	mu    sync.Mutex
	out   io.Writer
	width int
	color bool
	next  int
}

func newOutputs(out io.Writer, cfg Config) *outputs {
	o := &outputs{out: out, width: len("server"), color: colorEnabled(out)}
	for _, p := range cfg.Processes {
		o.width = max(o.width, len(p.Name))
	}
	return o
}

// Distinct from tint's level colors, so a line's source and severity differ.
var palette = []string{"36", "35", "34", "33", "32"}

func (o *outputs) writer(name string) *lineWriter {
	prefix := fmt.Sprintf("%-*s │ ", o.width, name)
	if o.color {
		prefix = "\x1b[" + palette[o.next%len(palette)] + "m" + prefix + "\x1b[0m"
		o.next++
	}
	return &lineWriter{mu: &o.mu, out: o.out, prefix: prefix}
}
