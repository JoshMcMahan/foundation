package dev

import (
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/spf13/pflag"
)

// isolateGit keeps the developer's git configuration, such as commit
// signing, out of a test's repositories.
func isolateGit(t *testing.T) {
	t.Helper()
	for k, v := range map[string]string{
		"GIT_CONFIG_GLOBAL": os.DevNull, "GIT_CONFIG_NOSYSTEM": "1",
		"GIT_AUTHOR_NAME": "t", "GIT_AUTHOR_EMAIL": "t@example.com",
		"GIT_COMMITTER_NAME": "t", "GIT_COMMITTER_EMAIL": "t@example.com",
	} {
		t.Setenv(k, v)
	}
}

func gitT(t *testing.T, dir string, args ...string) string {
	t.Helper()
	out, err := exec.CommandContext(t.Context(), "git", append([]string{"-C", dir}, args...)...).CombinedOutput()
	if err != nil {
		t.Fatalf("git %v: %v\n%s", args, err, out)
	}
	return strings.TrimSpace(string(out))
}

// commitIn writes name in dir and commits it.
func commitIn(t *testing.T, dir, name string) {
	t.Helper()
	write(t, filepath.Join(dir, name), name+"\n")
	gitT(t, dir, "add", name)
	gitT(t, dir, "commit", "-q", "-m", name)
}

// age makes a worktree look untouched since d ago.
func age(t *testing.T, dir string, d time.Duration) {
	t.Helper()
	gitDir := gitT(t, dir, "rev-parse", "--path-format=absolute", "--git-dir")
	then := time.Now().Add(-d)
	for _, f := range []string{"index", "HEAD", filepath.Join("logs", "HEAD")} {
		if err := os.Chtimes(filepath.Join(gitDir, f), then, then); err != nil && !os.IsNotExist(err) {
			t.Fatal(err)
		}
	}
}

func TestCleanRemovesFinishedWorktrees(t *testing.T) {
	isolateGit(t)
	var prHeads map[string]bool
	found := mergedPRHeads
	mergedPRHeads = func(context.Context, string) map[string]bool { return prHeads }
	t.Cleanup(func() { mergedPRHeads = found })

	// Git reports resolved paths: /private/var on macOS, not /var.
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	origin, repo := filepath.Join(root, "origin.git"), filepath.Join(root, "repo")
	gitT(t, root, "init", "-q", "--bare", "-b", "main", origin)
	gitT(t, root, "clone", "-q", origin, repo)
	commitIn(t, repo, "a")
	gitT(t, repo, "push", "-q", "origin", "main")
	gitT(t, repo, "remote", "set-head", "origin", "--auto")

	wt := func(name string) string { return filepath.Join(root, name) }
	branch := func(name string) {
		gitT(t, repo, "worktree", "add", "-q", "-b", name, wt(name), "main")
		commitIn(t, wt(name), name)
	}
	for _, name := range []string{"merged", "rebased", "squashed", "pr", "unmerged", "dirty", "running", "stale"} {
		branch(name)
	}
	commitIn(t, wt("squashed"), "squashed-2")
	write(t, filepath.Join(wt("dirty"), "scratch"), "x\n")
	gitT(t, repo, "worktree", "add", "-q", "--detach", wt("detached"), "stale")
	commitIn(t, wt("detached"), "detached")
	detached := gitT(t, wt("detached"), "rev-parse", "HEAD")
	prHeads = map[string]bool{gitT(t, wt("pr"), "rev-parse", "HEAD"): true}

	// Go leaves module caches read-only; ignored, one goes with its worktree.
	write(t, filepath.Join(repo, ".git", "info", "exclude"), "modcache/\n")
	write(t, filepath.Join(wt("merged"), "modcache", "m", "f"), "x\n")
	if err := os.Chmod(filepath.Join(wt("merged"), "modcache", "m"), 0o500); err != nil {
		t.Fatal(err)
	}

	// The default branch takes merged as is, rebased as a new commit after
	// another, and squashed as one commit.
	gitT(t, repo, "merge", "-q", "--ff-only", "merged")
	commitIn(t, repo, "b")
	gitT(t, repo, "cherry-pick", "rebased")
	gitT(t, repo, "merge", "-q", "--squash", "squashed")
	gitT(t, repo, "commit", "-q", "-m", "squashed")
	gitT(t, repo, "push", "-q", "origin", "main")
	for _, name := range []string{"merged", "rebased", "squashed", "pr", "unmerged", "dirty", "running"} {
		age(t, wt(name), 2*time.Hour)
	}
	age(t, wt("stale"), 5*time.Hour)
	age(t, wt("detached"), 5*time.Hour)

	clean := func(opts cleanOptions) string {
		t.Helper()
		var out strings.Builder
		if err := cleanWorktrees(t.Context(), wt("unmerged"), opts, []string{wt("running")}, &out); err != nil {
			t.Fatal(err)
		}
		return out.String()
	}
	exists := func(name string) bool {
		_, err := os.Stat(wt(name))
		return err == nil
	}

	dry := clean(cleanOptions{idle: time.Hour, stale: 4 * time.Hour, dryRun: true})
	for _, name := range []string{"merged", "rebased", "squashed", "pr", "stale", "detached"} {
		if !exists(name) || !strings.Contains(dry, "would remove "+wt(name)) {
			t.Errorf("dry run: %s should be listed and kept:\n%s", name, dry)
		}
	}

	// Within -idle, even finished work stays.
	clean(cleanOptions{idle: 3 * time.Hour})
	if !exists("merged") {
		t.Fatal("removed a worktree touched within -idle")
	}

	out := clean(cleanOptions{idle: time.Hour, stale: 4 * time.Hour})
	want := map[string]bool{
		"merged": false, "rebased": false, "squashed": false, "pr": false, "stale": false, "detached": false,
		"unmerged": true, "dirty": true, "running": true,
	}
	for name, stays := range want {
		if exists(name) != stays {
			t.Errorf("%s exists = %v, want %v\n%s", name, !stays, stays, out)
		}
	}
	// Unmerged work stays on a branch: its own, or one made for a detached HEAD.
	if got := gitT(t, repo, "rev-parse", "dev-clean/detached"); got != detached {
		t.Errorf("dev-clean/detached = %s, want %s", got, detached)
	}
	if !strings.Contains(out, "(unmerged, on stale)") {
		t.Errorf("no note that stale's work stays on its branch:\n%s", out)
	}
	gitT(t, repo, "rev-parse", "--verify", "stale")
}

func TestTrimGoCacheEvictsTheLeastRecentlyUsed(t *testing.T) {
	dir := t.TempDir()
	write(t, filepath.Join(dir, "README"), "the cache's own")
	entry := func(name string, used time.Duration) string {
		p := filepath.Join(dir, name[:2], name)
		write(t, p, strings.Repeat("x", 100))
		then := time.Now().Add(-used)
		if err := os.Chtimes(p, then, then); err != nil {
			t.Fatal(err)
		}
		return p
	}
	oldest := entry("aa-oldest", 72*time.Hour)
	older := entry("bb-older", 48*time.Hour)
	recent := entry("cc-recent", 30*time.Minute)
	newer := entry("dd-newer", 2*time.Hour)

	var out strings.Builder
	if err := trimGoCache(dir, 250, false, &out); err != nil {
		t.Fatal(err)
	}
	for p, stays := range map[string]bool{oldest: false, older: false, newer: true, recent: true, filepath.Join(dir, "README"): true} {
		if _, err := os.Stat(p); (err == nil) != stays {
			t.Errorf("%s exists = %v, want %v", filepath.Base(p), err == nil, stays)
		}
	}
	// Entries a build may be reading now stay, over the limit if need be.
	if err := trimGoCache(dir, 0, false, &out); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(recent); err != nil {
		t.Errorf("removed an entry used within the grace period: %v", err)
	}
	if _, err := os.Stat(newer); err == nil {
		t.Error("kept an entry over the limit")
	}
}

func TestParseSize(t *testing.T) {
	for in, want := range map[string]int64{"60GB": 60 << 30, "500m": 500 << 20, "1.5G": 3 << 29, "0": 0, "2048": 2048} {
		if got, err := parseSize(in); err != nil || got != want {
			t.Errorf("parseSize(%q) = %d, %v; want %d", in, got, err, want)
		}
	}
	for _, in := range []string{"", "lots", "-1GB"} {
		if _, err := parseSize(in); err == nil {
			t.Errorf("parseSize(%q) succeeded", in)
		}
	}
}

// stubScheduler points HOME at a temporary directory and records the
// launchctl and systemctl commands a test would run, running none.
func stubScheduler(t *testing.T) (home string, ran *[][]string) {
	t.Helper()
	home = t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("XDG_CONFIG_HOME", "")
	t.Setenv("PATH", "/opt/bin:/usr/bin")
	ran = new([][]string)
	run := scheduler
	scheduler = func(_ context.Context, name string, args ...string) error {
		*ran = append(*ran, append([]string{name}, args...))
		return nil
	}
	t.Cleanup(func() { scheduler = run })
	return home, ran
}

// defaultSchedule is the flags' defaults, as `dev clean` declares them.
func defaultSchedule() cleanSchedule {
	var s cleanSchedule
	cleanFlags(pflag.NewFlagSet("t", pflag.ContinueOnError), &s)
	return s
}

func given(names ...string) func(string) bool {
	return func(n string) bool { return slices.Contains(names, n) }
}

func TestCleanScheduleFiles(t *testing.T) {
	home, ran := stubScheduler(t)
	s := cleanSchedule{exe: "/bin/dev", repos: []string{"/src/a & b", `/src/"100%" $x`}, idle: 6 * time.Hour, stale: 0, goCache: "25GB", every: 3 * time.Hour}

	if err := installClean(t.Context(), "darwin", s); err != nil {
		t.Fatal(err)
	}
	plist, err := os.ReadFile(filepath.Join(home, "Library", "LaunchAgents", cleanLabel+".plist"))
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"<string>/bin/dev</string>", "<string>clean</string>", "<string>/src/a &amp; b</string>", "<integer>10800</integer>", "<string>/opt/bin:/usr/bin</string>"} {
		if !strings.Contains(string(plist), want) {
			t.Errorf("plist lacks %s:\n%s", want, plist)
		}
	}
	if last := (*ran)[len(*ran)-1]; last[0] != "launchctl" || last[1] != "bootstrap" {
		t.Errorf("launchctl not loaded: %v", *ran)
	}

	*ran = nil
	if err := installClean(t.Context(), "linux", s); err != nil {
		t.Fatal(err)
	}
	units := filepath.Join(home, ".config", "systemd", "user")
	service, err := os.ReadFile(filepath.Join(units, cleanUnit+".service"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(service), `ExecStart="/bin/dev" "clean" "--idle" "6h0m0s" "--stale" "0s" "--go-cache" "25GB" "/src/a & b"`) {
		t.Errorf("service runs the wrong command:\n%s", service)
	}
	timer, err := os.ReadFile(filepath.Join(units, cleanUnit+".timer"))
	if err != nil || !strings.Contains(string(timer), "OnUnitActiveSec=10800s") {
		t.Errorf("timer: %v\n%s", err, timer)
	}
	if !slices.ContainsFunc(*ran, func(c []string) bool {
		return slices.Equal(c, []string{"systemctl", "--user", "enable", "--now", cleanUnit + ".timer"})
	}) {
		t.Errorf("timer not enabled: %v", *ran)
	}

	// What was written reads back as it was, quoting and all.
	for _, goos := range []string{"darwin", "linux"} {
		got, err := readSchedule(goos)
		if err != nil {
			t.Fatalf("%s: %v", goos, err)
		}
		if got == nil || got.exe != s.exe || !slices.Equal(got.repos, s.repos) || got.idle != s.idle || got.stale != s.stale || got.goCache != s.goCache || got.every != s.every {
			t.Errorf("%s: read back %+v, want %+v", goos, got, s)
		}
	}
	if err := installClean(t.Context(), "plan9", s); err == nil {
		t.Error("installed on an unsupported system")
	}
}

func TestCleanScheduleRetriesBootstrap(t *testing.T) {
	_, ran := stubScheduler(t)
	t.Cleanup(func(w time.Duration) func() { return func() { bootstrapWait = w } }(bootstrapWait))
	s := cleanSchedule{exe: "/bin/dev", repos: []string{"/src/a"}, goCache: "25GB", every: 3 * time.Hour}
	// launchctl answers "Input/output error" until bootout's job is gone.
	busy := func(n int) {
		tries := 0
		scheduler = func(_ context.Context, name string, args ...string) error {
			*ran = append(*ran, append([]string{name}, args...))
			if args[0] == "bootstrap" {
				if tries++; tries <= n {
					return errors.New("Bootstrap failed: 5: Input/output error")
				}
			}
			return nil
		}
	}
	bootstraps := func() (n int) {
		for _, r := range *ran {
			if r[1] == "bootstrap" {
				n++
			}
		}
		return n
	}

	bootstrapWait = 5 * time.Second
	busy(2)
	if err := installClean(t.Context(), "darwin", s); err != nil {
		t.Fatalf("install while the old job stops: %v", err)
	}
	if n := bootstraps(); n != 3 {
		t.Errorf("bootstrap ran %d times, want 3", n)
	}

	*ran = nil
	bootstrapWait = 0
	busy(1)
	if err := installClean(t.Context(), "darwin", s); err == nil {
		t.Error("install succeeded though launchctl never took the job")
	}
}

func TestCleanScheduleAppends(t *testing.T) {
	for _, goos := range []string{"darwin", "linux"} {
		t.Run(goos, func(t *testing.T) {
			stubScheduler(t)
			core, games, lib := t.TempDir(), t.TempDir(), t.TempDir()
			install := func(add []string, flags cleanSchedule, names ...string) string {
				t.Helper()
				var out strings.Builder
				if err := scheduleInstall(t.Context(), goos, scheduleChange{exe: "/bin/dev", add: add, flags: flags, given: given(names...)}, &out); err != nil {
					t.Fatal(err)
				}
				return out.String()
			}
			read := func() *cleanSchedule {
				t.Helper()
				s, err := readSchedule(goos)
				if err != nil || s == nil {
					t.Fatalf("readSchedule: %v, %v", s, err)
				}
				return s
			}

			first := defaultSchedule()
			first.idle = 2 * time.Hour
			out := install([]string{core, games}, first, "idle")
			if !strings.Contains(out, core+"  (added)") || !strings.Contains(out, games+"  (added)") {
				t.Errorf("a new schedule's repositories are not marked added:\n%s", out)
			}

			// Lowering the cache limit for one repository keeps the other,
			// and the idle time given before.
			lower := defaultSchedule()
			lower.goCache = "25GB"
			out = install([]string{core}, lower, "go-cache")
			s := read()
			if !slices.Equal(s.repos, []string{core, games}) {
				t.Errorf("repositories = %v, want both kept once", s.repos)
			}
			if s.goCache != "25GB" || s.idle != 2*time.Hour || s.stale != 72*time.Hour || s.every != 3*time.Hour {
				t.Errorf("flags not merged: %+v", s)
			}
			for _, want := range []string{
				"dev clean runs every 3h0m0s on:\n",
				"  " + core + "\n", "  " + games + "\n",
				"--idle 2h0m0s, --stale 72h0m0s, --go-cache 25GB (was 60GB)\n",
			} {
				if !strings.Contains(out, want) {
					t.Errorf("summary lacks %q:\n%s", want, out)
				}
			}
			if strings.Contains(out, "(added)") {
				t.Errorf("a repository already scheduled is marked added:\n%s", out)
			}
			wantLog := "journalctl --user -u " + cleanUnit
			if goos == "darwin" {
				wantLog = cleanLog(os.Getenv("HOME"))
			}
			if !strings.Contains(out, wantLog) {
				t.Errorf("summary does not say where it logs (%s):\n%s", wantLog, out)
			}

			out = install([]string{lib}, defaultSchedule())
			if s := read(); !slices.Equal(s.repos, []string{core, games, lib}) || s.goCache != "25GB" {
				t.Errorf("after adding lib: %+v", s)
			}
			if !strings.Contains(out, lib+"  (added)") || strings.Contains(out, "(was") {
				t.Errorf("summary of adding lib:\n%s", out)
			}

			out = install([]string{games}, defaultSchedule())
			if !strings.Contains(out, "nothing changed") || !strings.Contains(out, lib+"\n") {
				t.Errorf("a re-install that changes nothing should say so and show the schedule:\n%s", out)
			}

			var status strings.Builder
			if err := scheduleStatus(goos, &status); err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(status.String(), "--go-cache 25GB\n") || strings.Contains(status.String(), "added") {
				t.Errorf("status:\n%s", status.String())
			}

			// --replace starts over.
			fresh := defaultSchedule()
			fresh.every = time.Hour
			install([]string{lib}, fresh, "every")
			var replaced strings.Builder
			if err := scheduleInstall(t.Context(), goos, scheduleChange{exe: "/bin/dev", add: []string{lib}, flags: defaultSchedule(), given: given(), replace: true}, &replaced); err != nil {
				t.Fatal(err)
			}
			if s := read(); !slices.Equal(s.repos, []string{lib}) || s.goCache != "60GB" || s.idle != 6*time.Hour || s.every != 3*time.Hour {
				t.Errorf("after --replace: %+v", s)
			}
			if !strings.Contains(replaced.String(), core+"  (removed)") || !strings.Contains(replaced.String(), "every 3h0m0s (was 1h0m0s)") {
				t.Errorf("summary of --replace:\n%s", replaced.String())
			}
		})
	}
}

func TestCleanScheduleUninstall(t *testing.T) {
	for _, goos := range []string{"darwin", "linux"} {
		t.Run(goos, func(t *testing.T) {
			home, _ := stubScheduler(t)
			a, b := t.TempDir(), t.TempDir()
			uninstall := func(repos ...string) string {
				t.Helper()
				var out strings.Builder
				if err := scheduleUninstall(t.Context(), goos, repos, &out); err != nil {
					t.Fatal(err)
				}
				return out.String()
			}
			flags := defaultSchedule()
			flags.goCache = "10GB"
			if err := scheduleInstall(t.Context(), goos, scheduleChange{exe: "/bin/dev", add: []string{a, b}, flags: flags, given: given("go-cache")}, io.Discard); err != nil {
				t.Fatal(err)
			}

			out := uninstall(a)
			s, err := readSchedule(goos)
			if err != nil || s == nil || !slices.Equal(s.repos, []string{b}) || s.goCache != "10GB" {
				t.Fatalf("after removing one: %+v, %v", s, err)
			}
			if !strings.Contains(out, a+"  (removed)") || !strings.Contains(out, "  "+b+"\n") {
				t.Errorf("summary of removing one:\n%s", out)
			}

			if out := uninstall("/not/scheduled"); !strings.Contains(out, "/not/scheduled is not on the schedule") {
				t.Errorf("removing one not scheduled:\n%s", out)
			}

			// The last one takes the schedule with it.
			if out := uninstall(b); !strings.Contains(out, "no longer runs on a schedule") {
				t.Errorf("removing the last:\n%s", out)
			}
			paths, err := schedulePaths(goos, home)
			if err != nil {
				t.Fatal(err)
			}
			for _, f := range paths {
				if _, err := os.Stat(f); err == nil {
					t.Errorf("%s left after removing the last repository", f)
				}
			}
			var status strings.Builder
			if err := scheduleStatus(goos, &status); err != nil || !strings.Contains(status.String(), "does not run on a schedule") {
				t.Errorf("status with none: %v\n%s", err, status.String())
			}

			// Without a repository, the whole schedule goes.
			if err := scheduleInstall(t.Context(), goos, scheduleChange{exe: "/bin/dev", add: []string{a, b}, flags: flags, given: given()}, io.Discard); err != nil {
				t.Fatal(err)
			}
			uninstall()
			if s, err := readSchedule(goos); s != nil || err != nil {
				t.Errorf("after uninstalling everything: %+v, %v", s, err)
			}
		})
	}
}

func TestCleanScheduleUnreadable(t *testing.T) {
	for _, goos := range []string{"darwin", "linux"} {
		t.Run(goos, func(t *testing.T) {
			home, _ := stubScheduler(t)
			paths, err := schedulePaths(goos, home)
			if err != nil {
				t.Fatal(err)
			}
			for _, p := range paths {
				write(t, p, "edited by hand\n")
			}
			if _, err := readSchedule(goos); err == nil {
				t.Fatal("read a hand-edited schedule as dev clean's")
			}
			var status strings.Builder
			if err := scheduleStatus(goos, &status); err != nil || !strings.Contains(status.String(), "not one dev can read") {
				t.Errorf("status: %v\n%s", err, status.String())
			}
			if err := scheduleUninstall(t.Context(), goos, []string{"/src/a"}, io.Discard); err == nil {
				t.Error("removed one repository from a schedule it cannot read")
			}

			a := t.TempDir()
			var out strings.Builder
			if err := scheduleInstall(t.Context(), goos, scheduleChange{exe: "/bin/dev", add: []string{a}, flags: defaultSchedule(), given: given()}, &out); err != nil {
				t.Fatal(err)
			}
			if !strings.Contains(out.String(), "not one dev can read") || !strings.Contains(out.String(), a+"  (added)") {
				t.Errorf("install over an unreadable schedule:\n%s", out.String())
			}
			if s, err := readSchedule(goos); err != nil || s == nil || !slices.Equal(s.repos, []string{a}) {
				t.Errorf("after replacing it: %+v, %v", s, err)
			}
		})
	}
}

func TestCleanInstallCommand(t *testing.T) {
	if runtime.GOOS != "darwin" && runtime.GOOS != "linux" {
		t.Skip("dev clean schedules itself on macOS and Linux")
	}
	isolateGit(t)
	stubScheduler(t)
	exe := cleanExecutable
	cleanExecutable = func() (string, error) { return "/bin/dev", nil }
	t.Cleanup(func() { cleanExecutable = exe })
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	core, games := filepath.Join(root, "core"), filepath.Join(root, "games")
	for _, r := range []string{core, games} {
		gitT(t, root, "init", "-q", r)
	}
	run := func(args ...string) string {
		t.Helper()
		var verbose bool
		cmd := newCleanCmd(&verbose)
		var out strings.Builder
		cmd.SetOut(&out)
		cmd.SetErr(&out)
		cmd.SetArgs(args)
		if err := cmd.ExecuteContext(t.Context()); err != nil {
			t.Fatalf("dev clean %v: %v\n%s", args, err, out.String())
		}
		t.Logf("dev clean %s\n%s", strings.Join(args, " "), out.String())
		return out.String()
	}

	run("--install", "--idle", "4h", core, games)
	run("--install", "--go-cache", "25GB", filepath.Join(core, "."))
	s, err := readSchedule(runtime.GOOS)
	if err != nil || s == nil {
		t.Fatal(s, err)
	}
	if !slices.Equal(s.repos, []string{core, games}) || s.idle != 4*time.Hour || s.goCache != "25GB" {
		t.Errorf("after lowering the cache limit: %+v", s)
	}
	if out := run("--status"); !strings.Contains(out, "--idle 4h0m0s, --stale 72h0m0s, --go-cache 25GB\n") {
		t.Errorf("status:\n%s", out)
	}
	run("--uninstall", games)
	if s, _ := readSchedule(runtime.GOOS); s == nil || !slices.Equal(s.repos, []string{core}) {
		t.Errorf("after removing games: %+v", s)
	}
}
