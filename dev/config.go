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
	// Dir keeps Postgres data and S3 objects between runs. Relative to the
	// config file when loaded from one; defaults to .devstack.
	Dir string `json:"dir,omitempty"`
	// Postgres runs when set.
	Postgres *Postgres `json:"postgres,omitempty"`
	// S3 runs when set.
	S3 *S3 `json:"s3,omitempty"`
}

// Postgres configures the local PostgreSQL server.
type Postgres struct {
	// Port defaults to 5432.
	Port int `json:"port,omitempty"`
	// Parameters are server settings, e.g. max_connections for test suites
	// that open pools in parallel.
	Parameters map[string]string `json:"parameters,omitempty"`
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

// LoadConfig reads a dev.json and resolves Dir against its directory.
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
	if cfg.Dir == "" {
		cfg.Dir = ".devstack"
	}
	if !filepath.IsAbs(cfg.Dir) {
		cfg.Dir = filepath.Join(filepath.Dir(path), cfg.Dir)
	}
	return cfg, nil
}

func (c Config) withDefaults() (Config, error) {
	if !validName.MatchString(c.Name) {
		return c, fmt.Errorf("name %q must be lowercase letters, digits and underscores, starting with a letter", c.Name)
	}
	if c.Dir == "" {
		c.Dir = ".devstack"
	}
	dir, err := filepath.Abs(c.Dir)
	if err != nil {
		return c, err
	}
	c.Dir = dir
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
