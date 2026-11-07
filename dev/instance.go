package dev

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"runtime/debug"
	"slices"
	"strings"
	"sync"
	"syscall"
	"time"
)

// Instance describes a running dev, for `dev ps` and tools.
type Instance struct {
	Root     string         `json:"root"`
	Dir      string         `json:"dir"`
	PID      int            `json:"pid"`
	Version  string         `json:"version"`
	Started  time.Time      `json:"started"`
	Ports    map[string]int `json:"ports,omitempty"`
	Profiles []string       `json:"profiles,omitempty"`
}

// version is this dev's module version, which a client compares with the
// dev it talks to.
func version() string {
	bi, ok := debug.ReadBuildInfo()
	if !ok {
		return "unknown"
	}
	for _, m := range append([]*debug.Module{&bi.Main}, bi.Deps...) {
		if m.Path == "github.com/parallelworks/foundation/dev" {
			if m.Replace != nil {
				return m.Replace.Version
			}
			return m.Version
		}
	}
	return "unknown"
}

func (s *supervisor) instance() Instance {
	ports := map[string]int{}
	for name, port := range s.cfg.ports {
		ports[name] = port
	}
	if s.cfg.Postgres != nil {
		ports["postgres"] = s.cfg.Postgres.Port
	}
	if s.cfg.S3 != nil {
		if _, p, err := net.SplitHostPort(s.cfg.S3.Addr); err == nil {
			var port int
			_, _ = fmt.Sscan(p, &port)
			ports["s3"] = port
		}
	}
	return Instance{Root: s.cfg.Root, Dir: s.cfg.Dir, PID: os.Getpid(), Version: version(), Started: s.started, Ports: ports, Profiles: s.cfg.active}
}

// checkoutCheck is how often dev looks for its checkout; a variable so that
// tests need not wait.
var checkoutCheck = 5 * time.Second

// watchCheckout stops dev when its checkout is deleted, as a finished
// worktree is, so that a detached dev does not outlive the code it runs.
func (s *supervisor) watchCheckout(ctx context.Context, stop context.CancelFunc, every time.Duration) {
	tick := time.NewTicker(every)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-tick.C:
			if _, err := os.Stat(s.cfg.Root); errors.Is(err, os.ErrNotExist) {
				s.logger.WarnContext(ctx, "checkout removed; stopping", "root", s.cfg.Root)
				stop()
				return
			}
		}
	}
}

// Instances lists every running dev on this machine, from the sockets they
// answer on, so an app's own tools can find a checkout's allocated ports. A
// socket no dev answers on is left from one that was killed, and is removed.
// A dev that has not answered when ctx ends is left out.
func Instances(ctx context.Context) ([]Instance, error) {
	dir, err := socketDir()
	if err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	// All at once: in turn, one dev that never answers would use up ctx and
	// leave out every dev after it.
	var mu sync.Mutex
	var wg sync.WaitGroup
	var out []Instance
	for _, e := range entries {
		if !strings.HasSuffix(e.Name(), ".sock") {
			continue
		}
		path := filepath.Join(dir, e.Name())
		wg.Go(func() {
			resp, err := controlAt(ctx, path, controlRequest{Command: "info"})
			if errors.Is(err, errNotRunning) {
				_ = os.Remove(path)
				return
			}
			if err != nil || resp.Info == nil {
				return
			}
			mu.Lock()
			defer mu.Unlock()
			out = append(out, *resp.Info)
		})
	}
	wg.Wait()
	slices.SortFunc(out, func(a, b Instance) int { return strings.Compare(a.Root, b.Root) })
	return out, nil
}

// up starts dev in the background with args and returns once the services
// it starts are up, or with the reason it gave up. The detached dev has its
// own session, so closing the terminal does not stop it; `dev down` does.
func up(ctx context.Context, cfg Config, args, names []string, timeout time.Duration, out io.Writer) error {
	c, err := cfg.withDefaults()
	if err != nil {
		return err
	}
	if _, err := control(ctx, cfg, controlRequest{Command: "status"}); err == nil {
		return fmt.Errorf("dev is already running in %s; see `dev status`", c.Root)
	}
	self, err := os.Executable()
	if err != nil {
		return err
	}
	logs := filepath.Join(c.Dir, "logs")
	if err := os.MkdirAll(logs, 0o750); err != nil {
		return err
	}
	outPath := filepath.Join(logs, "dev.out")
	logFile, err := os.Create(outPath) //nolint:gosec // under the stack's own directory
	if err != nil {
		return err
	}
	defer logFile.Close()

	cmd := exec.Command(self, append([]string{"--plain"}, args...)...) //nolint:gosec,noctx // dev itself; it outlives this command by design
	cmd.Dir = c.Root
	cmd.Stdout, cmd.Stderr = logFile, logFile
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := cmd.Start(); err != nil {
		return err
	}
	exited := make(chan error, 1)
	go func() { exited <- cmd.Wait() }()

	if len(names) == 0 {
		for _, svc := range c.Services {
			if !svc.Manual {
				names = append(names, svc.Name)
			}
		}
	}
	waited := make(chan error, 1)
	go func() {
		if len(names) == 0 {
			// Nothing to wait for but dev itself.
			names = nil
		}
		waited <- waitUp(ctx, cfg, names, timeout)
	}()
	select {
	case err := <-waited:
		if err != nil {
			return fmt.Errorf("%w; dev's output is in %s", err, outPath)
		}
		fmt.Fprintf(out, "dev is running in %s (pid %d); `dev status` shows it, `dev down` stops it\n", c.Root, cmd.Process.Pid)
		return nil
	case err := <-exited:
		return fmt.Errorf("dev exited (%s):\n%s", exitStatus(err), tail(outPath, 20))
	}
}

// waitUp waits for dev to answer and, if names are given, for those
// services to be up.
func waitUp(ctx context.Context, cfg Config, names []string, timeout time.Duration) error {
	if len(names) > 0 {
		return waitServices(ctx, cfg, names, timeout)
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	for {
		resp, err := controlFull(ctx, cfg, controlRequest{Command: "status"})
		if err == nil && resp.Starting == "" {
			return nil
		}
		select {
		case <-ctx.Done():
			return errors.New("timed out waiting for dev to start")
		case <-time.After(200 * time.Millisecond):
		}
	}
}

func tail(path string, n int) string {
	f, err := os.Open(path) //nolint:gosec // dev's own output
	if err != nil {
		return ""
	}
	defer f.Close()
	var lines []string
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
		if len(lines) > n {
			lines = lines[1:]
		}
	}
	return strings.Join(lines, "\n")
}

// down asks the dev running here to stop, and waits until it has.
func down(ctx context.Context, cfg Config) error {
	if _, err := control(ctx, cfg, controlRequest{Command: "shutdown"}); err != nil {
		return err
	}
	ctx, cancel := context.WithTimeout(ctx, stopGrace+20*time.Second)
	defer cancel()
	for {
		if _, err := control(ctx, cfg, controlRequest{Command: "status"}); errors.Is(err, errNotRunning) {
			return nil
		}
		select {
		case <-ctx.Done():
			return errors.New("dev did not stop in time")
		case <-time.After(200 * time.Millisecond):
		}
	}
}

// instanceAt is the running dev whose checkout holds dir.
func instanceAt(ctx context.Context, dir string) (Instance, error) {
	abs, err := filepath.Abs(dir)
	if err != nil {
		return Instance{}, err
	}
	resolve := func(p string) string {
		if r, err := filepath.EvalSymlinks(p); err == nil {
			return r
		}
		return p
	}
	target := resolve(abs)
	list, err := Instances(ctx)
	if err != nil {
		return Instance{}, err
	}
	var found Instance
	for _, in := range list {
		root := resolve(in.Root)
		// The innermost, for a checkout nested in another.
		if (target == root || strings.HasPrefix(target, root+string(filepath.Separator))) && len(root) > len(resolve(found.Root)) {
			found = in
		}
	}
	if found.Root == "" {
		return Instance{}, fmt.Errorf("no dev runs in %s; dev ps lists those that do", abs)
	}
	return found, nil
}

// ExitError carries a command's exit status out of `dev exec`, so that dev
// exits with it.
type ExitError struct{ Code int }

func (e ExitError) Error() string { return fmt.Sprintf("exit status %d", e.Code) }

// Env is what the checkout's running dev sets for every command, without the
// real environment: dev.json's env with its allocated ports, {postgres} and
// the rest filled in, and the env files. An app's own tools, such as one that
// queries the database its services use, read it to find what they use.
func Env(ctx context.Context, cfg Config) (map[string]string, error) {
	resp, err := controlFull(ctx, cfg, controlRequest{Command: "env"})
	if err != nil {
		return nil, err
	}
	return resp.Env, nil
}

// execWith runs a command with the running dev's environment under the real
// one: its allocated ports, {postgres} and the rest, as its services see them.
func execWith(ctx context.Context, cfg Config, argv []string) error {
	env, err := Env(ctx, cfg)
	if err != nil {
		return err
	}
	cmd := exec.CommandContext(ctx, argv[0], argv[1:]...) //nolint:gosec // the developer's own command
	cmd.Env = underEnviron(env)
	cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
	err = cmd.Run()
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		return ExitError{Code: exit.ExitCode()}
	}
	return err
}

func printJSON(w io.Writer, v any) error {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}
