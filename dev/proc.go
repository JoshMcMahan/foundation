package dev

import (
	"bytes"
	"errors"
	"io"
	"os"
	"os/exec"
	"sync"
	"syscall"
	"time"
)

// proc is a command running in its own process group. Signalling only the
// command would orphan what it forks: pnpm starts vite, go run starts the
// binary, and both outlive their parent.
type proc struct {
	cmd    *exec.Cmd
	done   chan struct{} // the command has exited
	err    error
	copied chan struct{} // its output is drained
}

func startProc(args []string, dir string, env []string, out io.Writer) (*proc, error) {
	// With a plain io.Writer, Wait would also wait for every process holding
	// the output open, including children that ignore SIGTERM. A pipe of our
	// own lets Wait track only the command.
	r, w, err := os.Pipe()
	if err != nil {
		return nil, err
	}
	cmd := exec.Command(args[0], args[1:]...) //nolint:gosec,noctx // the developer's own commands; stop ends the whole group
	cmd.Dir = dir
	cmd.Env = env
	cmd.Stdout = w
	cmd.Stderr = w
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
	err = cmd.Start()
	_ = w.Close()
	if err != nil {
		_ = r.Close()
		return nil, err
	}
	p := &proc{cmd: cmd, done: make(chan struct{}), copied: make(chan struct{})}
	go func() {
		_, _ = io.Copy(out, r)
		_ = r.Close()
		close(p.copied)
	}()
	go func() {
		p.err = cmd.Wait()
		close(p.done)
	}()
	return p, nil
}

// drain waits briefly for output still in flight after the command exited.
// A process that left its group can hold the pipe open indefinitely.
func (p *proc) drain() {
	select {
	case <-p.copied:
	case <-time.After(time.Second):
	}
}

// stop sends the group SIGTERM, then SIGKILL after stopGrace, and returns
// once the command has exited. Members that outlive the leader are killed too.
func (p *proc) stop() {
	pgid := p.cmd.Process.Pid
	_ = syscall.Kill(-pgid, syscall.SIGTERM)
	select {
	case <-p.done:
	case <-time.After(stopGrace):
		_ = syscall.Kill(-pgid, syscall.SIGKILL)
		<-p.done
	}
	_ = syscall.Kill(-pgid, syscall.SIGKILL)
	p.drain()
}

// lineWriter prefixes each line of a process's output, so that concurrent
// processes interleave by line rather than mid-line.
type lineWriter struct {
	mu     *sync.Mutex
	out    io.Writer
	prefix string
	buf    []byte
}

func (w *lineWriter) Write(p []byte) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.buf = append(w.buf, p...)
	for {
		i := bytes.IndexByte(w.buf, '\n')
		if i < 0 {
			break
		}
		if _, err := io.WriteString(w.out, w.prefix+string(w.buf[:i+1])); err != nil {
			return len(p), err
		}
		w.buf = w.buf[i+1:]
	}
	return len(p), nil
}

// flush writes a final line that had no newline.
func (w *lineWriter) flush() {
	w.mu.Lock()
	defer w.mu.Unlock()
	if len(w.buf) > 0 {
		_, _ = io.WriteString(w.out, w.prefix+string(w.buf)+"\n")
		w.buf = nil
	}
}

func exitStatus(err error) string {
	var exit *exec.ExitError
	if errors.As(err, &exit) {
		return exit.String()
	}
	if err != nil {
		return err.Error()
	}
	return "exit status 0"
}
