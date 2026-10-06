package dev

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeConfig(t *testing.T, dir, body string) string {
	t.Helper()
	path := filepath.Join(dir, ConfigFile)
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestFindConfigWalksUp(t *testing.T) {
	root := t.TempDir()
	want := writeConfig(t, root, `{"name":"app"}`)
	nested := filepath.Join(root, "tools", "cmd")
	if err := os.MkdirAll(nested, 0o750); err != nil {
		t.Fatal(err)
	}

	got, err := FindConfig(nested)
	if err != nil {
		t.Fatal(err)
	}
	if got != want {
		t.Errorf("FindConfig = %s, want %s", got, want)
	}
}

func TestFindConfigMissing(t *testing.T) {
	if _, err := FindConfig(t.TempDir()); err == nil || !strings.Contains(err.Error(), ConfigFile) {
		t.Errorf("FindConfig error = %v, want one naming %s", err, ConfigFile)
	}
}

func TestLoadConfigResolvesPathsAgainstFile(t *testing.T) {
	root := t.TempDir()
	loaded, err := LoadConfig(writeConfig(t, root, `{"name":"app","postgres":{},"s3":{"addr":"127.0.0.1:9000"}}`))
	if err != nil {
		t.Fatal(err)
	}
	cfg, err := loaded.withDefaults()
	if err != nil {
		t.Fatal(err)
	}
	if want := filepath.Join(root, ".devstack"); cfg.Dir != want {
		t.Errorf("Dir = %s, want %s", cfg.Dir, want)
	}
	if want := filepath.Join(root, ".env"); cfg.Env != want {
		t.Errorf("Env = %s, want %s", cfg.Env, want)
	}
	if cfg.Postgres == nil || cfg.S3 == nil || cfg.S3.Addr != "127.0.0.1:9000" {
		t.Errorf("services = %+v, %+v", cfg.Postgres, cfg.S3)
	}
}

func TestLoadConfigRejectsUnknownKeys(t *testing.T) {
	if _, err := LoadConfig(writeConfig(t, t.TempDir(), `{"name":"app","postgress":{}}`)); err == nil {
		t.Error("LoadConfig accepted a misspelled key")
	}
}

func TestConfigRequiresCommands(t *testing.T) {
	for name, cfg := range map[string]Config{
		"server without run":   {Name: "app", Server: &Server{Build: []string{"go", "build"}}},
		"process without name": {Name: "app", Processes: []Process{{Run: []string{"vite"}}}},
	} {
		if _, err := cfg.withDefaults(); err == nil {
			t.Errorf("%s accepted", name)
		}
	}
}

func TestConfigRejectsUnsafeName(t *testing.T) {
	for _, name := range []string{"", "App", "my-app", "1app", "a b"} {
		if _, err := (Config{Name: name}).withDefaults(); err == nil {
			t.Errorf("name %q accepted", name)
		}
	}
}

func TestDatabaseURLs(t *testing.T) {
	cfg := Config{Name: "app", Postgres: &Postgres{Port: 5433}}
	if got, want := cfg.DatabaseURL(), "postgres://app:app@localhost:5433/app?sslmode=disable"; got != want {
		t.Errorf("DatabaseURL = %s, want %s", got, want)
	}
	if got, want := cfg.TestDatabaseURL(), "postgres://app:app@localhost:5433/app_test?sslmode=disable"; got != want {
		t.Errorf("TestDatabaseURL = %s, want %s", got, want)
	}
	if got := (Config{Name: "app"}).DatabaseURL(); got != "" {
		t.Errorf("DatabaseURL without Postgres = %s, want empty", got)
	}
}
