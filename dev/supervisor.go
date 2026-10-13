package dev

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"maps"
	"net/url"
	"regexp"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/charmbracelet/x/ansi"
)

// state is where a service is in its life.
type state string

const (
	stateStopped  state = "stopped"
	stateBuilding state = "building"
	stateRunning  state = "running"
	stateFailed   state = "failed" // the build failed; waiting for a change
	stateExited   state = "exited"
	stateWaiting  state = "waiting"  // for the services it depends on
	stateFinished state = "finished" // a service run once exited cleanly
)

// status is a service's state, as the TUI and `dev status` show it.
type status struct {
	Name   string    `json:"name"`
	State  state     `json:"state"`
	Detail string    `json:"detail,omitempty"`
	Since  time.Time `json:"since"`
	Manual bool      `json:"manual,omitempty"`
	URL    string    `json:"url,omitempty"`
}

// supervisor runs the stack and the services, and lets each service be
// started, stopped and restarted on its own while the rest keep running.
type supervisor struct {
	cfg     Config
	base    Config // as given, before defaults and profiles, to switch from
	logger  *slog.Logger
	outputs *outputs
	// Compiling every server at once exhausts a laptop's memory.
	builds chan struct{}

	mu       sync.Mutex
	running  bool // services can start: the stack is up
	order    []string
	services map[string]*runner
	shutdown context.CancelFunc // set by run: stops dev, as `dev down` asks
	switchTo []string           // profiles to start again with, once stopped
	started  time.Time
	stack    string // what the stack is doing, for the TUI's header
	since    time.Time
	changed  chan struct{}
}

type runner struct {
	svc    Service
	out    *lineWriter
	status status
	cancel context.CancelFunc
	done   chan struct{}
}

// newSupervisor prepares cfg's services. Their output goes, prefixed, to
// out, which is io.Discard when the TUI shows it instead.
func newSupervisor(ctx context.Context, cfg Config, logger *slog.Logger, out io.Writer) (*supervisor, error) {
	base := cfg
	cfg, err := cfg.withDefaults()
	if err != nil {
		return nil, err
	}
	if cfg, err = cfg.allocate(ctx, logger); err != nil {
		return nil, err
	}
	if cfg, err = cfg.expandCommands(); err != nil {
		return nil, err
	}
	o, err := newOutputs(out, cfg, cfg.Services)
	if err != nil {
		return nil, err
	}
	s := &supervisor{
		cfg:      cfg,
		base:     base,
		logger:   logger,
		outputs:  o,
		builds:   make(chan struct{}, 1),
		services: map[string]*runner{},
		changed:  make(chan struct{}, 1),
	}
	for _, svc := range cfg.Services {
		s.order = append(s.order, svc.Name)
		r := &runner{
			svc:    svc,
			out:    o.writer(svc.Name),
			status: status{Name: svc.Name, State: stateStopped, Since: time.Now(), Manual: svc.Manual, URL: defaultURL(svc)},
		}
		if r.status.URL == "" {
			// Dev servers such as Vite print where they listen; the first
			// local address a service prints is where to open it.
			seen := r.out.sink
			r.out.sink = func(line string) {
				seen(line)
				s.learnURL(r, line)
			}
		}
		s.services[svc.Name] = r
	}
	return s, nil
}

// run runs the before commands and the stack, starts the services named
// (or every one not marked Manual), and stops everything when ctx ends.
func (s *supervisor) run(ctx context.Context, names ...string) error {
	defer s.outputs.close()
	// Wait for the watcher after stop has ended it, so run leaves nothing.
	var watch sync.WaitGroup
	defer watch.Wait()
	ctx, stop := context.WithCancel(ctx)
	defer stop()
	s.mu.Lock()
	s.shutdown, s.started = stop, time.Now()
	s.mu.Unlock()
	every := checkoutCheck
	watch.Go(func() { s.watchCheckout(ctx, stop, every) })
	selected, err := s.cfg.selectServices(names)
	if err != nil {
		return err
	}
	closeControl, err := s.serveControl(ctx)
	if err != nil {
		return err
	}
	defer closeControl()
	env, err := s.cfg.beforeEnviron()
	if err != nil {
		return err
	}
	s.setStack("running before commands")
	if err := runBefore(ctx, s.cfg, env, s.outputs.writer("before")); err != nil || ctx.Err() != nil {
		return err
	}

	if s.cfg.Postgres != nil || s.cfg.S3 != nil {
		s.setStack("starting the stack")
		stack, err := StartStack(ctx, s.cfg, s.logger)
		if err != nil {
			return err
		}
		defer func() {
			s.setStack("stopping the stack")
			if err := stack.Stop(context.WithoutCancel(ctx)); err != nil {
				s.logger.ErrorContext(ctx, "stop stack", "error", err)
			}
		}()
	}
	s.setStack("")

	s.mu.Lock()
	s.running = true
	s.mu.Unlock()
	for _, svc := range selected {
		if err := s.start(ctx, svc.Name); err != nil {
			return err
		}
	}
	<-ctx.Done()
	s.mu.Lock()
	s.running = false
	s.mu.Unlock()

	var wg sync.WaitGroup
	for _, name := range s.order {
		wg.Go(func() { _ = s.stop(name) })
	}
	wg.Wait()
	s.mu.Lock()
	switching := s.switchTo != nil
	s.mu.Unlock()
	if switching {
		return errSwitch
	}
	return nil
}

func (s *supervisor) runner(name string) (*runner, error) {
	r, ok := s.services[name]
	if !ok {
		return nil, fmt.Errorf("no service named %q", name)
	}
	return r, nil
}

// start runs a service until ctx ends or it is stopped. ctx is dev's own,
// not a request's: a service started from the TUI or the control socket
// outlives the request that started it.
func (s *supervisor) start(ctx context.Context, name string) error {
	r, err := s.runner(name)
	if err != nil {
		return err
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.running || ctx.Err() != nil {
		return errors.New("dev is not running services yet")
	}
	if r.cancel != nil {
		return fmt.Errorf("%s is already running", name)
	}
	env, err := s.cfg.environ(&r.svc)
	if err != nil {
		return fmt.Errorf("%s: %w", name, err)
	}
	ctx, cancel := context.WithCancel(ctx)
	r.cancel, r.done = cancel, make(chan struct{})
	// Read as on its way at once, not stopped until its goroutine reports:
	// dev wait would take stopped for a service that gave up.
	r.status.State, r.status.Detail, r.status.Since = stateStarting, "", time.Now()
	if len(r.svc.Build) > 0 {
		r.status.State = stateBuilding
	}
	set := func(st state, detail string) { s.setState(r, st, detail) }
	logger := s.logger.With("service", name)
	// done waits for the prober too, so that stop leaves nothing behind.
	var wg sync.WaitGroup
	if r.svc.Health != "" {
		wg.Go(func() { s.probe(ctx, r) })
	}
	wg.Go(func() {
		if !s.waitForDependencies(ctx, r) {
			return
		}
		if len(r.svc.Build) > 0 {
			runServer(ctx, s.cfg, r.svc, env, s.builds, r.out, logger, set)
		} else {
			runProcess(ctx, r.svc, env, r.out, logger, set)
		}
	})
	done := r.done
	go func() {
		wg.Wait()
		close(done)
	}()
	return nil
}

func (s *supervisor) stop(name string) error {
	r, err := s.runner(name)
	if err != nil {
		return err
	}
	s.mu.Lock()
	cancel, done := r.cancel, r.done
	s.mu.Unlock()
	if cancel == nil {
		return nil
	}
	cancel()
	<-done
	s.mu.Lock()
	r.cancel, r.done = nil, nil
	s.mu.Unlock()
	s.setState(r, stateStopped, "")
	return nil
}

func (s *supervisor) restart(ctx context.Context, name string) error {
	if err := s.stop(name); err != nil {
		return err
	}
	return s.start(ctx, name)
}

func (s *supervisor) statuses() []status {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := make([]status, 0, len(s.order))
	for _, name := range s.order {
		out = append(out, s.services[name].status)
	}
	return out
}

// starting is what dev is doing before its services start, or "" once they
// have.
func (s *supervisor) starting() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.running {
		return ""
	}
	if s.stack != "" {
		return s.stack
	}
	return "starting"
}

// stackState is what dev is doing before its services start, and since
// when; "" once they have.
func (s *supervisor) stackState() (string, time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.stack, s.since
}

func (s *supervisor) setState(r *runner, st state, detail string) {
	s.mu.Lock()
	// A stopped runner's last report would otherwise race its stop.
	if r.cancel == nil && st != stateStopped {
		s.mu.Unlock()
		return
	}
	if st == stateRunning && (r.svc.Health != "" || r.svc.Once) {
		st = stateStarting
	}
	wasUp := r.status.State.up()
	r.status.State, r.status.Detail, r.status.Since = st, detail, time.Now()
	s.mu.Unlock()
	s.announce(r, wasUp, st)
	s.notify()
}

// announce logs where to open a service as it comes up, which most
// terminals let you click.
func (s *supervisor) announce(r *runner, wasUp bool, now state) {
	s.mu.Lock()
	url := r.status.URL
	s.mu.Unlock()
	if url != "" && !wasUp && now.up() {
		s.logger.Info("up", "service", r.svc.Name, "url", url)
	}
}

// defaultURL is where to open a service when dev.json does not say: its
// health URL's origin, if it has one.
func defaultURL(svc Service) string {
	if svc.URL != "" || svc.Health == "" {
		return svc.URL
	}
	u, err := url.Parse(svc.Health)
	if err != nil {
		return ""
	}
	return u.Scheme + "://" + u.Host
}

// localURL matches an address a dev server prints, such as Vite's
// "Local:   http://localhost:5173/".
var localURL = regexp.MustCompile(`https?://(?:localhost|127\.0\.0\.1|\[::1\]):\d+/?`)

// learnURL takes the first local address a service prints as its URL. It is
// called with the output's lock held, and takes the supervisor's after it.
func (s *supervisor) learnURL(r *runner, line string) {
	found := localURL.FindString(ansi.Strip(line))
	if found == "" {
		return
	}
	s.mu.Lock()
	learned := r.status.URL == ""
	if learned {
		r.status.URL = found
	}
	up := r.status.State.up()
	s.mu.Unlock()
	if learned {
		if up {
			// Off this goroutine: in the view, dev's log is itself output,
			// whose lock the caller holds.
			go s.logger.Info("up", "service", r.svc.Name, "url", found)
		}
		s.notify()
	}
}

func (s *supervisor) setStack(what string) {
	s.mu.Lock()
	s.stack, s.since = what, time.Now()
	s.mu.Unlock()
	s.notify()
}

func (s *supervisor) notify() {
	select {
	case s.changed <- struct{}{}:
	default:
	}
}

// lines returns the recent output of a service, or of everything when name
// is empty, oldest first.
func (s *supervisor) lines(name string) []string {
	return s.outputs.recent(name)
}

// waitForDependencies holds a service back until every service it depends
// on is up; false when it is stopped first.
func (s *supervisor) waitForDependencies(ctx context.Context, r *runner) bool {
	if len(r.svc.DependsOn) == 0 {
		return true
	}
	s.setState(r, stateWaiting, "for "+strings.Join(r.svc.DependsOn, ", "))
	for {
		up := true
		for _, st := range s.statuses() {
			if slices.Contains(r.svc.DependsOn, st.Name) && !st.State.up() {
				up = false
			}
		}
		if up {
			return true
		}
		select {
		case <-ctx.Done():
			return false
		case <-time.After(200 * time.Millisecond):
		}
	}
}

// errSwitch ends a run so that dev starts again with other profiles.
var errSwitch = errors.New("switching profiles")

// use switches the running dev to other profiles: it records the choice and
// stops everything, and the caller starts dev again with them.
func (s *supervisor) use(_ context.Context, names []string) error {
	next := s.base
	next.Active = names
	c, err := next.withDefaults()
	if err != nil {
		return err
	}
	if err := c.chooseProfiles(names); err != nil {
		return err
	}
	s.mu.Lock()
	s.switchTo = names
	stop := s.shutdown
	s.mu.Unlock()
	if stop == nil {
		return errors.New("dev is not running services yet")
	}
	stop()
	return nil
}

// profileChoices is every profile dev.json defines, and those in use.
func (s *supervisor) profileChoices() (all, active []string) {
	return slices.Sorted(maps.Keys(s.cfg.Profiles)), s.cfg.active
}
