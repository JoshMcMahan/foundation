package dev

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"time"
)

// A running dev answers on a Unix socket, so that another terminal or a tool
// can see and drive its services: `dev status`, `dev restart api`.

type controlRequest struct {
	Command  string   `json:"command"` // status, start, stop, restart, info, env, shutdown or use
	Service  string   `json:"service,omitempty"`
	Profiles []string `json:"profiles,omitempty"`
}

type controlResponse struct {
	Services []status `json:"services,omitempty"`
	// Starting says what dev is doing before its services start, such as
	// starting the stack; until then every service reads stopped.
	Starting string            `json:"starting,omitempty"`
	Info     *Instance         `json:"info,omitempty"`
	Env      map[string]string `json:"env,omitempty"`
	Error    string            `json:"error,omitempty"`
}

// socketPath is the control socket of the dev whose stack lives in dir. It
// sits in a directory only this user can enter, since a request makes dev
// run the app's commands, and is named by a hash so that it stays under the
// platform's limit on socket paths however deep the checkout is.
func socketPath(dir string) (string, error) {
	sockets, err := socketDir()
	if err != nil {
		return "", err
	}
	if err := os.MkdirAll(sockets, 0o700); err != nil {
		return "", err
	}
	// MkdirAll leaves an existing directory as it is; one others can enter
	// would let them drive this user's dev.
	info, err := os.Stat(sockets)
	if err != nil {
		return "", err
	}
	if info.Mode().Perm()&0o077 != 0 {
		return "", fmt.Errorf("%s is open to other users (mode %v); make it 0700", sockets, info.Mode().Perm())
	}
	sum := sha256.Sum256([]byte(dir))
	return filepath.Join(sockets, hex.EncodeToString(sum[:8])+".sock"), nil
}

// socketDir holds every running dev's socket, which is how one dev finds
// another. It is runtime state, so not a cache directory, which the system
// may clear while dev runs: $XDG_RUNTIME_DIR where the system provides one,
// otherwise ~/.local/state.
func socketDir() (string, error) {
	if run := os.Getenv("XDG_RUNTIME_DIR"); run != "" {
		return filepath.Join(run, "foundation-dev"), nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(home, ".local", "state", "foundation-dev"), nil
}

// serveControl answers control requests until ctx ends. It fails when
// another dev already answers for the same stack.
func (s *supervisor) serveControl(ctx context.Context) (func(), error) {
	path, err := socketPath(s.cfg.Dir)
	if err != nil {
		return nil, err
	}
	if conn, err := (&net.Dialer{Timeout: time.Second}).DialContext(ctx, "unix", path); err == nil {
		_ = conn.Close()
		return nil, fmt.Errorf("dev is already running in %s; see `dev status`", s.cfg.Root)
	}
	// A socket left by a dev that was killed answers nothing; replace it.
	_ = os.Remove(path)
	ln, err := (&net.ListenConfig{}).Listen(ctx, "unix", path)
	if err != nil {
		return nil, fmt.Errorf("control socket: %w", err)
	}
	// Services started here run under ctx, dev's own, and outlive the
	// request that started them.
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go s.answer(ctx, conn)
		}
	}()
	return func() {
		_ = ln.Close()
		_ = os.Remove(path)
	}, nil
}

func (s *supervisor) answer(ctx context.Context, conn net.Conn) {
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(stopGrace + 5*time.Second))
	var req controlRequest
	if err := json.NewDecoder(conn).Decode(&req); err != nil {
		return
	}
	var err error
	resp := controlResponse{}
	switch req.Command {
	case "status":
	case "info":
		info := s.instance()
		resp.Info = &info
	case "env":
		// dev's own variables, never this process's whole environment.
		resp.Env, err = s.cfg.vars(nil)
	case "shutdown":
		s.shutdown()
	case "use":
		err = s.use(ctx, req.Profiles)
	case "start":
		err = s.start(ctx, req.Service)
	case "stop":
		err = s.stop(req.Service)
	case "restart":
		err = s.restart(ctx, req.Service)
	default:
		err = fmt.Errorf("unknown command %q", req.Command)
	}
	resp.Services, resp.Starting = s.statuses(), s.starting()
	if err != nil {
		resp.Error = err.Error()
	}
	_ = json.NewEncoder(conn).Encode(resp)
}

var errNotRunning = errors.New("dev is not running")

// control sends a request to the dev running for cfg's stack.
func control(ctx context.Context, cfg Config, req controlRequest) ([]status, error) {
	resp, err := controlFull(ctx, cfg, req)
	return resp.Services, err
}

func controlFull(ctx context.Context, cfg Config, req controlRequest) (controlResponse, error) {
	c, err := cfg.withDefaults()
	if err != nil {
		return controlResponse{}, err
	}
	path, err := socketPath(c.Dir)
	if err != nil {
		return controlResponse{}, err
	}
	resp, err := controlAt(ctx, path, req)
	if errors.Is(err, errNotRunning) {
		return resp, fmt.Errorf("%w in %s", errNotRunning, c.Root)
	}
	return resp, err
}

// controlAt sends a request to the dev answering on a socket.
func controlAt(ctx context.Context, path string, req controlRequest) (controlResponse, error) {
	conn, err := (&net.Dialer{Timeout: time.Second}).DialContext(ctx, "unix", path)
	if err != nil {
		// Giving up says nothing of the dev, and Instances removes the socket
		// of one that is not running.
		if ctx.Err() != nil {
			return controlResponse{}, ctx.Err()
		}
		return controlResponse{}, errNotRunning
	}
	defer conn.Close()
	// A stopped or wedged dev's socket still accepts, and then never answers.
	defer context.AfterFunc(ctx, func() { _ = conn.SetDeadline(time.Now()) })()
	if err := json.NewEncoder(conn).Encode(req); err != nil {
		return controlResponse{}, err
	}
	var resp controlResponse
	if err := json.NewDecoder(conn).Decode(&resp); err != nil {
		return controlResponse{}, err
	}
	if resp.Error != "" {
		return resp, errors.New(resp.Error)
	}
	return resp, nil
}
