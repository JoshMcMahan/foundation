package dev

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"sync"
	"time"
)

// stopGrace bounds a server's or process's graceful shutdown before it is
// killed; servers drain requests on SIGTERM.
const stopGrace = 10 * time.Second

// Up runs the stack and the services until ctx ends: those named, or every
// service not marked Manual. Each service's output is prefixed with its name
// and also written to its log under cfg.Dir.
func Up(ctx context.Context, cfg Config, logger *slog.Logger, out io.Writer, names ...string) error {
	for {
		s, err := newSupervisor(ctx, cfg, logger, out)
		if err != nil {
			return err
		}
		err = s.run(ctx, names...)
		if !errors.Is(err, errSwitch) {
			return err
		}
		cfg.Active = s.switchTo
		logger.InfoContext(ctx, "switching profiles", "profiles", strings.Join(s.switchTo, ","))
	}
}

func (c Config) selectServices(names []string) ([]Service, error) {
	if len(names) == 0 {
		var services []Service
		for _, svc := range c.Services {
			if !svc.Manual {
				services = append(services, svc)
			}
		}
		return services, nil
	}
	services := make([]Service, 0, len(names))
	added := map[string]bool{}
	// A named service brings what it depends on, first.
	var add func(name string) error
	add = func(name string) error {
		if added[name] {
			return nil
		}
		i := slices.IndexFunc(c.Services, func(s Service) bool { return s.Name == name })
		if i < 0 {
			return fmt.Errorf("no service named %q", name)
		}
		added[name] = true
		for _, dep := range c.Services[i].DependsOn {
			if err := add(dep); err != nil {
				return err
			}
		}
		services = append(services, c.Services[i])
		return nil
	}
	for _, name := range names {
		if err := add(name); err != nil {
			return nil, err
		}
	}
	return services, nil
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

func runProcess(ctx context.Context, svc Service, env []string, out *lineWriter, logger *slog.Logger, set func(state, string)) {
	defer out.flush()
	var retry backoff
	for {
		started := time.Now()
		proc, err := startProc(svc.Run, svc.Dir, env, out)
		if err != nil {
			logger.ErrorContext(ctx, "start", "error", err)
			set(stateExited, err.Error())
			return
		}
		set(stateRunning, "")
		select {
		case <-ctx.Done():
			proc.stop()
			return
		case <-proc.done:
			proc.drain()
		}
		status := exitStatus(proc.err)
		if proc.err == nil && svc.Once {
			logger.InfoContext(ctx, "finished")
			set(stateFinished, "")
			return
		}
		if proc.err == nil || svc.Restart != "on-failure" {
			logger.WarnContext(ctx, "exited", "status", status)
			set(stateExited, status)
			return
		}
		wait := retry.next(time.Since(started))
		logger.WarnContext(ctx, "exited; restarting", "status", status, "in", wait)
		set(stateExited, fmt.Sprintf("%s; restarting in %s", status, wait))
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
	}
}

// backoff spaces out restarts of a service that keeps failing, and starts
// over once it has run a while.
type backoff struct{ wait time.Duration }

func (b *backoff) next(ran time.Duration) time.Duration {
	if b.wait == 0 || ran > 30*time.Second {
		b.wait = time.Second
	} else {
		b.wait = min(b.wait*2, 30*time.Second)
	}
	return b.wait
}

func runServer(ctx context.Context, cfg Config, svc Service, env []string, builds chan struct{}, out *lineWriter, logger *slog.Logger, set func(state, string)) {
	defer out.flush()
	// The stack's own data and logs change constantly and are never source.
	var files []string
	if svc.RebuildOnCheckout {
		head, err := gitHead(ctx, svc.Dir)
		if err != nil {
			logger.WarnContext(ctx, "rebuildOnCheckout: not a git checkout", "error", err)
		} else {
			files = append(files, head)
		}
	}
	w, err := newWatcher(svc.Watch, append([]string{cfg.Dir}, svc.Exclude...), svc.Extensions, files, logger)
	if err != nil {
		logger.ErrorContext(ctx, "watch", "error", err)
		return
	}
	changed := make(chan struct{}, 1)
	go w.run(ctx, changed)

	var server *proc
	var retry backoff
	var serverStarted time.Time
	defer func() {
		if server != nil {
			server.stop()
		}
	}()
	for {
		set(stateBuilding, "")
		start := time.Now()
		built := build(ctx, svc, env, builds, out)
		if ctx.Err() != nil {
			return
		}
		if server != nil {
			server.stop()
			server = nil
		}
		if built {
			logger.InfoContext(ctx, "built", "in", time.Since(start).Round(time.Millisecond))
			serverStarted = time.Now()
			if server, err = startProc(svc.Run, svc.Dir, env, out); err != nil {
				logger.ErrorContext(ctx, "start", "error", err)
				set(stateExited, err.Error())
			} else {
				set(stateRunning, "")
			}
		} else {
			logger.ErrorContext(ctx, "build failed; waiting for a change")
			set(stateFailed, "build failed")
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
			status := exitStatus(server.err)
			if svc.Restart == "on-failure" && server.err != nil {
				wait := retry.next(time.Since(serverStarted))
				logger.WarnContext(ctx, "exited; restarting", "status", status, "in", wait)
				set(stateExited, fmt.Sprintf("%s; restarting in %s", status, wait))
				server = nil
				select {
				case <-ctx.Done():
					return
				case <-changed:
				case <-time.After(wait):
				}
				continue
			}
			logger.WarnContext(ctx, "exited; waiting for a change", "status", status)
			set(stateExited, status)
			server = nil
			select {
			case <-ctx.Done():
				return
			case <-changed:
			}
		}
	}
}

func build(ctx context.Context, svc Service, env []string, builds chan struct{}, out io.Writer) bool {
	select {
	case builds <- struct{}{}:
		defer func() { <-builds }()
	case <-ctx.Done():
		return false
	}
	p, err := startProc(svc.Build, svc.Dir, env, out)
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

// outputs prefixes each source's lines with its name, padded to align, and
// writes them unprefixed to the source's log.
type outputs struct {
	mu     sync.Mutex
	out    io.Writer
	logs   string
	files  []*os.File
	width  int
	color  bool
	next   int
	rings  map[string]*ring
	all    *ring    // every source's lines, prefixed
	allLog *os.File // the same, for a view attached from elsewhere
}

func newOutputs(out io.Writer, cfg Config, services []Service) (*outputs, error) {
	logs := filepath.Join(cfg.Dir, "logs")
	if err := os.MkdirAll(logs, 0o750); err != nil {
		return nil, err
	}
	o := &outputs{out: out, logs: logs, width: len("before"), color: colorEnabled(out), rings: map[string]*ring{}, all: newRing(allLines)}
	if f, err := os.Create(LogPath(logs, "all")); err == nil {
		o.allLog = f
		o.files = append(o.files, f)
	}
	for _, svc := range services {
		o.width = max(o.width, len(svc.Name))
	}
	return o, nil
}

// Distinct from tint's level colors, so a line's source and severity differ.
var palette = []string{"36", "35", "34", "33", "32"}

func (o *outputs) writer(name string) *lineWriter {
	prefix := fmt.Sprintf("%-*s │ ", o.width, name)
	if o.color {
		prefix = "\x1b[" + palette[o.next%len(palette)] + "m" + prefix + "\x1b[0m"
		o.next++
	}
	r := newRing(serviceLines)
	o.rings[name] = r
	plain := fmt.Sprintf("%-*s │ ", o.width, name)
	w := &lineWriter{mu: &o.mu, out: o.out, prefix: prefix, sink: func(line string) {
		r.add(line)
		o.all.add(plain + line)
		if o.allLog != nil {
			_, _ = o.allLog.WriteString(plain + line + "\n")
		}
	}}
	// Each run starts its logs afresh; a log that cannot be opened only
	// costs the copy, never the terminal output.
	if f, err := os.Create(LogPath(o.logs, name)); err == nil {
		o.files = append(o.files, f)
		w.log = f
	}
	return w
}

// recent returns a source's recent lines, or every source's when name is
// empty.
func (o *outputs) recent(name string) []string {
	o.mu.Lock()
	defer o.mu.Unlock()
	if name == "" {
		return o.all.lines()
	}
	if r := o.rings[name]; r != nil {
		return r.lines()
	}
	return nil
}

// How much output the TUI can scroll back through.
const (
	serviceLines = 2000
	allLines     = 5000
)

// ring keeps the last lines written to it. Its owner's mutex guards it.
type ring struct {
	buf  []string
	next int
	full bool
}

func newRing(n int) *ring { return &ring{buf: make([]string, n)} }

func (r *ring) add(line string) {
	r.buf[r.next] = line
	r.next = (r.next + 1) % len(r.buf)
	if r.next == 0 {
		r.full = true
	}
}

func (r *ring) lines() []string {
	if !r.full {
		return slices.Clone(r.buf[:r.next])
	}
	return append(slices.Clone(r.buf[r.next:]), r.buf[:r.next]...)
}

func (o *outputs) close() {
	for _, f := range o.files {
		_ = f.Close()
	}
}

// LogPath is where a service's output from the latest run is kept, given the
// directory of a stack's logs.
func LogPath(logs, service string) string {
	return filepath.Join(logs, service+".log")
}

// gitHead is the file git rewrites when the checkout's branch changes; in a
// worktree it lives in the main repository's .git.
func gitHead(ctx context.Context, dir string) (string, error) {
	out, err := exec.CommandContext(ctx, "git", "-C", dir, "rev-parse", "--path-format=absolute", "--git-path", "HEAD").Output() //nolint:gosec // git, in the service.s own directory
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}
