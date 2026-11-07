package dev

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"maps"
	"net"
	"slices"
	"strconv"
	"syscall"
	"time"
)

// How far past a taken preferred port to look for a free one, before asking
// the system for any.
const portSearch = 100

// claimsWait bounds asking running devs for their ports. A dev answers at
// once; one that does not is stopped or wedged, and must not hold up a start.
const claimsWait = 500 * time.Millisecond

// runningInstances lists the devs whose ports allocate avoids; a variable so
// that tests need not read the ones running on this machine.
var runningInstances = Instances

// allocate gives every port dev.json names, and the stack's, a free port:
// the preferred one when nothing holds it and no other dev claims it,
// otherwise the next free one. Two checkouts, or two apps, then run side by
// side; {port.<name>}, {postgres} and {s3} follow wherever their port went.
func (c Config) allocate(ctx context.Context, logger *slog.Logger) (Config, error) {
	claimed := c.claimedPorts(ctx, logger)
	taken := maps.Clone(claimed)
	pick := func(what string, preferred int) (int, error) {
		port, err := nextFreePort(ctx, preferred, taken)
		if err != nil {
			return 0, fmt.Errorf("port for %s: %w", what, err)
		}
		taken[port] = true
		if port != preferred {
			// Checkouts side by side move each other's ports on every start,
			// which is no problem to hold in the view's status line.
			level := slog.LevelWarn
			if claimed[preferred] {
				level = slog.LevelInfo
			}
			logger.Log(ctx, level, "port taken; using another", "for", what, "preferred", preferred, "port", port)
		}
		return port, nil
	}

	c.ports = map[string]int{}
	for _, name := range slices.Sorted(maps.Keys(c.Ports)) {
		port, err := pick(name, c.Ports[name])
		if err != nil {
			return c, err
		}
		c.ports[name] = port
	}
	if c.Postgres != nil {
		pg := *c.Postgres
		port, err := pick("postgres", pg.Port)
		if err != nil {
			return c, err
		}
		pg.Port = port
		c.Postgres = &pg
	}
	if c.S3 != nil {
		s3 := *c.S3
		host, p, err := net.SplitHostPort(s3.Addr)
		if err != nil {
			return c, fmt.Errorf("s3 addr %q: %w", s3.Addr, err)
		}
		preferred, err := strconv.Atoi(p)
		if err != nil {
			return c, fmt.Errorf("s3 addr %q: %w", s3.Addr, err)
		}
		port, err := pick("s3", preferred)
		if err != nil {
			return c, err
		}
		s3.Addr = net.JoinHostPort(host, strconv.Itoa(port))
		c.S3 = &s3
	}
	return c, nil
}

// claimedPorts is every port another running dev has allocated, whether or
// not anything listens on it: a service that is stopped, restarting or still
// building holds its port without binding it. Not finding out only leaves a
// port unprotected, so it never stops this dev starting.
func (c Config) claimedPorts(ctx context.Context, logger *slog.Logger) map[int]bool {
	ctx, cancel := context.WithTimeout(ctx, claimsWait)
	defer cancel()
	list, err := runningInstances(ctx)
	if err == nil {
		err = ctx.Err()
	}
	if err != nil {
		logger.WarnContext(ctx, "could not list every running dev; a port one claims may be given out again", "error", err)
	}
	claimed := map[int]bool{}
	for _, in := range list {
		// This stack's own dev, still stopping, has ports this one may take
		// back. Dir says which that is, as it does for the control socket:
		// --dir runs a second stack under the same Root.
		if in.Dir == c.Dir {
			continue
		}
		for _, port := range in.Ports {
			claimed[port] = true
		}
	}
	return claimed
}

func nextFreePort(ctx context.Context, preferred int, taken map[int]bool) (int, error) {
	for port := preferred; port < preferred+portSearch && port <= 65535; port++ {
		if !taken[port] && portFree(ctx, port) {
			return port, nil
		}
	}
	for {
		ln, err := (&net.ListenConfig{}).Listen(ctx, "tcp", "127.0.0.1:0")
		if err != nil {
			return 0, err
		}
		// Open until this returns, so that the system offers another each time.
		defer ln.Close()
		if port := ln.Addr().(*net.TCPAddr).Port; !taken[port] { //nolint:forcetypeassert // a tcp listener
			return port, nil
		}
	}
}

// portFree reports whether nothing listens on port, on any address: a dev
// server bound to localhost alone still holds it for a browser.
func portFree(ctx context.Context, port int) bool {
	p := strconv.Itoa(port)
	for i, addr := range []string{":" + p, "127.0.0.1:" + p, "[::1]:" + p} {
		ln, err := (&net.ListenConfig{}).Listen(ctx, "tcp", addr)
		if err != nil {
			// A machine without IPv6 has no [::1] to hold, and macOS lets a
			// user bind a port under 1024 on the wildcard address alone.
			if errors.Is(err, syscall.EADDRNOTAVAIL) || (i > 0 && errors.Is(err, syscall.EACCES)) {
				continue
			}
			return false
		}
		_ = ln.Close()
	}
	return true
}

// expandCommands replaces {port.<name>} and the stack's names in what dev
// runs and links to; env is expanded when each command's environment is
// built.
func (c Config) expandCommands() (Config, error) {
	var err error
	expandAll := func(args []string) []string {
		out := make([]string, len(args))
		for i, a := range args {
			var e error
			if out[i], e = c.expand(a); e != nil && err == nil {
				err = e
			}
		}
		return out
	}
	expand := func(v string) string {
		out, e := c.expand(v)
		if e != nil && err == nil {
			err = e
		}
		return out
	}
	before := make([][]string, len(c.Before))
	for i, cmd := range c.Before {
		before[i] = expandAll(cmd)
	}
	c.Before = before
	services := make([]Service, len(c.Services))
	for i, svc := range c.Services {
		svc.Build, svc.Run = expandAll(svc.Build), expandAll(svc.Run)
		svc.URL, svc.Health = expand(svc.URL), expand(svc.Health)
		services[i] = svc
	}
	c.Services = services
	return c, err
}
