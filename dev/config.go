// Package dev runs a web service's local development dependencies without
// Docker, and is the base for an app's own development command.
package dev

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
)

// ConfigFile is the name the dev command looks for, from the working
// directory up, so that `go -C tools tool dev` still finds the repository's.
const ConfigFile = "dev.json"

// Config describes an app's local stack.
type Config struct {
	// Name is the Postgres user, password and database. Tests get Name_test.
	Name string `json:"name"`
	// Root is the directory commands run in and relative paths resolve
	// against. LoadConfig sets it to the config file's directory; otherwise
	// it defaults to the working directory.
	Root string `json:"-"`
	// Dir keeps Postgres data and S3 objects between runs; defaults to
	// .devstack.
	Dir string `json:"dir,omitempty"`
	// Env is a dotenv file loaded into the server and processes, where the
	// real environment wins. Defaults to .env; a missing file is skipped.
	Env string `json:"env,omitempty"`
	// Postgres runs when set.
	Postgres *Postgres `json:"postgres,omitempty"`
	// S3 runs when set.
	S3 *S3 `json:"s3,omitempty"`
	// Server is built, run, and rebuilt when its sources change.
	Server *Server `json:"server,omitempty"`
	// Processes run alongside the server, such as a Vite dev server.
	Processes []Process `json:"processes,omitempty"`
}

// Postgres configures the local PostgreSQL server.
type Postgres struct {
	// Port defaults to 5432.
	Port int `json:"port,omitempty"`
	// Parameters are server settings, e.g. max_connections for test suites
	// that open pools in parallel.
	Parameters map[string]string `json:"parameters,omitempty"`
}

// Server is the app's Go server.
type Server struct {
	// Build compiles the server, e.g. ["go", "build", "-o", "tmp/shop", "./cmd/shop"].
	Build []string `json:"build"`
	// Run starts what Build produced, e.g. ["tmp/shop", "serve"].
	Run []string `json:"run"`
	// Watch lists the directories whose changes rebuild the server;
	// defaults to the root. Hidden directories and node_modules are skipped.
	Watch []string `json:"watch,omitempty"`
	// Exclude names further directories to skip wherever they appear, such
	// as the frontend or the build output.
	Exclude []string `json:"exclude,omitempty"`
	// Extensions are the file types that trigger a rebuild; defaults to .go.
	Extensions []string `json:"extensions,omitempty"`
}

// Process is a long-running command beside the server.
type Process struct {
	// Name prefixes its output.
	Name string `json:"name"`
	// Run is the command, e.g. ["pnpm", "--filter", "web", "dev"].
	Run []string `json:"run"`
	// Dir is where it runs, relative to the root.
	Dir string `json:"dir,omitempty"`
}

// S3 configures the local S3-compatible server.
type S3 struct {
	// Addr defaults to 127.0.0.1:8333.
	Addr string `json:"addr,omitempty"`
}

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
	if !validName.MatchString(c.Name) {
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
	if c.Env == "" {
		c.Env = ".env"
	}
	c.Env = c.path(c.Env)
	if c.Server != nil {
		srv := *c.Server
		if len(srv.Build) == 0 || len(srv.Run) == 0 {
			return c, errors.New("server needs both build and run")
		}
		if len(srv.Watch) == 0 {
			srv.Watch = []string{"."}
		}
		if len(srv.Extensions) == 0 {
			srv.Extensions = []string{".go"}
		}
		c.Server = &srv
	}
	for i, p := range c.Processes {
		if p.Name == "" || len(p.Run) == 0 {
			return c, fmt.Errorf("process %d needs a name and run", i)
		}
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
