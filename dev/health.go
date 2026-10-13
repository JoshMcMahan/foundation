package dev

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"slices"
	"time"
)

// A service with a health URL is starting until the URL answers 2xx, then
// ready, and unhealthy if it stops answering or never answers in time.
const (
	stateStarting  state = "starting"
	stateReady     state = "ready"
	stateUnhealthy state = "unhealthy"
)

// Variables, so tests need not wait minutes.
var (
	// connectGrace is how long dev wait looks for a dev that is starting.
	connectGrace  = 10 * time.Second
	probeStarting = time.Second
	probeReady    = 5 * time.Second
	probeTimeout  = 2 * time.Second
	// startTimeout is how long a starting service may take to first answer.
	startTimeout = time.Minute
)

// probe checks a service's health URL until ctx ends. It only judges a
// service whose process is up; building, failed and exited are left to the
// runner.
func (s *supervisor) probe(ctx context.Context, r *runner) {
	client := &http.Client{Timeout: probeTimeout}
	timer := time.NewTimer(probeStarting)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		}
		s.mu.Lock()
		st, since := r.status.State, r.status.Since
		s.mu.Unlock()
		next := probeStarting
		if st == stateStarting || st == stateReady || st == stateUnhealthy {
			err := check(ctx, client, r.svc.Health)
			switch {
			case err == nil:
				s.transition(r, st, stateReady, "")
				next = probeReady
			case st == stateReady:
				s.transition(r, st, stateUnhealthy, err.Error())
			case st == stateStarting && time.Since(since) > startTimeout:
				s.transition(r, st, stateUnhealthy, fmt.Sprintf("no answer in %s: %v", startTimeout, err))
			}
		}
		timer.Reset(next)
	}
}

func check(ctx context.Context, client *http.Client, url string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, http.NoBody)
	if err != nil {
		return err
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	_ = resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode > 299 {
		return fmt.Errorf("%s answered %s", url, resp.Status)
	}
	return nil
}

// transition sets a service's state only if it is still from, so that a
// probe that raced a rebuild does not undo it.
func (s *supervisor) transition(r *runner, from, to state, detail string) {
	s.mu.Lock()
	if r.cancel == nil || r.status.State != from || (from == to && r.status.Detail == detail) {
		s.mu.Unlock()
		return
	}
	since := r.status.Since
	if from != to {
		since = time.Now()
	}
	r.status.State, r.status.Detail, r.status.Since = to, detail, since
	s.mu.Unlock()
	s.announce(r, from.up(), to)
	s.notify()
}

// up reports whether a service is doing its job: ready, running when it has
// no health URL, or finished when it runs once. done reports whether it has
// stopped trying.
func (st state) up() bool { return st == stateReady || st == stateRunning || st == stateFinished }

func (st state) done() bool {
	return slices.Contains([]state{stateFailed, stateExited, stateUnhealthy, stateStopped}, st)
}

// waitServices blocks until the named services of the dev running here are
// up, and fails as soon as one of them gives up.
func waitServices(ctx context.Context, cfg Config, names []string, timeout time.Duration) error {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	// A dev started just before this has not opened its socket yet.
	appear := time.Now().Add(connectGrace)
	for {
		resp, err := controlFull(ctx, cfg, controlRequest{Command: "status"})
		if errors.Is(err, errNotRunning) && time.Now().Before(appear) {
			select {
			case <-ctx.Done():
				return err
			case <-time.After(200 * time.Millisecond):
			}
			continue
		}
		if err != nil {
			return err
		}
		services := resp.Services
		waiting := 0
		for _, name := range names {
			i := slices.IndexFunc(services, func(s status) bool { return s.Name == name })
			switch {
			case i < 0:
				return fmt.Errorf("no service named %q", name)
			case resp.Starting != "":
				// Every service reads stopped until the stack is up.
				waiting++
			case services[i].State.up():
			case services[i].State.done() && time.Since(services[i].Since) > time.Second:
				// A moment's grace: a service just restarted reads stopped.
				return fmt.Errorf("%s is %s %s", name, services[i].State, services[i].Detail)
			default:
				waiting++
			}
		}
		if waiting == 0 {
			return nil
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("timed out waiting for %v", names)
		case <-time.After(500 * time.Millisecond):
		}
	}
}
