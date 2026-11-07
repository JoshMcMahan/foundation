package dev

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestMain(m *testing.M) {
	// Every Up here allocates; none of them should read this machine's devs.
	runningInstances = func(context.Context) ([]Instance, error) { return nil, nil }
	m.Run()
}

// listing makes allocate see list, and fail to see more with err.
func listing(t *testing.T, list []Instance, err error) {
	t.Helper()
	listingWith(t, func(context.Context) ([]Instance, error) { return list, err })
}

func listingWith(t *testing.T, list func(context.Context) ([]Instance, error)) {
	t.Helper()
	before := runningInstances
	runningInstances = list
	t.Cleanup(func() { runningInstances = before })
}

// socketsOfYourOwn points Instances at an empty directory, and returns it.
func socketsOfYourOwn(t *testing.T) string {
	t.Helper()
	// Not t.TempDir(): its long name passes the limit on a socket's path on macOS.
	run, err := os.MkdirTemp("/tmp", "dev")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = os.RemoveAll(run) })
	t.Setenv("XDG_RUNTIME_DIR", run)
	dir, err := socketDir()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		t.Fatal(err)
	}
	return dir
}

// listen opens a socket and accepts nothing, which is how a stopped dev's
// looks: connecting and writing succeed, and no answer ever comes.
func listen(t *testing.T, path string) net.Listener {
	t.Helper()
	ln, err := (&net.ListenConfig{}).Listen(t.Context(), "unix", path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	return ln
}

func answerAs(t *testing.T, path string, in Instance) {
	t.Helper()
	ln := listen(t, path)
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			var req controlRequest
			_ = json.NewDecoder(conn).Decode(&req)
			_ = json.NewEncoder(conn).Encode(controlResponse{Info: &in})
			_ = conn.Close()
		}
	}()
}

func allocated(t *testing.T, cfg Config, logged io.Writer) Config {
	t.Helper()
	cfg, err := cfg.withDefaults()
	if err != nil {
		t.Fatal(err)
	}
	if cfg, err = cfg.allocate(t.Context(), slog.New(slog.NewTextHandler(logged, nil))); err != nil {
		t.Fatal(err)
	}
	return cfg
}

// hold keeps a port busy until the test ends, as another checkout's server
// would.
func hold(t *testing.T, addr string) int {
	t.Helper()
	ln, err := (&net.ListenConfig{}).Listen(t.Context(), "tcp", addr)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = ln.Close() })
	return ln.Addr().(*net.TCPAddr).Port //nolint:forcetypeassert // a tcp listener
}

func TestAllocateMovesOnlyWhatIsTaken(t *testing.T) {
	busy := hold(t, "127.0.0.1:0")
	free := freePort(t)
	var logged syncBuffer
	cfg, err := Config{
		Name:     "app",
		Root:     t.TempDir(),
		Ports:    map[string]int{"server": busy, "web": free, "also": free},
		Postgres: &Postgres{Port: busy},
		S3:       &S3{Addr: "127.0.0.1:" + strconv.Itoa(busy)},
	}.withDefaults()
	if err != nil {
		t.Fatal(err)
	}
	cfg, err = cfg.allocate(t.Context(), slog.New(slog.NewTextHandler(&logged, nil)))
	if err != nil {
		t.Fatal(err)
	}

	got := []int{cfg.ports["server"], cfg.ports["web"], cfg.ports["also"], cfg.Postgres.Port}
	seen := map[int]bool{}
	for _, p := range got {
		if p == busy || seen[p] {
			t.Errorf("ports = %v: %d is busy or given twice", got, p)
		}
		seen[p] = true
	}
	if cfg.ports["also"] != free && cfg.ports["web"] != free {
		t.Errorf("neither web nor also kept the free preferred port %d: %v", free, cfg.ports)
	}
	if strings.HasSuffix(cfg.S3.Addr, ":"+strconv.Itoa(busy)) {
		t.Errorf("s3 kept its busy port: %s", cfg.S3.Addr)
	}
	if !strings.Contains(logged.String(), `level=WARN msg="port taken; using another"`) {
		t.Errorf("moving a port from something unknown was not warned of: %s", logged.String())
	}
}

func TestAllocateSkipsPortsOtherDevsClaim(t *testing.T) {
	for _, name := range []string{"web", "api", "postgres", "s3"} {
		t.Run("claimed as "+name, func(t *testing.T) {
			claimed := freePort(t)
			listing(t, []Instance{{Root: "/other", Dir: "/other/.devstack", Ports: map[string]int{name: claimed}}}, nil)
			var logged syncBuffer
			cfg := allocated(t, Config{
				Name:     "app",
				Root:     t.TempDir(),
				Ports:    map[string]int{"web": claimed},
				Postgres: &Postgres{Port: claimed},
				S3:       &S3{Addr: "127.0.0.1:" + strconv.Itoa(claimed)},
			}, &logged)

			if cfg.ports["web"] == claimed || cfg.Postgres.Port == claimed || strings.HasSuffix(cfg.S3.Addr, ":"+strconv.Itoa(claimed)) {
				t.Errorf("given a claimed port %d: web %d, postgres %d, s3 %s", claimed, cfg.ports["web"], cfg.Postgres.Port, cfg.S3.Addr)
			}
			if !strings.Contains(logged.String(), `level=INFO msg="port taken; using another"`) {
				t.Errorf("moving off a claimed port was not logged: %s", logged.String())
			}
			if strings.Contains(logged.String(), "level=WARN") {
				t.Errorf("a checkout beside another warned, as it would on every start: %s", logged.String())
			}
		})
	}
}

func TestAllocateLooksPastAWholeSearchOfClaimedPorts(t *testing.T) {
	preferred := freePort(t)
	claims := map[string]int{}
	for i := range portSearch {
		claims["port"+strconv.Itoa(i)] = preferred + i
	}
	listing(t, []Instance{{Dir: "/other/.devstack", Ports: claims}}, nil)
	cfg := allocated(t, Config{Root: t.TempDir(), Ports: map[string]int{"web": preferred}}, io.Discard)
	if got := cfg.ports["web"]; got >= preferred && got < preferred+portSearch {
		t.Errorf("web = %d, claimed from %d to %d", got, preferred, preferred+portSearch-1)
	}
}

func TestAllocateKeepsThisStacksOwnClaim(t *testing.T) {
	port := freePort(t)
	cfg, err := Config{Root: t.TempDir(), Ports: map[string]int{"web": port}}.withDefaults()
	if err != nil {
		t.Fatal(err)
	}
	listing(t, []Instance{{Root: cfg.Root, Dir: cfg.Dir, Ports: map[string]int{"web": port}}}, nil)
	if got := allocated(t, cfg, io.Discard).ports["web"]; got != port {
		t.Errorf("web = %d, want the port this stack's own dev claims, %d", got, port)
	}
}

func TestAllocateSkipsAnotherStackInThisCheckout(t *testing.T) {
	port := freePort(t)
	cfg, err := Config{Root: t.TempDir(), Ports: map[string]int{"web": port}}.withDefaults()
	if err != nil {
		t.Fatal(err)
	}
	listing(t, []Instance{{Root: cfg.Root, Dir: t.TempDir(), Ports: map[string]int{"web": port}}}, nil)
	if got := allocated(t, cfg, io.Discard).ports["web"]; got == port {
		t.Errorf("web = %d, which a stack under another --dir claims", got)
	}
}

func TestAllocateCarriesOnWhenListingFails(t *testing.T) {
	free, claimed := freePort(t), freePort(t)
	listing(t, []Instance{{Dir: "/other/.devstack", Ports: map[string]int{"web": claimed}}}, errors.New("no socket directory"))
	var logged syncBuffer
	cfg := allocated(t, Config{Root: t.TempDir(), Ports: map[string]int{"api": free, "web": claimed}}, &logged)

	if cfg.ports["api"] != free {
		t.Errorf("api = %d, want its free preferred port %d", cfg.ports["api"], free)
	}
	if cfg.ports["web"] == claimed {
		t.Errorf("web = %d, claimed by a dev the listing did find", claimed)
	}
	if !strings.Contains(logged.String(), "level=WARN") || !strings.Contains(logged.String(), "no socket directory") {
		t.Errorf("the failed listing was not logged: %s", logged.String())
	}
}

func TestAllocateStopsWaitingForAListingThatHangs(t *testing.T) {
	listingWith(t, func(ctx context.Context) ([]Instance, error) {
		select {
		case <-ctx.Done():
		case <-time.After(10 * time.Second):
		}
		return nil, ctx.Err()
	})
	start := time.Now()
	port := freePort(t)
	if got := allocated(t, Config{Root: t.TempDir(), Ports: map[string]int{"web": port}}, io.Discard).ports["web"]; got != port {
		t.Errorf("web = %d, want its free preferred port %d", got, port)
	}
	if waited := time.Since(start); waited > 5*time.Second {
		t.Errorf("allocating took %s", waited)
	}
}

func TestAHungDevStallsNothingAndHidesNoOtherDev(t *testing.T) {
	dir := socketsOfYourOwn(t)
	listingWith(t, Instances)
	// Named to be asked first: in turn, the dev after it would never be.
	hung, live := filepath.Join(dir, "0.sock"), filepath.Join(dir, "1.sock")
	listen(t, hung)
	claimed := freePort(t)
	answerAs(t, live, Instance{Root: "/other", Dir: "/other/.devstack", Ports: map[string]int{"web": claimed}})

	var logged syncBuffer
	done := make(chan Config, 1)
	go func() {
		cfg, err := Config{Root: t.TempDir(), Ports: map[string]int{"web": claimed}}.withDefaults()
		if err == nil {
			cfg, err = cfg.allocate(t.Context(), slog.New(slog.NewTextHandler(&logged, nil)))
		}
		if err != nil {
			t.Error(err)
		}
		done <- cfg
	}()
	select {
	case cfg := <-done:
		if cfg.ports["web"] == claimed {
			t.Errorf("web = %d, claimed by the dev that answered", claimed)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("allocating stalled on a dev that never answers")
	}
	if !strings.Contains(logged.String(), "could not list every running dev") {
		t.Errorf("the dev that never answered was not logged: %s", logged.String())
	}
	for _, path := range []string{hung, live} {
		if _, err := os.Stat(path); err != nil {
			t.Errorf("a running dev's socket went: %v", err)
		}
	}
}

func TestGivingUpOnADevLeavesItsSocket(t *testing.T) {
	path := filepath.Join(socketsOfYourOwn(t), "0.sock")
	listen(t, path)
	ctx, cancel := context.WithCancel(t.Context())
	cancel()
	if _, err := Instances(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); err != nil {
		t.Errorf("a socket was removed for no more than ctx ending: %v", err)
	}
}

func TestTwoDevsNeverShareAPortNothingListensOn(t *testing.T) {
	socketsOfYourOwn(t)
	listingWith(t, Instances)
	port := freePort(t)
	idle := []Service{{Name: "idle", Run: []string{"sleep", "300"}}}
	first := Config{Root: t.TempDir(), Ports: map[string]int{"web": port}, Services: idle}
	second := Config{Root: t.TempDir(), Ports: map[string]int{"web": port}, Services: idle}
	runUp(t, first)
	runUp(t, second)

	ports := func(cfg Config) int {
		t.Helper()
		resp, err := controlFull(t.Context(), cfg, controlRequest{Command: "info"})
		if err != nil {
			t.Fatal(err)
		}
		return resp.Info.Ports["web"]
	}
	if got := ports(first); got != port {
		t.Errorf("the first dev has %d, want its free preferred port %d", got, port)
	}
	if got := ports(second); got == port {
		t.Errorf("the second dev was given %d too", got)
	}
}

func TestPortsReachEverythingThatNamesThem(t *testing.T) {
	cfg, err := Config{
		Name:     "app",
		Root:     t.TempDir(),
		Ports:    map[string]int{"server": freePort(t)},
		Postgres: &Postgres{Port: freePort(t)},
		Env:      map[string]string{"ADDR": ":{port.server}", "DB": "{postgres}"},
		Services: []Service{{
			Name:   "server",
			Build:  []string{"go", "build", "-o", "bin/{port.server}"},
			Run:    []string{"serve", "--port", "{port.server}"},
			URL:    "http://localhost:{port.server}",
			Health: "http://localhost:{port.server}/readyz",
		}},
	}.withDefaults()
	if err != nil {
		t.Fatal(err)
	}
	if cfg, err = cfg.allocate(t.Context(), slog.New(slog.DiscardHandler)); err != nil {
		t.Fatal(err)
	}
	if cfg, err = cfg.expandCommands(); err != nil {
		t.Fatal(err)
	}
	p := strconv.Itoa(cfg.ports["server"])
	svc := cfg.Services[0]
	if svc.Run[2] != p || svc.Build[3] != "bin/"+p || svc.URL != "http://localhost:"+p || svc.Health != "http://localhost:"+p+"/readyz" {
		t.Errorf("service = %+v, want port %s throughout", svc, p)
	}
	env, err := cfg.environ(&svc)
	if err != nil {
		t.Fatal(err)
	}
	joined := strings.Join(env, "\n")
	if !strings.Contains(joined, "ADDR=:"+p) || !strings.Contains(joined, "DB=postgres://app:app@localhost:"+strconv.Itoa(cfg.Postgres.Port)+"/") {
		t.Errorf("env lacks the allocated ports")
	}

	if _, err := (Config{Root: t.TempDir(), Services: []Service{{Name: "web", Run: []string{"vite", "--port", "{port.web}"}}}}).expandCommands(); err == nil {
		t.Error("{port.web} with no such port was accepted")
	}
	for _, ports := range []map[string]int{{"Web": 5173}, {"web": 0}, {"web": 70000}} {
		if _, err := (Config{Ports: ports}).withDefaults(); err == nil {
			t.Errorf("ports %v accepted", ports)
		}
	}
}

func TestWaitLooksForADevThatIsStarting(t *testing.T) {
	cfg := Config{Root: t.TempDir(), Services: []Service{{Name: "web", Run: []string{"sleep", "300"}}}}
	waited := make(chan error, 1)
	go func() { waited <- waitServices(t.Context(), cfg, []string{"web"}, 20*time.Second) }()

	time.Sleep(time.Second) // wait asks before dev has opened its socket
	ctx, cancel := context.WithCancel(t.Context())
	done := make(chan struct{})
	go func() {
		_ = Up(ctx, cfg, slog.New(slog.DiscardHandler), io.Discard)
		close(done)
	}()
	t.Cleanup(func() { cancel(); <-done })

	if err := <-waited; err != nil {
		t.Errorf("wait for a dev that started after it: %v", err)
	}
}

func TestPrivilegedPortFreeWhereOnlyTheWildcardIsAllowed(t *testing.T) {
	// macOS lets a user bind a port under 1024 on the wildcard address but
	// not on loopback; where the wildcard is refused too, the port is not
	// usable and this has nothing to show.
	ln, err := net.Listen("tcp", ":443")
	if err != nil {
		t.Skipf("cannot bind :443 here: %v", err)
	}
	_ = ln.Close()
	if !portFree(t.Context(), 443) {
		t.Error("a privileged port the user can bind on the wildcard address was reported taken")
	}
}
