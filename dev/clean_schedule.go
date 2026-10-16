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
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/pflag"
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
// temporary build that will be gone by then. A variable so that tests, a
// temporary build, can install a schedule.
var cleanExecutable = func() (string, error) {
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

// cleanSchedule is what a scheduled dev clean runs: which dev, on which
// repositories, with which flags, and how often.
type cleanSchedule struct {
	exe     string
	repos   []string
	idle    time.Duration
	stale   time.Duration
	goCache string
	every   time.Duration
}

// args are the schedule's arguments to `dev clean`.
func (s cleanSchedule) args() []string {
	return append([]string{"--idle", s.idle.String(), "--stale", s.stale.String(), "--go-cache", s.goCache}, s.repos...)
}

// cleanFlags declares the flags a schedule keeps, so that `dev clean` and
// reading a schedule back agree on their names and defaults.
func cleanFlags(f *pflag.FlagSet, s *cleanSchedule) {
	f.DurationVar(&s.idle, "idle", 6*time.Hour, "keep worktrees touched more recently than this")
	f.DurationVar(&s.stale, "stale", 72*time.Hour, "remove unmerged worktrees untouched this long, keeping their commits on a branch (0: never)")
	f.StringVar(&s.goCache, "go-cache", "60GB", "trim Go's build cache to this size (0: leave it)")
	f.DurationVar(&s.every, "every", 3*time.Hour, "how often the schedule runs")
}

// schedulePaths are the files a schedule lives in: the launchd agent, or the
// systemd service and timer.
func schedulePaths(goos, home string) ([]string, error) {
	switch goos {
	case "darwin":
		return []string{filepath.Join(home, "Library", "LaunchAgents", cleanLabel+".plist")}, nil
	case "linux":
		units := systemdUnits(home)
		return []string{filepath.Join(units, cleanUnit+".service"), filepath.Join(units, cleanUnit+".timer")}, nil
	}
	return nil, fmt.Errorf("dev clean cannot schedule itself on %s; run it from your own scheduler", goos)
}

// readSchedule reads back the schedule installClean wrote: nil when there is
// none, and an error when one is there but cannot be read as dev clean's.
//
// The installed files are the record rather than a state file beside them:
// they are what actually runs, so the two can never disagree, and removing
// them by hand, or with launchctl or systemctl, leaves nothing stale behind.
func readSchedule(goos string) (*cleanSchedule, error) {
	home, err := os.UserHomeDir()
	if err != nil {
		return nil, err
	}
	paths, err := schedulePaths(goos, home)
	if err != nil {
		return nil, err
	}
	files := make([][]byte, len(paths))
	for i, p := range paths {
		b, err := os.ReadFile(p) //nolint:gosec // the schedule's own files, under HOME
		if errors.Is(err, os.ErrNotExist) {
			return nil, nil
		}
		if err != nil {
			return nil, err
		}
		files[i] = b
	}
	var (
		argv  []string
		every time.Duration
	)
	if goos == "darwin" {
		argv, every, err = parsePlist(files[0])
	} else {
		argv, every, err = parseSystemdUnits(string(files[0]), string(files[1]))
	}
	if err != nil {
		return nil, fmt.Errorf("%s: %w", paths[0], err)
	}
	if len(argv) < 2 || argv[1] != "clean" {
		return nil, fmt.Errorf("%s does not run dev clean", paths[0])
	}
	s := cleanSchedule{exe: argv[0]}
	f := pflag.NewFlagSet("clean", pflag.ContinueOnError)
	f.SetOutput(io.Discard)
	cleanFlags(f, &s)
	if err := f.Parse(argv[2:]); err != nil {
		return nil, fmt.Errorf("%s: %w", paths[0], err)
	}
	s.repos, s.every = f.Args(), every
	if len(s.repos) == 0 {
		return nil, fmt.Errorf("%s names no repository", paths[0])
	}
	return &s, nil
}

// plistNode is any element of a property list, kept in document order: a
// dict is its keys each followed by its value.
type plistNode struct {
	XMLName xml.Name
	Text    string      `xml:",chardata"`
	Nodes   []plistNode `xml:",any"`
}

func parsePlist(b []byte) (argv []string, every time.Duration, err error) {
	var root plistNode
	if err := xml.Unmarshal(b, &root); err != nil {
		return nil, 0, err
	}
	if len(root.Nodes) != 1 || root.Nodes[0].XMLName.Local != "dict" {
		return nil, 0, errors.New("not a property list of a dict")
	}
	dict := root.Nodes[0].Nodes
	for i := 0; i+1 < len(dict); i += 2 {
		key, value := strings.TrimSpace(dict[i].Text), dict[i+1]
		switch key {
		case "ProgramArguments":
			for _, n := range value.Nodes {
				argv = append(argv, n.Text)
			}
		case "StartInterval":
			n, err := strconv.Atoi(strings.TrimSpace(value.Text))
			if err != nil || n <= 0 {
				return nil, 0, fmt.Errorf("StartInterval %q is not a number of seconds", value.Text)
			}
			every = time.Duration(n) * time.Second
		}
	}
	if every == 0 {
		return nil, 0, errors.New("no StartInterval")
	}
	return argv, every, nil
}

func parseSystemdUnits(service, timer string) (argv []string, every time.Duration, err error) {
	for line := range strings.SplitSeq(service, "\n") {
		if v, ok := strings.CutPrefix(strings.TrimSpace(line), "ExecStart="); ok {
			if argv, err = systemdWords(v); err != nil {
				return nil, 0, err
			}
		}
	}
	for line := range strings.SplitSeq(timer, "\n") {
		if v, ok := strings.CutPrefix(strings.TrimSpace(line), "OnUnitActiveSec="); ok {
			// systemd reads a bare number as seconds; Go needs the unit.
			v = strings.TrimSpace(v)
			if _, err := strconv.Atoi(v); err == nil {
				v += "s"
			}
			if every, err = time.ParseDuration(v); err != nil || every <= 0 {
				return nil, 0, fmt.Errorf("OnUnitActiveSec=%s is not a duration dev reads", v)
			}
		}
	}
	if argv == nil {
		return nil, 0, errors.New("no ExecStart")
	}
	if every == 0 {
		return nil, 0, errors.New("the timer has no OnUnitActiveSec")
	}
	return argv, every, nil
}

// systemdWords splits a command line as systemdQuote writes it, and reads
// unquoted words too, for a unit edited by hand.
func systemdWords(s string) ([]string, error) {
	var (
		words []string
		word  strings.Builder
		in    bool // a word has started
		quote bool
	)
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case quote && c == '\\' && i+1 < len(s):
			i++
			word.WriteByte(s[i])
		case quote && c == '"':
			quote = false
		case !quote && c == '"':
			quote, in = true, true
		case !quote && (c == ' ' || c == '\t'):
			if in {
				words = append(words, word.String())
				word.Reset()
				in = false
			}
		case (c == '%' || c == '$') && i+1 < len(s) && s[i+1] == c:
			i++
			word.WriteByte(c)
			in = true
		default:
			word.WriteByte(c)
			in = true
		}
	}
	if quote {
		return nil, errors.New("ExecStart has an unclosed quote")
	}
	if in {
		words = append(words, word.String())
	}
	return words, nil
}

// installClean schedules `s.exe clean` with the schedule's repositories and
// flags every s.every, and once now: a launchd agent on macOS, a systemd user
// timer on Linux. It replaces the files of a schedule installed before.
func installClean(ctx context.Context, goos string, s cleanSchedule) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	paths, err := schedulePaths(goos, home)
	if err != nil {
		return err
	}
	argv := append([]string{s.exe, "clean"}, s.args()...)
	// The job finds git, gh and go where this shell does.
	path := os.Getenv("PATH")
	if goos == "darwin" {
		if err := writeFile(paths[0], launchdPlist(argv, path, cleanLog(home), s.every)); err != nil {
			return err
		}
		domain := "gui/" + strconv.Itoa(os.Getuid())
		_ = scheduler(ctx, "launchctl", "bootout", domain+"/"+cleanLabel) // not loaded yet is fine
		return scheduler(ctx, "launchctl", "bootstrap", domain, paths[0])
	}
	service, timer := systemdUnitFiles(argv, path, s.every)
	if err := writeFile(paths[0], service); err != nil {
		return err
	}
	if err := writeFile(paths[1], timer); err != nil {
		return err
	}
	if err := scheduler(ctx, "systemctl", "--user", "daemon-reload"); err != nil {
		return err
	}
	return scheduler(ctx, "systemctl", "--user", "enable", "--now", cleanUnit+".timer")
}

func cleanLog(home string) string {
	return filepath.Join(home, "Library", "Logs", cleanUnit+".log")
}

// uninstallClean removes the schedule installClean made, if any.
func uninstallClean(ctx context.Context, goos string, out io.Writer) error {
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	paths, err := schedulePaths(goos, home)
	if err != nil {
		return err
	}
	if goos == "darwin" {
		_ = scheduler(ctx, "launchctl", "bootout", "gui/"+strconv.Itoa(os.Getuid())+"/"+cleanLabel) // not loaded is fine
	} else {
		_ = scheduler(ctx, "systemctl", "--user", "disable", "--now", cleanUnit+".timer") // not enabled is fine
	}
	for _, f := range paths {
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

// scheduleChange is what `dev clean --install` asks of the schedule.
type scheduleChange struct {
	exe     string
	add     []string          // repositories, absolute
	flags   cleanSchedule     // the values of the flags below
	given   func(string) bool // whether a flag was given on the command line
	replace bool              // start from the defaults, not the schedule installed
}

// scheduleInstall adds repositories to the schedule installed, or makes
// one, and reports the result. Flags given replace the schedule's values;
// the rest keep them, so lowering one limit leaves the others as they were.
func scheduleInstall(ctx context.Context, goos string, c scheduleChange, out io.Writer) error {
	old, err := readSchedule(goos)
	if err != nil {
		fmt.Fprintf(out, "The schedule installed before is not one dev can read (%v); replacing it.\n", err)
		old = nil
	}
	next := c.flags
	next.exe, next.repos = c.exe, nil
	if old != nil && !c.replace {
		keep := func(name string, dst *time.Duration, v time.Duration) {
			if !c.given(name) {
				*dst = v
			}
		}
		keep("idle", &next.idle, old.idle)
		keep("stale", &next.stale, old.stale)
		keep("every", &next.every, old.every)
		if !c.given("go-cache") {
			next.goCache = old.goCache
		}
		next.repos = slices.Clone(old.repos)
	}
	for _, r := range c.add {
		if !slices.Contains(next.repos, r) {
			next.repos = append(next.repos, r)
		}
	}
	if err := installClean(ctx, goos, next); err != nil {
		return err
	}
	if old != nil && slices.Equal(old.args(), next.args()) && old.every == next.every {
		fmt.Fprintln(out, "The schedule already had these; nothing changed.")
	}
	return describeSchedule(goos, old, &next, out)
}

// scheduleUninstall removes repositories from the schedule, and the whole
// schedule when none is named or none is left.
func scheduleUninstall(ctx context.Context, goos string, remove []string, out io.Writer) error {
	if len(remove) == 0 {
		return uninstallClean(ctx, goos, out)
	}
	old, err := readSchedule(goos)
	if err != nil {
		return fmt.Errorf("the schedule installed is not one dev can read, so dev cannot remove one repository from it; dev clean --uninstall removes it all: %w", err)
	}
	if old == nil {
		fmt.Fprintln(out, "dev clean does not run on a schedule")
		return nil
	}
	next := *old
	next.repos = slices.DeleteFunc(slices.Clone(old.repos), func(r string) bool { return slices.Contains(remove, r) })
	for _, r := range remove {
		if !slices.Contains(old.repos, r) {
			fmt.Fprintf(out, "%s is not on the schedule\n", r)
		}
	}
	if len(next.repos) == len(old.repos) {
		return describeSchedule(goos, old, old, out)
	}
	if len(next.repos) == 0 {
		return uninstallClean(ctx, goos, out)
	}
	if err := installClean(ctx, goos, next); err != nil {
		return err
	}
	return describeSchedule(goos, old, &next, out)
}

// scheduleStatus reports the schedule installed, changing nothing.
func scheduleStatus(goos string, out io.Writer) error {
	s, err := readSchedule(goos)
	if err != nil {
		fmt.Fprintf(out, "A schedule is installed, but not one dev can read (%v). dev clean --install replaces it.\n", err)
		return nil
	}
	return describeSchedule(goos, s, s, out)
}

// describeSchedule prints the schedule now, next, marking what changed from
// the one before, old (nil when there was none).
func describeSchedule(goos string, old, next *cleanSchedule, out io.Writer) error {
	if next == nil {
		fmt.Fprintln(out, "dev clean does not run on a schedule; dev clean --install [repository...] schedules it")
		return nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return err
	}
	was := func(now, before string) string {
		if old == nil || now == before {
			return now
		}
		return now + " (was " + before + ")"
	}
	var prev cleanSchedule
	if old != nil {
		prev = *old
	}
	fmt.Fprintf(out, "dev clean runs every %s on:\n", was(next.every.String(), prev.every.String()))
	for _, r := range next.repos {
		note := ""
		if !slices.Contains(prev.repos, r) {
			note = "  (added)"
		}
		if _, err := os.Stat(r); err != nil {
			note += "  (not found)"
		}
		fmt.Fprintf(out, "  %s%s\n", r, note)
	}
	for _, r := range prev.repos {
		if !slices.Contains(next.repos, r) {
			fmt.Fprintf(out, "  %s  (removed)\n", r)
		}
	}
	fmt.Fprintf(out, "with --idle %s, --stale %s, --go-cache %s\n",
		was(next.idle.String(), prev.idle.String()), was(next.stale.String(), prev.stale.String()), was(next.goCache, prev.goCache))
	if goos == "darwin" {
		fmt.Fprintf(out, "logging to %s\n", cleanLog(home))
	} else {
		fmt.Fprintf(out, "logging to the journal: journalctl --user -u %s\n", cleanUnit)
	}
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
