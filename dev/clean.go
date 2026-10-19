package dev

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"
	"golang.org/x/sys/unix"
)

// cleanOptions says what `dev clean` removes.
type cleanOptions struct {
	idle    time.Duration // keep worktrees touched more recently
	stale   time.Duration // remove unmerged ones untouched this long; 0 never
	dryRun  bool
	verbose bool
}

// worktree is one entry of `git worktree list --porcelain`.
type worktree struct {
	path, head, branch string
	locked             bool
}

// staleWork is keep's answer for unmerged work untouched for the stale
// period: the worktree goes once its commits are on a branch.
const staleWork = "stale"

// mergedPRHeads returns the last commits of the repository's recently merged
// pull requests, so a squash-merged worktree counts as merged. It asks gh,
// and finds none where gh is missing or the repository is not on GitHub. A
// variable so that tests need no network.
var mergedPRHeads = func(ctx context.Context, repo string) map[string]bool {
	heads := map[string]bool{}
	cmd := exec.CommandContext(ctx, "gh", "pr", "list", "--state", "merged", "--limit", "1000", "--json", "headRefOid", "--jq", ".[].headRefOid")
	cmd.Dir = repo
	out, err := cmd.Output()
	if err != nil {
		return heads
	}
	for h := range strings.FieldsSeq(string(out)) {
		heads[h] = true
	}
	return heads
}

func gitIn(ctx context.Context, dir string, args ...string) (string, error) {
	out, err := exec.CommandContext(ctx, "git", append([]string{"-C", dir}, args...)...).Output() //nolint:gosec // git, on the developer's own repositories
	if err != nil {
		if exit, ok := errors.AsType[*exec.ExitError](err); ok {
			return "", fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, strings.TrimSpace(string(exit.Stderr)))
		}
		return "", err
	}
	return strings.TrimSpace(string(out)), nil
}

// cleanWorktrees removes the repository's worktrees whose work its default
// branch has, and those untouched for opts.stale whose commits are safe on a
// branch. It keeps the main worktree, locked ones, those with changes or
// untracked files, those touched within opts.idle, and those a dev in
// running (checkout roots) runs in.
func cleanWorktrees(ctx context.Context, repo string, opts cleanOptions, running []string, out io.Writer) error {
	if _, err := gitIn(ctx, repo, "worktree", "prune"); err != nil {
		return err
	}
	bases, err := baseTrees(ctx, repo)
	if err != nil {
		return err
	}
	list, err := gitIn(ctx, repo, "worktree", "list", "--porcelain")
	if err != nil {
		return err
	}
	var trees []worktree
	for block := range strings.SplitSeq(list, "\n\n") {
		var w worktree
		bare := false
		for line := range strings.SplitSeq(block, "\n") {
			switch {
			case strings.HasPrefix(line, "worktree "):
				w.path = strings.TrimPrefix(line, "worktree ")
			case strings.HasPrefix(line, "HEAD "):
				w.head = strings.TrimPrefix(line, "HEAD ")
			case strings.HasPrefix(line, "branch refs/heads/"):
				w.branch = strings.TrimPrefix(line, "branch refs/heads/")
			case line == "locked" || strings.HasPrefix(line, "locked "):
				w.locked = true
			case line == "bare":
				bare = true
			}
		}
		if w.path != "" && !bare {
			trees = append(trees, w)
		}
	}
	if len(trees) < 2 {
		return nil
	}
	// Git lists the main worktree first; it is never removed.
	main := trees[0].path
	prHeads := mergedPRHeads(ctx, main)
	removed, kept := 0, 0
	for _, w := range trees[1:] {
		why, err := keep(ctx, w, bases, prHeads, running, opts)
		if err != nil {
			fmt.Fprintf(out, "keep %s: %v\n", w.path, err)
			kept++
			continue
		}
		note := ""
		if why == staleWork {
			if note, err = park(ctx, main, w, opts.dryRun); err != nil {
				fmt.Fprintf(out, "keep %s: %v\n", w.path, err)
				kept++
				continue
			}
		} else if why != "" {
			if opts.verbose {
				fmt.Fprintf(out, "keep %s (%s)\n", w.path, why)
			}
			kept++
			continue
		}
		if opts.dryRun {
			fmt.Fprintf(out, "would remove %s%s\n", w.path, note)
			removed++
			continue
		}
		// Ignored files, such as build output and .devstack, go with the
		// worktree. Go leaves module caches read-only, so open them first.
		writable(w.path)
		if _, err := gitIn(ctx, main, "worktree", "remove", "--force", w.path); err != nil {
			fmt.Fprintf(out, "keep %s: %v\n", w.path, err)
			kept++
			continue
		}
		fmt.Fprintf(out, "removed %s%s\n", w.path, note)
		removed++
	}
	verb := "removed"
	if opts.dryRun {
		verb = "to remove"
	}
	fmt.Fprintf(out, "%s: %d %s, %d kept\n", main, removed, verb, kept)
	return nil
}

// baseTrees returns the trees of origin's default branch, as a local branch
// and on origin.
func baseTrees(ctx context.Context, repo string) (map[string]string, error) {
	ref, err := gitIn(ctx, repo, "symbolic-ref", "--short", "refs/remotes/origin/HEAD")
	if err != nil {
		return nil, fmt.Errorf("%s has no default branch for origin; git remote set-head origin --auto sets it: %w", repo, err)
	}
	branch := strings.TrimPrefix(ref, "origin/")
	trees := map[string]string{}
	for _, r := range []string{"refs/heads/" + branch, "refs/remotes/origin/" + branch} {
		if t, err := gitIn(ctx, repo, "rev-parse", "--verify", "--quiet", r+"^{tree}"); err == nil {
			trees[r] = t
		}
	}
	if len(trees) == 0 {
		return nil, fmt.Errorf("%s: no branch %s", repo, branch)
	}
	return trees, nil
}

// keep returns why a worktree stays, "" when its work is in a base, or
// staleWork.
func keep(ctx context.Context, w worktree, bases map[string]string, prHeads map[string]bool, running []string, opts cleanOptions) (string, error) {
	if w.locked {
		return "locked", nil
	}
	if _, err := os.Stat(w.path); err != nil {
		return "missing", nil //nolint:nilerr // gone or unreadable: nothing to remove
	}
	if runsIn(w.path, running) {
		return "dev running", nil
	}
	gitDir, err := gitIn(ctx, w.path, "rev-parse", "--path-format=absolute", "--git-dir")
	if err != nil {
		return "", err
	}
	// The index and HEAD's log change on checkout, commit and staging.
	var touched time.Time
	for _, f := range []string{"index", "HEAD", filepath.Join("logs", "HEAD")} {
		if fi, err := os.Stat(filepath.Join(gitDir, f)); err == nil && fi.ModTime().After(touched) {
			touched = fi.ModTime()
		}
	}
	if time.Since(touched) < opts.idle {
		return "recent", nil
	}
	// Without optional locks, status leaves the index, and its time, alone.
	status, err := gitIn(ctx, w.path, "--no-optional-locks", "status", "--porcelain")
	if err != nil {
		return "", err
	}
	if status != "" {
		return "changes", nil
	}
	if w.head == "" {
		return "no commit", nil
	}
	// A merged pull request ended at this commit: squash-merged, even when
	// the base has edited those lines since.
	if prHeads[w.head] {
		return "", nil
	}
	for ref, tree := range bases {
		if _, err := gitIn(ctx, w.path, "merge-base", "--is-ancestor", w.head, ref); err == nil {
			return "", nil
		}
		// Merging HEAD into the base changes nothing: its work is there
		// already, however it arrived. A conflict means it is not.
		merged, err := gitIn(ctx, w.path, "merge-tree", "--write-tree", ref, w.head)
		if err == nil && strings.SplitN(merged, "\n", 2)[0] == tree {
			return "", nil
		}
		// Every commit has an equal patch in the base: rebased or
		// cherry-picked, even when the base has edited those lines since.
		if cherry, err := gitIn(ctx, w.path, "cherry", ref, w.head); err == nil && !strings.Contains("\n"+cherry, "\n+") {
			return "", nil
		}
	}
	if opts.stale > 0 && time.Since(touched) >= opts.stale {
		return staleWork, nil
	}
	return "unmerged", nil
}

// runsIn reports whether a dev runs in the worktree at path: removing it
// would delete the stack's data under a running Postgres.
func runsIn(path string, running []string) bool {
	resolve := func(p string) string {
		if r, err := filepath.EvalSymlinks(p); err == nil {
			return r
		}
		return p
	}
	path = resolve(path)
	return slices.ContainsFunc(running, func(root string) bool {
		root = resolve(root)
		return root == path || strings.HasPrefix(root, path+string(filepath.Separator))
	})
}

// park makes sure an unmerged worktree's commits stay on a branch, creating
// one named after its folder for a detached HEAD, and returns a note naming
// it.
func park(ctx context.Context, main string, w worktree, dryRun bool) (string, error) {
	if w.branch != "" {
		return " (unmerged, on " + w.branch + ")", nil
	}
	name := "dev-clean/" + filepath.Base(w.path)
	if _, err := gitIn(ctx, main, "rev-parse", "--verify", "--quiet", "refs/heads/"+name); err == nil {
		name += "-" + w.head[:min(12, len(w.head))]
	}
	if !dryRun {
		if _, err := gitIn(ctx, main, "branch", name, w.head); err != nil {
			return "", err
		}
	}
	return " (unmerged, on " + name + ")", nil
}

// writable gives the owner write access to every directory under dir.
func writable(dir string) {
	_ = filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err == nil && d.IsDir() {
			if fi, err := d.Info(); err == nil && fi.Mode().Perm()&0o200 == 0 {
				_ = os.Chmod(p, fi.Mode().Perm()|0o200) //nolint:gosec // the owner's own directory, removed next
			}
		}
		return nil
	})
}

// cacheGrace keeps the entries used this long before a build started, which
// it may be reading: Go refreshes an entry's time on use only once that time
// is an hour old, so it lags the last use by up to an hour, and the go command
// looks up what its tools read before it starts them.
const cacheGrace = 2 * time.Hour

// trimGoCache removes the least recently used entries of Go's build cache in
// dir until it holds at most limit bytes, and further while the disk holding
// it has less than minFree bytes free (0: no floor). It keeps every entry used
// within cacheGrace before since: now, or when the oldest build running
// started. Go trims only entries unused for five days, which never bounds the
// cache of a machine building every day. Entries are content-addressed and
// written by rename, so a removed one is rebuilt, never corrupt.
func trimGoCache(dir string, limit, minFree int64, since time.Time, dryRun bool, out io.Writer) error {
	entries, err := goCacheEntries(dir)
	if err != nil {
		return err
	}
	var total int64
	for _, e := range entries {
		total += e.size
	}
	before := total
	target, floor := limit, ""
	if minFree > 0 {
		free, err := diskFree(dir)
		if err != nil {
			return err
		}
		if free < minFree {
			target = max(0, min(limit, total-(minFree-free)))
			floor = fmt.Sprintf("; %s free, under --min-free %s", formatSize(free), formatSize(minFree))
		}
	}
	cutoff := since.Add(-cacheGrace)
	slices.SortFunc(entries, func(a, b cacheEntry) int { return a.used.Compare(b.used) })
	for _, e := range entries {
		if total <= target || !e.used.Before(cutoff) {
			break
		}
		if !dryRun {
			// A build that started since the walk refreshed what it looked up.
			if fi, err := os.Lstat(e.path); err != nil || !fi.ModTime().Before(cutoff) {
				continue
			}
			if err := os.RemoveAll(e.path); err != nil {
				continue
			}
		}
		total -= e.size
	}
	verb := "freed"
	if dryRun {
		verb = "would free"
	}
	fmt.Fprintf(out, "Go build cache: %s %s, %s left (limit %s%s)\n", verb, formatSize(before-total), formatSize(total), formatSize(limit), floor)
	return nil
}

// cacheEntry is one entry of Go's build cache.
type cacheEntry struct {
	path string
	size int64
	used time.Time
}

// goCacheEntries lists the entries of Go's build cache in dir, as Go's own
// trim finds them: the -a and -d files in its two-hex-digit subdirectories.
// A -d directory is a cached executable, whose time Go refreshes on use
// rather than the file's inside it. The fuzzing corpus beside them is not
// rebuilt, and Go never trims it.
func goCacheEntries(dir string) ([]cacheEntry, error) {
	subdirs, err := os.ReadDir(dir)
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var entries []cacheEntry
	for _, sub := range subdirs {
		if !sub.IsDir() || len(sub.Name()) != 2 || strings.Trim(sub.Name(), "0123456789abcdef") != "" {
			continue
		}
		names, err := os.ReadDir(filepath.Join(dir, sub.Name()))
		if err != nil {
			continue
		}
		for _, n := range names {
			if !strings.HasSuffix(n.Name(), "-a") && !strings.HasSuffix(n.Name(), "-d") {
				continue
			}
			p := filepath.Join(dir, sub.Name(), n.Name())
			info, err := os.Lstat(p)
			if err != nil {
				continue // removed meanwhile
			}
			size := info.Size()
			if info.IsDir() {
				size = 0
				files, _ := os.ReadDir(p)
				for _, f := range files {
					if fi, err := f.Info(); err == nil {
						size += fi.Size()
					}
				}
			}
			entries = append(entries, cacheEntry{p, size, info.ModTime()})
		}
	}
	return entries, nil
}

// diskFree is the space free to this user on the filesystem holding path; a
// variable so that tests need no full disk.
var diskFree = func(path string) (int64, error) {
	var st unix.Statfs_t
	if err := unix.Statfs(path, &st); err != nil {
		return 0, fmt.Errorf("free space of %s: %w", path, err)
	}
	// Through float64, since Bsize's type differs between systems.
	return int64(float64(st.Bavail) * float64(st.Bsize)), nil
}

// process is one running process, its command line split on spaces. A start
// ps did not give is the zero time, as long ago as can be.
type process struct {
	pid, ppid int
	start     time.Time
	args      []string
}

// listProcesses lists the running processes; a variable so that tests do
// not depend on what the machine is running.
var listProcesses = func(ctx context.Context) ([]process, error) {
	// -ww: ps would otherwise cut lines to an exported COLUMNS.
	b, err := exec.CommandContext(ctx, "ps", "-A", "-ww", "-o", "pid=,ppid=,etime=,args=").Output()
	if err != nil {
		return nil, fmt.Errorf("ps: %w", err)
	}
	now := time.Now()
	var procs []process
	for line := range strings.SplitSeq(string(b), "\n") {
		f := strings.Fields(line)
		if len(f) < 4 {
			continue
		}
		pid, err1 := strconv.Atoi(f[0])
		ppid, err2 := strconv.Atoi(f[1])
		if err1 != nil || err2 != nil {
			continue
		}
		p := process{pid: pid, ppid: ppid, args: f[3:]}
		if up, err := parseElapsed(f[2]); err == nil {
			p.start = now.Add(-up)
		}
		procs = append(procs, p)
	}
	return procs, nil
}

// parseElapsed reads ps's elapsed time, [[dd-]hh:]mm:ss.
func parseElapsed(s string) (time.Duration, error) {
	var days time.Duration
	if d, rest, ok := strings.Cut(s, "-"); ok {
		n, err := strconv.Atoi(d)
		if err != nil {
			return 0, fmt.Errorf("elapsed time %q: %w", s, err)
		}
		days, s = time.Duration(n)*24*time.Hour, rest
	}
	parts := strings.Split(s, ":")
	if len(parts) < 2 || len(parts) > 3 {
		return 0, fmt.Errorf("elapsed time %q", s)
	}
	var secs time.Duration
	for _, part := range parts {
		n, err := strconv.Atoi(part)
		if err != nil {
			return 0, fmt.Errorf("elapsed time %q: %w", s, err)
		}
		secs = secs*60 + time.Duration(n)
	}
	return days + secs*time.Second, nil
}

// goCacheUsers are the go subcommands that read and write the build cache.
var goCacheUsers = []string{"build", "test", "vet", "fix", "run", "install", "list", "generate"}

// cacheTools read the cache's compiled packages as they run, from the go
// command or on their own.
var cacheTools = []string{"compile", "link", "vet", "fix", "asm", "cgo", "golangci-lint"}

// oldestBuild returns the process reading Go's build cache that started
// first, nil when none runs. Removing an entry under it breaks it: the go
// command hands compile and the linters paths into the cache it has just
// looked up.
func oldestBuild(procs []process) *process {
	children := map[int][]process{}
	for _, p := range procs {
		children[p.ppid] = append(children[p.ppid], p)
	}
	var oldest *process
	for i, p := range procs {
		if readsGoCache(p, children[p.pid]) && (oldest == nil || p.start.Before(oldest.start)) {
			oldest = &procs[i]
		}
	}
	return oldest
}

// readsGoCache reports whether p, with its child processes, reads Go's build
// cache.
func readsGoCache(p process, children []process) bool {
	name := filepath.Base(p.args[0])
	if slices.Contains(cacheTools, name) {
		return true
	}
	if name != "go" {
		return false
	}
	sub, rest := firstWord(p.args[1:], "C")
	switch sub {
	case "tool":
		tool, _ := firstWord(rest, "C", "modfile", "overlay")
		return slices.Contains(cacheTools, path.Base(tool))
	case "run":
		// go run waits on the program it built, done with the cache.
		return !slices.ContainsFunc(children, func(c process) bool {
			return slices.ContainsFunc(c.args[:min(2, len(c.args))], goRunProgram)
		})
	}
	return slices.Contains(goCacheUsers, sub)
}

// firstWord returns the first argument that is not a flag, and those after
// it, passing over the value of each flag named in valued.
func firstWord(args []string, valued ...string) (string, []string) {
	for i := 0; i < len(args); i++ {
		if !strings.HasPrefix(args[i], "-") {
			return args[i], args[i+1:]
		}
		if slices.Contains(valued, strings.TrimLeft(args[i], "-")) {
			i++
		}
	}
	return "", nil
}

// goRunProgram reports whether exe is a program go run built: in its work
// directory's exe, or, since Go 1.24, the copy it keeps in the build cache,
// wherever GOCACHE is, under an entry named for its hash.
func goRunProgram(exe string) bool {
	dir := filepath.Dir(exe)
	if filepath.Base(dir) == "exe" && strings.HasPrefix(filepath.Base(filepath.Dir(filepath.Dir(dir))), "go-build") {
		return true
	}
	entry := filepath.Base(dir)
	return len(entry) > 4 && strings.HasSuffix(entry, "-d") && filepath.Base(filepath.Dir(dir)) == entry[:2]
}

// cleanGoCache trims Go's build cache, keeping what the builds running may
// read: everything used since an hour before the oldest of them started.
func cleanGoCache(ctx context.Context, limit, minFree int64, dryRun bool, out io.Writer) error {
	dir, err := goCacheDir(ctx)
	if err != nil {
		return err
	}
	procs, err := listProcesses(ctx)
	if err != nil {
		return fmt.Errorf("left Go's build cache untrimmed, as dev cannot tell whether a build is using it: %w", err)
	}
	since := time.Now()
	if p := oldestBuild(procs); p != nil {
		since = p.start
		when := "since " + p.start.Format(time.DateTime)
		if p.start.IsZero() {
			when = "since an unknown time"
		}
		fmt.Fprintf(out, "Go build cache: keeping what a build running %s may read (%d %s)\n", when, p.pid, strings.Join(p.args, " "))
	}
	return trimGoCache(dir, limit, minFree, since, dryRun, out)
}

// goCacheDir is Go's build cache, as the go command finds it.
func goCacheDir(ctx context.Context) (string, error) {
	out, err := exec.CommandContext(ctx, "go", "env", "GOCACHE").Output()
	if err != nil {
		return "", fmt.Errorf("go env GOCACHE: %w", err)
	}
	dir := strings.TrimSpace(string(out))
	if dir == "" || dir == "off" {
		return "", errors.New("the Go build cache is off")
	}
	return dir, nil
}

var sizeUnits = []struct {
	suffix string
	bytes  int64
}{{"TB", 1 << 40}, {"GB", 1 << 30}, {"MB", 1 << 20}, {"KB", 1 << 10}, {"T", 1 << 40}, {"G", 1 << 30}, {"M", 1 << 20}, {"K", 1 << 10}, {"B", 1}}

// parseSize reads a size such as 60GB, 500M or 0.
func parseSize(s string) (int64, error) {
	t := strings.ToUpper(strings.TrimSpace(s))
	mult := int64(1)
	for _, u := range sizeUnits {
		if strings.HasSuffix(t, u.suffix) {
			t, mult = strings.TrimSpace(strings.TrimSuffix(t, u.suffix)), u.bytes
			break
		}
	}
	n, err := strconv.ParseFloat(t, 64)
	if err != nil || n < 0 {
		return 0, fmt.Errorf("size %q: want a number of bytes, or one with KB, MB, GB or TB", s)
	}
	return int64(n * float64(mult)), nil
}

func formatSize(n int64) string {
	for _, u := range sizeUnits[:4] {
		if n >= u.bytes {
			return strconv.FormatFloat(float64(n)/float64(u.bytes), 'f', 1, 64) + u.suffix
		}
	}
	return strconv.FormatInt(n, 10) + "B"
}

func newCleanCmd(verbose *bool) *cobra.Command {
	var (
		opts                       cleanOptions
		sched                      cleanSchedule
		install, uninstall, status bool
		replace                    bool
	)
	cmd := &cobra.Command{
		Use:   "clean [repository...]",
		Short: "Remove finished worktrees and trim Go's build cache",
		Long: "Remove the worktrees of each repository (default: the one here) whose work its default branch has: " +
			"merged, rebased, cherry-picked, or squash-merged in a pull request that gh finds ending at the worktree's commit. " +
			"Worktrees untouched for --stale go too, merged or not: their commits stay on their branch, and a detached HEAD " +
			"gets a dev-clean/<folder> branch first, so `git worktree add <path> <branch>` brings any back. " +
			"A worktree stays while it has changes or untracked files, is locked, was touched within --idle, or runs a dev. " +
			"Ignored files in a removed worktree, such as build output and .devstack, go with it.\n\n" +
			"Then trim Go's build cache to --go-cache, least recently used first: Go itself only drops what has been " +
			"unused for five days, which never bounds the cache of a machine that builds every day. " +
			"While the disk holding the cache has less than --min-free free, trim further, until it has or the cache is empty. " +
			"While a go build, test, vet or similar, or golangci-lint, is running, the trim keeps everything used since " +
			"an hour before it started: removing entries under a build breaks it.\n\n" +
			"--install runs it on a schedule, every --every. It adds the repositories to those already scheduled, " +
			"and the flags given replace the schedule's, while those not given keep their scheduled values; " +
			"--replace schedules only this call's repositories and flags instead. " +
			"--uninstall with repositories takes just those off the schedule, and without any removes the schedule. " +
			"--status shows the schedule and changes nothing.",
		Example: `  dev clean -n                           # what would go
  dev clean ~/src/app ~/src/lib
  dev clean --install ~/src/app          # every 15m from now on, with any already scheduled
  dev clean --install --go-cache 25GB    # add the repository here, lowering one limit
  dev clean --status
  dev clean --uninstall ~/src/lib        # stop cleaning one repository
  dev clean --uninstall                  # stop the schedule`,
		Annotations: map[string]string{anywhere: "yes"},
		RunE: func(cmd *cobra.Command, repos []string) error {
			ctx := cmd.Context()
			out := cmd.OutOrStdout()
			goos := runtime.GOOS
			if replace && !install {
				return errors.New("--replace goes with --install")
			}
			if status {
				if len(repos) > 0 {
					return errors.New("--status takes no repository")
				}
				return scheduleStatus(goos, out)
			}
			if uninstall {
				// A repository gone from disk still comes off the schedule.
				for i, r := range repos {
					if top, err := gitIn(ctx, r, "rev-parse", "--show-toplevel"); err == nil {
						repos[i] = top
					} else if abs, err := filepath.Abs(r); err == nil {
						repos[i] = abs
					}
				}
				return scheduleUninstall(ctx, goos, repos, out)
			}
			limit, err := parseSize(sched.goCache)
			if err != nil {
				return err
			}
			minFree, err := parseSize(sched.minFree)
			if err != nil {
				return err
			}
			if len(repos) == 0 {
				repos = []string{"."}
			}
			for i, r := range repos {
				top, err := gitIn(ctx, r, "rev-parse", "--show-toplevel")
				if err != nil {
					return fmt.Errorf("%s is not in a git repository", r)
				}
				repos[i] = top
			}
			if install {
				exe, err := cleanExecutable()
				if err != nil {
					return err
				}
				return scheduleInstall(ctx, goos, scheduleChange{
					exe: exe, add: repos, flags: sched, given: cmd.Flags().Changed, replace: replace,
				}, out)
			}
			opts.verbose = *verbose
			opts.idle, opts.stale = sched.idle, sched.stale
			running, err := Instances(ctx)
			if err != nil {
				return err
			}
			roots := make([]string, len(running))
			for i, in := range running {
				roots[i] = in.Root
			}
			var errs []error
			for _, r := range repos {
				errs = append(errs, cleanWorktrees(ctx, r, opts, roots, out))
			}
			if limit > 0 {
				errs = append(errs, cleanGoCache(ctx, limit, minFree, opts.dryRun, out))
			}
			return errors.Join(errs...)
		},
	}
	f := cmd.Flags()
	f.BoolVarP(&opts.dryRun, "dry-run", "n", false, "list what would go, and remove nothing")
	cleanFlags(f, &sched)
	f.BoolVar(&install, "install", false, "run dev clean on a schedule, adding these repositories and flags to it")
	f.BoolVar(&replace, "replace", false, "with --install, schedule only these repositories and flags, dropping the others")
	f.BoolVar(&uninstall, "uninstall", false, "take these repositories off the schedule, or with none, stop it")
	f.BoolVar(&status, "status", false, "show the schedule, changing nothing")
	cmd.MarkFlagsMutuallyExclusive("install", "uninstall", "status")
	cmd.MarkFlagsMutuallyExclusive("dry-run", "install")
	cmd.MarkFlagsMutuallyExclusive("dry-run", "uninstall")
	cmd.MarkFlagsMutuallyExclusive("dry-run", "status")
	return cmd
}
