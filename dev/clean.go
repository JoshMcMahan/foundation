package dev

import (
	"context"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"time"

	"github.com/spf13/cobra"
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

// cacheGrace keeps entries used this recently, which a build running now
// may be about to read.
const cacheGrace = time.Hour

// trimGoCache removes the least recently used entries of Go's build cache in
// dir until it holds at most limit bytes. Go trims only entries unused for
// five days, which never bounds the cache of a machine building every day.
// Entries are content-addressed and written by rename, so a removed one is
// rebuilt, never corrupt.
func trimGoCache(dir string, limit int64, dryRun bool, out io.Writer) error {
	type entry struct {
		path string
		size int64
		used time.Time
	}
	var entries []entry
	var total int64
	err := filepath.WalkDir(dir, func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return nil //nolint:nilerr // an entry removed meanwhile, or unreadable: skip it
		}
		// Entries live in the two-hex-digit subdirectories; the cache's own
		// README and trim stamp sit at its root.
		if d.IsDir() || filepath.Dir(p) == dir {
			return nil
		}
		info, err := d.Info()
		if err != nil {
			return nil //nolint:nilerr // removed meanwhile
		}
		// Go refreshes an entry's time on use, as its own trimming relies on.
		entries = append(entries, entry{p, info.Size(), info.ModTime()})
		total += info.Size()
		return nil
	})
	if err != nil {
		return err
	}
	before := total
	slices.SortFunc(entries, func(a, b entry) int { return a.used.Compare(b.used) })
	for _, e := range entries {
		if total <= limit || time.Since(e.used) < cacheGrace {
			break
		}
		if !dryRun {
			if err := os.Remove(e.path); err != nil {
				continue
			}
		}
		total -= e.size
	}
	verb := "freed"
	if dryRun {
		verb = "would free"
	}
	fmt.Fprintf(out, "Go build cache: %s %s, %s left (limit %s)\n", verb, formatSize(before-total), formatSize(total), formatSize(limit))
	return nil
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
		opts               cleanOptions
		goCache            string
		install, uninstall bool
		every              time.Duration
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
			"unused for five days, which never bounds the cache of a machine that builds every day.\n\n" +
			"--install runs it on a schedule, every --every, with the same repositories and flags.",
		Example: `  dev clean -n                       # what would go
  dev clean ~/src/app ~/src/lib
  dev clean --install ~/src/app      # every 3h, from now on
  dev clean --uninstall`,
		Annotations: map[string]string{anywhere: "yes"},
		RunE: func(cmd *cobra.Command, repos []string) error {
			ctx := cmd.Context()
			out := cmd.OutOrStdout()
			if uninstall {
				return uninstallClean(ctx, runtime.GOOS, out)
			}
			limit, err := parseSize(goCache)
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
				args := append([]string{"--idle", opts.idle.String(), "--stale", opts.stale.String(), "--go-cache", goCache}, repos...)
				return installClean(ctx, runtime.GOOS, exe, args, every, out)
			}
			opts.verbose = *verbose
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
				dir, err := goCacheDir(ctx)
				if err == nil {
					err = trimGoCache(dir, limit, opts.dryRun, out)
				}
				errs = append(errs, err)
			}
			return errors.Join(errs...)
		},
	}
	f := cmd.Flags()
	f.BoolVarP(&opts.dryRun, "dry-run", "n", false, "list what would go, and remove nothing")
	f.DurationVar(&opts.idle, "idle", 6*time.Hour, "keep worktrees touched more recently than this")
	f.DurationVar(&opts.stale, "stale", 72*time.Hour, "remove unmerged worktrees untouched this long, keeping their commits on a branch (0: never)")
	f.StringVar(&goCache, "go-cache", "60GB", "trim Go's build cache to this size (0: leave it)")
	f.BoolVar(&install, "install", false, "run dev clean on a schedule, with these repositories and flags")
	f.DurationVar(&every, "every", 3*time.Hour, "how often the schedule runs")
	f.BoolVar(&uninstall, "uninstall", false, "stop running dev clean on a schedule")
	cmd.MarkFlagsMutuallyExclusive("install", "uninstall")
	cmd.MarkFlagsMutuallyExclusive("dry-run", "install")
	return cmd
}
