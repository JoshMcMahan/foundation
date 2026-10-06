package dev

import (
	"context"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"github.com/fsnotify/fsnotify"
)

// Saving from an editor or switching branches touches many files at once;
// one rebuild should follow, not one per file.
const settle = 200 * time.Millisecond

// watcher reports changes to files with the given extensions under dirs.
type watcher struct {
	fs         *fsnotify.Watcher
	exclude    []string
	extensions []string
	logger     *slog.Logger
}

func newWatcher(dirs, exclude, extensions []string, logger *slog.Logger) (*watcher, error) {
	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}
	w := &watcher{fs: fsw, exclude: exclude, extensions: extensions, logger: logger}
	for _, dir := range dirs {
		if err := w.add(dir); err != nil {
			_ = fsw.Close()
			return nil, err
		}
	}
	return w, nil
}

func (w *watcher) skip(name string) bool {
	return (strings.HasPrefix(name, ".") && name != ".") || name == "node_modules" || slices.Contains(w.exclude, name)
}

// add watches dir and every directory below it; fsnotify is not recursive.
func (w *watcher) add(dir string) error {
	return filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			// A directory removed mid-walk, as a branch switch does.
			if os.IsNotExist(err) {
				return nil
			}
			return err
		}
		if !d.IsDir() {
			return nil
		}
		if path != dir && w.skip(d.Name()) {
			return filepath.SkipDir
		}
		return w.fs.Add(path)
	})
}

// run sends on changed once the files stop changing, until ctx ends.
func (w *watcher) run(ctx context.Context, changed chan<- struct{}) {
	defer w.fs.Close()
	timer := time.NewTimer(settle)
	timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case ev, ok := <-w.fs.Events:
			if !ok {
				return
			}
			if ev.Has(fsnotify.Create) {
				if info, err := os.Stat(ev.Name); err == nil && info.IsDir() && !w.skip(filepath.Base(ev.Name)) {
					if err := w.add(ev.Name); err != nil {
						w.logger.WarnContext(ctx, "watch", "dir", ev.Name, "error", err)
					}
					timer.Reset(settle)
					continue
				}
			}
			if ev.Op != fsnotify.Chmod && slices.Contains(w.extensions, filepath.Ext(ev.Name)) {
				timer.Reset(settle)
			}
		case err, ok := <-w.fs.Errors:
			if !ok {
				return
			}
			w.logger.WarnContext(ctx, "watch", "error", err)
		case <-timer.C:
			select {
			case changed <- struct{}{}:
			default: // a rebuild is already pending
			}
		}
	}
}
