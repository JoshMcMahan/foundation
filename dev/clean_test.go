package dev

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"
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

func TestCleanSchedules(t *testing.T) {
	home := t.TempDir()
	t.Setenv("HOME", home)
	t.Setenv("XDG_CONFIG_HOME", "")
	t.Setenv("PATH", "/opt/bin:/usr/bin")
	var ran [][]string
	run := scheduler
	scheduler = func(_ context.Context, name string, args ...string) error {
		ran = append(ran, append([]string{name}, args...))
		return nil
	}
	t.Cleanup(func() { scheduler = run })
	argv := []string{"--idle", "6h0m0s", "/src/a & b"}
	var out strings.Builder

	if err := installClean(t.Context(), "darwin", "/bin/dev", argv, 3*time.Hour, &out); err != nil {
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
	if last := ran[len(ran)-1]; last[0] != "launchctl" || last[1] != "bootstrap" {
		t.Errorf("launchctl not loaded: %v", ran)
	}

	ran = nil
	if err := installClean(t.Context(), "linux", "/bin/dev", argv, 3*time.Hour, &out); err != nil {
		t.Fatal(err)
	}
	units := filepath.Join(home, ".config", "systemd", "user")
	service, err := os.ReadFile(filepath.Join(units, cleanUnit+".service"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(service), `ExecStart="/bin/dev" "clean" "--idle" "6h0m0s" "/src/a & b"`) {
		t.Errorf("service runs the wrong command:\n%s", service)
	}
	timer, err := os.ReadFile(filepath.Join(units, cleanUnit+".timer"))
	if err != nil || !strings.Contains(string(timer), "OnUnitActiveSec=10800s") {
		t.Errorf("timer: %v\n%s", err, timer)
	}
	if !slices.ContainsFunc(ran, func(c []string) bool {
		return slices.Equal(c, []string{"systemctl", "--user", "enable", "--now", cleanUnit + ".timer"})
	}) {
		t.Errorf("timer not enabled: %v", ran)
	}

	for _, goos := range []string{"darwin", "linux"} {
		if err := uninstallClean(t.Context(), goos, &out); err != nil {
			t.Fatal(err)
		}
	}
	for _, f := range []string{filepath.Join(home, "Library", "LaunchAgents", cleanLabel+".plist"), filepath.Join(units, cleanUnit+".service"), filepath.Join(units, cleanUnit+".timer")} {
		if _, err := os.Stat(f); err == nil {
			t.Errorf("%s left after uninstall", f)
		}
	}
	if err := installClean(t.Context(), "plan9", "/bin/dev", argv, time.Hour, &out); err == nil {
		t.Error("installed on an unsupported system")
	}
}
