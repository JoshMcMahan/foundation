// Package dev runs a web service's local development dependencies without
// Docker, and is the base for an app's own development command.
package dev

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"maps"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"
)

// ConfigFile is the name the dev command looks for, from the working
// directory up, so that `go -C tools tool dev` still finds the repository's.
const ConfigFile = "dev.json"

// Config describes an app's local stack.
type Config struct {
	// Name is the Postgres user, password and database, and required with
	// Postgres. Tests get Name_test.
	Name string `json:"name"`
	// Command is the repository's own dev, for an app whose dev adds commands
	// of its own, such as ["go", "tool", "dev"]. A dev installed globally runs
	// it instead of itself; {root} stands for the directory of dev.json.
	Command []string `json:"command,omitempty"`
	// Root is the directory commands run in and relative paths resolve
	// against. LoadConfig sets it to the config file's directory; otherwise
	// it defaults to the working directory.
	Root string `json:"-"`
	// Dir keeps Postgres data, S3 objects and service logs between runs;
	// defaults to .devstack.
	Dir string `json:"dir,omitempty"`
	// Env is set for every command. Values may name the stack:
	// {postgres} and {postgres_test} are database URLs, {s3} the S3 endpoint.
	Env map[string]string `json:"env,omitempty"`
	// EnvFile is a dotenv file for personal settings and secrets, over Env
	// and under the real environment. Defaults to .env; a missing file is
	// skipped.
	EnvFile string `json:"envFile,omitempty"`
	// Ports names the ports the app's services listen on, with the one each
	// prefers, such as {"server": 8080, "web": 5173}. dev gives each its
	// preferred port when free and the next free one otherwise, and
	// {port.<name>} stands for it in env, commands, url and health.
	Ports map[string]int `json:"ports,omitempty"`
	// ports is what dev allocated for Ports; nil until it has.
	ports map[string]int
	// Postgres runs when set.
	Postgres *Postgres `json:"postgres,omitempty"`
	// S3 runs when set.
	S3 *S3 `json:"s3,omitempty"`
	// Before lists commands run once, in order, before anything starts, such
	// as generating files a server embeds. A failure stops dev.
	Before [][]string `json:"before,omitempty"`
	// Profiles are alternative setups to choose between per checkout, such as
	// a local database or a shared remote one. Each can set env, include other
	// profiles, and enable the services that name it.
	Profiles map[string]Profile `json:"profiles,omitempty"`
	// DefaultProfiles are active until a checkout chooses others with
	// --profile.
	DefaultProfiles []string `json:"defaultProfiles,omitempty"`
	// Active names the profiles to use, overriding the checkout's choice;
	// --profile sets it.
	Active []string `json:"-"`
	// active is Active resolved: includes expanded, in order.
	active []string
	// Services run until dev stops: servers rebuilt when their sources
	// change, and processes such as a Vite dev server.
	Services []Service `json:"services,omitempty"`
}

// Profile is one of the setups a checkout can choose.
type Profile struct {
	// Description says what choosing it means, for `dev profiles`.
	Description string `json:"description,omitempty"`
	// Include activates other profiles first, which makes presets.
	Include []string `json:"include,omitempty"`
	// Env is set over the config's env, in the order profiles are chosen.
	Env map[string]string `json:"env,omitempty"`
}

// Postgres configures the local PostgreSQL server.
type Postgres struct {
	// Port defaults to 5432.
	Port int `json:"port,omitempty"`
	// Parameters are server settings, e.g. max_connections for test suites
	// that open pools in parallel.
	Parameters map[string]string `json:"parameters,omitempty"`
}

// Service is a long-running command. With Build it is a server: built, run,
// and rebuilt and restarted when its sources change; a failed build stops it
// until the next change. Without, it runs once and is left stopped if it
// exits, so a startup error is not buried under restarts.
type Service struct {
	// Name prefixes its output, names its log, and selects it on the
	// command line.
	Name string `json:"name"`
	// Dir is where its commands run, relative to the root.
	Dir string `json:"dir,omitempty"`
	// Build compiles a server, e.g. ["go", "build", "-o", "tmp/shop", "./cmd/shop"].
	Build []string `json:"build,omitempty"`
	// Run starts it, e.g. ["tmp/shop", "serve"] or ["pnpm", "--filter", "web", "dev"].
	Run []string `json:"run"`
	// Watch lists the directories, relative to Dir, whose changes rebuild a
	// server; defaults to Dir. Hidden directories and node_modules are skipped.
	Watch []string `json:"watch,omitempty"`
	// Exclude names further directories to skip wherever they appear, such
	// as the frontend or the build output.
	Exclude []string `json:"exclude,omitempty"`
	// Extensions are the file types that rebuild a server; defaults to .go.
	Extensions []string `json:"extensions,omitempty"`
	// Env is set for this service over the config's Env, with the same
	// references to the stack.
	Env map[string]string `json:"env,omitempty"`
	// EnvFile is a dotenv file for this service, relative to Dir, over the
	// config's EnvFile.
	EnvFile string `json:"envFile,omitempty"`
	// URL is where to open the service, such as http://localhost:8080. The
	// interactive view links to it, and dev logs it once the service is up.
	URL string `json:"url,omitempty"`
	// Health is a URL that answers 2xx once the service can do its job, such
	// as http://localhost:8080/readyz. With it, the service reads starting,
	// then ready, or unhealthy if it stops answering.
	Health string `json:"health,omitempty"`
	// Manual services start only when named: `dev web worker`.
	Manual bool `json:"manual,omitempty"`
	// DependsOn names services that must be up (ready, running without a
	// health URL, or finished when they run once) before this one starts, such
	// as a database. Starting this one starts them too.
	DependsOn []string `json:"dependsOn,omitempty"`
	// Restart is "on-failure" to start the service again, with backoff, when
	// it exits with an error; by default it is left stopped.
	Restart string `json:"restart,omitempty"`
	// RebuildOnCheckout rebuilds a server when the checkout's branch changes,
	// as a branch-stamped build needs.
	RebuildOnCheckout bool `json:"rebuildOnCheckout,omitempty"`
	// Profiles limits the service to checkouts that choose one of them, such
	// as a local database that the remote setup does without.
	Profiles []string `json:"profiles,omitempty"`
	// Once is for a command that readies something and exits, such as one
	// that loads a database: it reads starting while it runs and finished once
	// it exits cleanly, and services that depend on it wait for it to finish.
	Once bool `json:"once,omitempty"`
}

// S3 configures the local S3-compatible server.
type S3 struct {
	// Addr defaults to 127.0.0.1:8333.
	Addr string `json:"addr,omitempty"`
}

// reserved are the dev command's own subcommands, which a service name would
// be unreachable behind.
var reserved = map[string]bool{
	"stack": true, "wait": true, "reset": true, "logs": true, "status": true,
	"start": true, "stop": true, "restart": true, "help": true, "completion": true,
	"up": true, "down": true, "ps": true, "exec": true, "mcp": true, "profiles": true, "use": true,
}

var validPortName = regexp.MustCompile(`^[a-z][a-z0-9_-]*$`)

// The name lands in connection URLs and is the default for credentials, so
// keep it to characters that need no escaping anywhere.
var validName = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)

// FindConfig returns the path of the nearest dev.json in dir or its parents.
func FindConfig(dir string) (string, error) {
	dir, err := filepath.Abs(dir)
	if err != nil {
		return "", err
	}
	for d := dir; ; d = filepath.Dir(d) {
		path := filepath.Join(d, ConfigFile)
		if _, err := os.Stat(path); err == nil {
			return path, nil
		} else if !errors.Is(err, fs.ErrNotExist) {
			return "", err
		}
		if filepath.Dir(d) == d {
			return "", fmt.Errorf("no %s in %s or its parents", ConfigFile, dir)
		}
	}
}

// LoadConfig reads a dev.json, rooted at its directory.
func LoadConfig(path string) (Config, error) {
	data, err := os.ReadFile(path) //nolint:gosec // the developer's own config
	if err != nil {
		return Config{}, err
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	// A misspelled key would otherwise quietly fall back to a default.
	dec.DisallowUnknownFields()
	var cfg Config
	if err := dec.Decode(&cfg); err != nil {
		return Config{}, fmt.Errorf("%s: %w", path, err)
	}
	cfg.Root, err = filepath.Abs(filepath.Dir(path))
	return cfg, err
}

func (c Config) withDefaults() (Config, error) {
	if (c.Postgres != nil || c.Name != "") && !validName.MatchString(c.Name) {
		return c, fmt.Errorf("name %q must be lowercase letters, digits and underscores, starting with a letter", c.Name)
	}
	root, err := filepath.Abs(c.Root)
	if err != nil {
		return c, err
	}
	c.Root = root
	if c.Dir == "" {
		c.Dir = ".devstack"
	}
	c.Dir = c.path(c.Dir)
	if c.EnvFile == "" {
		c.EnvFile = ".env"
	}
	c.EnvFile = c.path(c.EnvFile)
	for name, port := range c.Ports {
		if !validPortName.MatchString(name) || port < 1 || port > 65535 {
			return c, fmt.Errorf("port %q: want a lowercase name and a port from 1 to 65535, got %d", name, port)
		}
	}
	for i, cmd := range c.Before {
		if len(cmd) == 0 {
			return c, fmt.Errorf("before %d is empty", i)
		}
	}
	services := make([]Service, len(c.Services))
	seen := map[string]bool{}
	for i, svc := range c.Services {
		switch {
		case svc.Name == "" || len(svc.Run) == 0:
			return c, fmt.Errorf("service %d needs a name and run", i)
		case seen[svc.Name]:
			return c, fmt.Errorf("two services are named %q", svc.Name)
		case reserved[svc.Name]:
			return c, fmt.Errorf("service %q would be shadowed by the dev %s command", svc.Name, svc.Name)
		}
		seen[svc.Name] = true
		for field, v := range map[string]string{"url": svc.URL, "health": svc.Health} {
			// Placeholders such as {port.web} are filled in later; stand in
			// a port so the rest of the URL is still checked now.
			u, err := url.Parse(stackRef.ReplaceAllString(v, "1"))
			if v != "" && (err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "") {
				return c, fmt.Errorf("service %q: %s must be an http(s) URL, got %q", svc.Name, field, v)
			}
		}
		svc.Dir = c.path(svc.Dir)
		if svc.EnvFile != "" && !filepath.IsAbs(svc.EnvFile) {
			svc.EnvFile = filepath.Join(svc.Dir, svc.EnvFile)
		}
		if len(svc.Build) > 0 {
			if len(svc.Watch) == 0 {
				svc.Watch = []string{"."}
			}
			watch := make([]string, len(svc.Watch))
			for i, w := range svc.Watch {
				watch[i] = w
				if !filepath.IsAbs(w) {
					watch[i] = filepath.Join(svc.Dir, w)
				}
			}
			svc.Watch = watch
			if len(svc.Extensions) == 0 {
				svc.Extensions = []string{".go"}
			}
		}
		services[i] = svc
	}
	c.Services = services
	if err := c.checkDependencies(); err != nil {
		return c, err
	}
	if c, err = c.activate(); err != nil {
		return c, err
	}
	if c.Postgres != nil {
		pg := *c.Postgres
		if pg.Port == 0 {
			pg.Port = 5432
		}
		if pg.Port < 1 || pg.Port > 65535 {
			return c, fmt.Errorf("invalid postgres port %d", pg.Port)
		}
		c.Postgres = &pg
	}
	if c.S3 != nil {
		s3 := *c.S3
		if s3.Addr == "" {
			s3.Addr = "127.0.0.1:8333"
		}
		c.S3 = &s3
	}
	return c, nil
}

func (c Config) path(p string) string {
	if filepath.IsAbs(p) {
		return p
	}
	return filepath.Join(c.Root, p)
}

// DatabaseURL is the URL of the app's database, or "" without Postgres.
func (c Config) DatabaseURL() string {
	return c.databaseURL(c.Name)
}

// TestDatabaseURL is the URL of the database for tests, or "" without Postgres.
func (c Config) TestDatabaseURL() string {
	return c.databaseURL(c.Name + "_test")
}

func (c Config) databaseURL(db string) string {
	c, err := c.withDefaults()
	if err != nil || c.Postgres == nil {
		return ""
	}
	return fmt.Sprintf("postgres://%s:%s@localhost:%d/%s?sslmode=disable", c.Name, c.Name, c.Postgres.Port, db)
}

// checkDependencies rejects unknown services in dependsOn, a dependency
// cycle, restart values other than "on-failure", and a service run once that
// is a server or has a health URL.
func (c Config) checkDependencies() error {
	byName := map[string]Service{}
	for _, svc := range c.Services {
		byName[svc.Name] = svc
	}
	for _, svc := range c.Services {
		if svc.Restart != "" && svc.Restart != "on-failure" {
			return fmt.Errorf("service %q: restart must be on-failure or unset, got %q", svc.Name, svc.Restart)
		}
		if svc.Once && (len(svc.Build) > 0 || svc.Health != "") {
			return fmt.Errorf("service %q: once is for a command that exits, not one with build or health", svc.Name)
		}
		for _, dep := range svc.DependsOn {
			if _, ok := byName[dep]; !ok {
				return fmt.Errorf("service %q depends on %q, which dev.json does not define", svc.Name, dep)
			}
		}
	}
	const (
		unvisited = iota
		visiting
		done
	)
	state := map[string]int{}
	var visit func(name string, path []string) error
	visit = func(name string, path []string) error {
		switch state[name] {
		case visiting:
			return fmt.Errorf("services depend on each other: %s", strings.Join(append(path, name), " → "))
		case done:
			return nil
		}
		state[name] = visiting
		for _, dep := range byName[name].DependsOn {
			if err := visit(dep, append(path, name)); err != nil {
				return err
			}
		}
		state[name] = done
		return nil
	}
	for _, svc := range c.Services {
		if err := visit(svc.Name, nil); err != nil {
			return err
		}
	}
	return nil
}

// instance names the checkout in a few readable characters, for names that
// must differ between checkouts, such as a shared queue's.
func (c Config) instance() string {
	base := strings.ToLower(filepath.Base(c.Root))
	clean := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			return r
		}
		return '-'
	}, base)
	sum := sha256.Sum256([]byte(c.Root))
	return strings.Trim(clean, "-") + "-" + hex.EncodeToString(sum[:2])
}

// profilesFile is where a checkout keeps the profiles it chose.
func (c Config) profilesFile() string { return filepath.Join(c.Dir, "profiles") }

// activate applies the chosen profiles: their env over the config's, and only
// the services that need no profile or name a chosen one. A service whose
// profile is not chosen is provided some other way, so depending on it is no
// longer waiting for it.
func (c Config) activate() (Config, error) {
	for name, p := range c.Profiles {
		if !validPortName.MatchString(name) {
			return c, fmt.Errorf("profile %q: want a lowercase name", name)
		}
		for _, inc := range p.Include {
			if _, ok := c.Profiles[inc]; !ok {
				return c, fmt.Errorf("profile %q includes %q, which dev.json does not define", name, inc)
			}
		}
	}
	for _, svc := range c.Services {
		for _, name := range svc.Profiles {
			if _, ok := c.Profiles[name]; !ok {
				return c, fmt.Errorf("service %q names profile %q, which dev.json does not define", svc.Name, name)
			}
		}
	}

	chosen := c.Active
	if chosen == nil {
		if data, err := os.ReadFile(c.profilesFile()); err == nil {
			chosen = strings.Fields(string(data))
		} else {
			chosen = c.DefaultProfiles
		}
	}
	var active []string
	seen := map[string]bool{}
	var expand func(name string, path []string) error
	expand = func(name string, path []string) error {
		if slices.Contains(path, name) {
			return fmt.Errorf("profiles include each other: %s", strings.Join(append(path, name), " → "))
		}
		p, ok := c.Profiles[name]
		if !ok {
			return fmt.Errorf("no profile named %q", name)
		}
		for _, inc := range p.Include {
			if err := expand(inc, append(path, name)); err != nil {
				return err
			}
		}
		if !seen[name] {
			seen[name] = true
			active = append(active, name)
		}
		return nil
	}
	for _, name := range chosen {
		if err := expand(name, nil); err != nil {
			return c, err
		}
	}
	c.active = active

	env := maps.Clone(c.Env)
	for _, name := range active {
		if env == nil {
			env = map[string]string{}
		}
		maps.Copy(env, c.Profiles[name].Env)
	}
	c.Env = env

	kept := map[string]bool{}
	var services []Service
	for _, svc := range c.Services {
		if len(svc.Profiles) == 0 || slices.ContainsFunc(svc.Profiles, func(p string) bool { return seen[p] }) {
			services = append(services, svc)
			kept[svc.Name] = true
		}
	}
	for i, svc := range services {
		svc.DependsOn = slices.DeleteFunc(slices.Clone(svc.DependsOn), func(d string) bool { return !kept[d] })
		services[i] = svc
	}
	c.Services = services
	return c, nil
}

// chooseProfiles records the profiles a checkout uses from now on.
func (c Config) chooseProfiles(names []string) error {
	if err := os.MkdirAll(c.Dir, 0o750); err != nil {
		return err
	}
	return os.WriteFile(c.profilesFile(), []byte(strings.Join(names, "\n")+"\n"), 0o600)
}
