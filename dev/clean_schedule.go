package dev

import (
	"bytes"
	"context"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// The scheduled clean's names: a launchd label on macOS, systemd units on
// Linux.
const (
	cleanLabel = "foundation.dev.clean"
	cleanUnit  = "foundation-dev-clean"
)

// scheduler runs launchctl and systemctl; a variable so that tests run
// neither.
var scheduler = func(ctx context.Context, name string, args ...string) error {
	out, err := exec.CommandContext(ctx, name, args...).CombinedOutput() //nolint:gosec // launchctl or systemctl, with arguments built here
	if err != nil {
		return fmt.Errorf("%s %s: %w: %s", name, strings.Join(args, " "), err, bytes.TrimSpace(out))
	}
	return nil
}

// cleanExecutable is the dev a schedule runs: this one, unless it is a
// temporary build that will be gone by then.
func cleanExecutable() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	if r, err := filepath.EvalSymlinks(exe); err == nil {
		exe = r
	}
	if strings.Contains(exe, string(filepath.Separator)+"go-build") {
		return "", errors.New("this dev is a temporary build, gone by the next run; install it first: go install github.com/parallelworks/foundation/dev/cmd/dev@latest")
	}
	return exe, nil
}

// installClean schedules `exe clean args...` every interval, and once now:
// a launchd agent on macOS, a systemd user timer on Linux. It replaces a
// schedule installed before.
func installClean(ctx context.Context, goos, exe string, args []string, every time.Duration, out io.Writer) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	argv := append([]string{exe, "clean"}, args...)
	// The job finds git, gh and go where this shell does.
	path := os.Getenv("PATH")
	switch goos {
	case "darwin":
		plist := filepath.Join(home, "Library", "LaunchAgents", cleanLabel+".plist")
		logPath := filepath.Join(home, "Library", "Logs", cleanUnit+".log")
		if err := writeFile(plist, launchdPlist(argv, path, logPath, every)); err != nil {
			return err
		}
		domain := "gui/" + strconv.Itoa(os.Getuid())
		_ = scheduler(ctx, "launchctl", "bootout", domain+"/"+cleanLabel) // not loaded yet is fine
		if err := scheduler(ctx, "launchctl", "bootstrap", domain, plist); err != nil {
			return err
		}
		fmt.Fprintf(out, "dev clean runs every %s, logging to %s\n", every, logPath)
	case "linux":
		units := systemdUnits(home)
		service, timer := systemdUnitFiles(argv, path, every)
		if err := writeFile(filepath.Join(units, cleanUnit+".service"), service); err != nil {
			return err
		}
		if err := writeFile(filepath.Join(units, cleanUnit+".timer"), timer); err != nil {
			return err
		}
		if err := scheduler(ctx, "systemctl", "--user", "daemon-reload"); err != nil {
			return err
		}
		if err := scheduler(ctx, "systemctl", "--user", "enable", "--now", cleanUnit+".timer"); err != nil {
			return err
		}
		fmt.Fprintf(out, "dev clean runs every %s; journalctl --user -u %s shows its output\n", every, cleanUnit)
	default:
		return fmt.Errorf("dev clean cannot schedule itself on %s; run it from your own scheduler", goos)
	}
	return nil
}

// uninstallClean removes the schedule installClean made, if any.
func uninstallClean(ctx context.Context, goos string, out io.Writer) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	var files []string
	switch goos {
	case "darwin":
		_ = scheduler(ctx, "launchctl", "bootout", "gui/"+strconv.Itoa(os.Getuid())+"/"+cleanLabel) // not loaded is fine
		files = []string{filepath.Join(home, "Library", "LaunchAgents", cleanLabel+".plist")}
	case "linux":
		_ = scheduler(ctx, "systemctl", "--user", "disable", "--now", cleanUnit+".timer") // not enabled is fine
		units := systemdUnits(home)
		files = []string{filepath.Join(units, cleanUnit+".service"), filepath.Join(units, cleanUnit+".timer")}
	default:
		return fmt.Errorf("dev clean cannot schedule itself on %s", goos)
	}
	for _, f := range files {
		if err := os.Remove(f); err != nil && !errors.Is(err, os.ErrNotExist) {
			return err
		}
	}
	if goos == "linux" {
		if err := scheduler(ctx, "systemctl", "--user", "daemon-reload"); err != nil {
			return err
		}
	}
	fmt.Fprintln(out, "dev clean no longer runs on a schedule")
	return nil
}

func writeFile(path, content string) error {
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(content), 0o600)
}

func systemdUnits(home string) string {
	if dir := os.Getenv("XDG_CONFIG_HOME"); dir != "" {
		return filepath.Join(dir, "systemd", "user")
	}
	return filepath.Join(home, ".config", "systemd", "user")
}

func xmlText(s string) string {
	var b strings.Builder
	_ = xml.EscapeText(&b, []byte(s))
	return b.String()
}

func launchdPlist(argv []string, path, logPath string, every time.Duration) string {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>` + cleanLabel + `</string>
  <key>ProgramArguments</key>
  <array>
`)
	for _, a := range argv {
		b.WriteString("    <string>" + xmlText(a) + "</string>\n")
	}
	b.WriteString(`  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>` + xmlText(path) + `</string>
  </dict>
  <key>StartInterval</key><integer>` + strconv.Itoa(int(every.Seconds())) + `</integer>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>LowPriorityIO</key><true/>
  <key>Nice</key><integer>10</integer>
  <key>StandardOutPath</key><string>` + xmlText(logPath) + `</string>
  <key>StandardErrorPath</key><string>` + xmlText(logPath) + `</string>
</dict>
</plist>
`)
	return b.String()
}

// systemdQuote quotes a word for a unit file's ExecStart or Environment.
func systemdQuote(s string) string {
	s = strings.NewReplacer(`\`, `\\`, `"`, `\"`, "%", "%%", "$", "$$").Replace(s)
	return `"` + s + `"`
}

func systemdUnitFiles(argv []string, path string, every time.Duration) (service, timer string) {
	words := make([]string, len(argv))
	for i, a := range argv {
		words[i] = systemdQuote(a)
	}
	service = `[Unit]
Description=Remove finished worktrees and trim Go's build cache (dev clean)

[Service]
Type=oneshot
Environment=` + systemdQuote("PATH="+path) + `
ExecStart=` + strings.Join(words, " ") + `
Nice=10
IOSchedulingClass=idle
`
	timer = `[Unit]
Description=Run dev clean every ` + every.String() + `

[Timer]
OnActiveSec=1min
OnUnitActiveSec=` + strconv.Itoa(int(every.Seconds())) + `s

[Install]
WantedBy=timers.target
`
	return service, timer
}
