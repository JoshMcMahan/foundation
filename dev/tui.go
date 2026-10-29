package dev

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"sync"
	"time"

	tea "charm.land/bubbletea/v2"
	"charm.land/lipgloss/v2"
	"github.com/charmbracelet/x/ansi"
	"github.com/lmittmann/tint"
)

// runTUI runs the supervisor behind a full-screen view of its services: their
// states, each one's output, and keys to start, stop and restart them.
func runTUI(ctx context.Context, cfg Config, names []string, ext extension) error {
	ctx, cancel := context.WithCancel(ctx)
	defer cancel()

	// A dev already running here, such as one an agent started with dev up,
	// gets this view instead of a second dev.
	if _, err := control(ctx, cfg, controlRequest{Command: "status"}); err == nil {
		return runAttached(ctx, cfg, ext)
	}

	// dev's own log goes to its own pane; on the terminal it would tear the
	// screen.
	devLog := &tuiLog{}
	probs := newProblems(tint.NewTextHandler(devLog, &tint.Options{TimeFormat: time.TimeOnly, NoColor: true}))
	logger := slog.New(probs)
	s, err := newSupervisor(ctx, cfg, logger, discard{})
	if err != nil {
		return err
	}
	devLog.set(s.outputs.writer("dev"))
	restore, err := captureOutput(devLog)
	if err != nil {
		return err
	}
	defer restore()

	m := &model{sup: s, ctx: ctx, cancel: cancel, name: s.cfg.Name, problems: probs, ext: ext}
	p := tea.NewProgram(m, tea.WithContext(context.WithoutCancel(ctx)))
	runErr := make(chan error, 1)
	go func() {
		// Switching profiles ends a run; the view stays, on a new one.
		for {
			err := s.run(ctx, names...)
			if !errors.Is(err, errSwitch) {
				runErr <- err
				p.Send(stoppedMsg{err: err})
				return
			}
			cfg.Active = s.switchTo
			next, err := newSupervisor(ctx, cfg, logger, discard{})
			if err != nil {
				runErr <- err
				p.Send(stoppedMsg{err: err})
				return
			}
			s = next
			devLog.set(s.outputs.writer("dev"))
			p.Send(swapMsg{sup: s})
		}
	}()
	if _, err := p.Run(); err != nil {
		cancel()
		return errors.Join(err, <-runErr)
	}
	return m.err
}

type discard struct{}

func (discard) Write(p []byte) (int, error) { return len(p), nil }

// tuiLog hands dev's own log lines to the current supervisor's writer, which
// changes when dev switches profiles.
type tuiLog struct {
	mu sync.Mutex
	w  *lineWriter
}

func (l *tuiLog) set(w *lineWriter) {
	l.mu.Lock()
	l.w = w
	l.mu.Unlock()
}

func (l *tuiLog) Write(p []byte) (int, error) {
	l.mu.Lock()
	w := l.w
	l.mu.Unlock()
	if w == nil {
		return len(p), nil
	}
	return w.Write(p)
}

type (
	swapMsg    struct{ sup backend }
	rowsMsg    struct{ rows []Row }
	tickMsg    struct{}
	stoppedMsg struct{ err error }
	actionMsg  struct{ err error }
)

type view int

const (
	viewHome view = iota
	viewLogs
	viewAll
	viewProfiles
)

type model struct {
	sup backend
	// attached views a dev that runs on without this view: q leaves it, Q
	// stops it.
	attached bool
	// ctx is dev's own: services started from here run under it, and q
	// cancels it.
	ctx      context.Context
	cancel   context.CancelFunc
	problems *problems // nil in tests that drive the model directly
	name     string

	view     view
	cursor   int
	pick     int // the highlighted profile in the picker
	ext      extension
	rows     []Row     // the app's own rows, as last fetched
	rowsAt   time.Time // when they were fetched
	scroll   int       // rows up from the bottom of a log
	wrap     bool      // a log's long lines wrap instead of being cut off
	width    int
	height   int
	quitting bool
	notice   string
	failed   bool
	err      error
}

func (m *model) Init() tea.Cmd { return tick() }

// The view follows output as it arrives without a message per line.
func tick() tea.Cmd {
	return tea.Tick(250*time.Millisecond, func(time.Time) tea.Msg { return tickMsg{} })
}

func (m *model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.width, m.height = msg.Width, msg.Height
	case tickMsg:
		if m.ext.rows != nil && time.Since(m.rowsAt) > time.Second {
			m.rowsAt = time.Now()
			rows := m.ext.rows
			return m, tea.Batch(tick(), func() tea.Msg { return rowsMsg{rows: rows(m.ctx)} })
		}
		return m, tick()
	case rowsMsg:
		m.rows = msg.rows
	case swapMsg:
		m.sup, m.notice = msg.sup, ""
	case stoppedMsg:
		m.err = msg.err
		// A dev that fails to start stays on screen with why, its output still
		// browsable, rather than leaving at once: the terminal is still
		// answering the view's opening queries, and those answers would land
		// in the shell.
		if msg.err != nil && !m.quitting && m.ctx.Err() == nil {
			m.failed = true
			m.notice = "dev stopped: " + msg.err.Error() + " · q quits"
			return m, nil
		}
		return m, tea.Quit
	case actionMsg:
		m.notice = ""
		if msg.err != nil {
			m.notice = msg.err.Error()
		}
	case tea.KeyPressMsg:
		return m.key(msg.String())
	}
	return m, nil
}

func (m *model) key(k string) (tea.Model, tea.Cmd) {
	if m.attached && (k == "ctrl+c" || k == "q") {
		return m, tea.Quit
	}
	if m.attached && k == "Q" {
		m.quitting = true
		return m, func() tea.Msg {
			if r, ok := m.sup.(*remote); ok {
				_ = down(m.ctx, r.cfg)
			}
			return stoppedMsg{}
		}
	}
	if m.failed && (k == "ctrl+c" || k == "q" || k == "Q") {
		return m, tea.Quit
	}
	if k == "ctrl+c" || k == "q" || k == "Q" {
		if !m.quitting {
			m.quitting = true
			m.cancel()
		}
		return m, nil
	}
	if m.quitting {
		return m, nil
	}
	services := m.sup.statuses()
	switch m.view {
	case viewHome:
		switch k {
		case "up", "k":
			m.cursor = max(m.cursor-1, 0)
		case "down", "j":
			m.cursor = min(m.cursor+1, len(services)-1)
		case "enter", "l":
			if len(services) > 0 {
				m.view, m.scroll = viewLogs, 0
			}
		case "a":
			m.view, m.scroll = viewAll, 0
		case "p":
			if all, _ := m.sup.profileChoices(); len(all) > 0 {
				m.view, m.pick = viewProfiles, 0
			}
		case "r":
			return m, m.act(services, m.restart)
		case "s":
			if m.cursor < len(services) && services[m.cursor].State == stateStopped {
				return m, m.act(services, m.start)
			}
			return m, m.act(services, m.halt)
		default:
			for _, x := range m.ext.keys {
				if x.Key == k {
					m.notice = "…"
					do := x.Do
					return m, func() tea.Msg { return actionMsg{err: do(m.ctx)} }
				}
			}
		}
	case viewProfiles:
		all, _ := m.sup.profileChoices()
		switch k {
		case "esc", "backspace", "h":
			m.view = viewHome
		case "up", "k":
			m.pick = max(m.pick-1, 0)
		case "down", "j":
			m.pick = min(m.pick+1, len(all)-1)
		case "enter":
			if m.pick < len(all) {
				name := all[m.pick]
				m.view, m.notice = viewHome, "switching to "+name+"…"
				return m, func() tea.Msg { return actionMsg{err: m.sup.use(m.ctx, []string{name})} }
			}
		}
	case viewLogs, viewAll:
		switch k {
		case "esc", "backspace", "h":
			m.view = viewHome
		case "up", "k":
			m.scroll++
		case "down", "j":
			m.scroll = max(m.scroll-1, 0)
		// Laptop keyboards lack pgup, pgdn and end; less and vim's keys
		// work everywhere.
		case "pgup", "ctrl+u", "ctrl+b":
			m.scroll += m.pageSize()
		case "pgdown", "ctrl+d", "ctrl+f", "space":
			m.scroll = max(m.scroll-m.pageSize(), 0)
		case "end", "G":
			m.scroll = 0
		case "w":
			m.wrap = !m.wrap
		case "home", "g":
			m.scroll = m.maxScroll()
		case "r":
			if m.view == viewLogs {
				return m, m.act(services, m.restart)
			}
		}
		m.scroll = min(m.scroll, m.maxScroll())
	}
	return m, nil
}

// maxScroll is how far up the current log can scroll: to its oldest line at
// the top of the page.
func (m *model) maxScroll() int {
	name := ""
	if m.view == viewLogs {
		services := m.sup.statuses()
		name = services[min(m.cursor, len(services)-1)].Name
	}
	return max(len(m.screenRows(m.sup.lines(name)))-m.pageSize(), 0)
}

// screenRows is a log's lines as the screen shows them: wrapped, a long line
// takes as many rows as it needs, and scrolling counts rows.
func (m *model) screenRows(lines []string) []string {
	if !m.wrap || m.width <= 0 {
		return lines
	}
	rows := make([]string, 0, len(lines))
	for _, line := range lines {
		rows = append(rows, strings.Split(ansi.Wrap(line, m.width, ""), "\n")...)
	}
	return rows
}

// act runs a start, stop or restart off the UI's goroutine: stopping waits
// for the service to exit.
func (m *model) act(services []status, do func(string) error) tea.Cmd {
	if m.cursor >= len(services) {
		return nil
	}
	name := services[m.cursor].Name
	m.notice = "…"
	return func() tea.Msg { return actionMsg{err: do(name)} }
}

func (m *model) start(name string) error   { return m.sup.start(m.ctx, name) }
func (m *model) restart(name string) error { return m.sup.restart(m.ctx, name) }
func (m *model) halt(name string) error    { return m.sup.halt(m.ctx, name) }

// extHelp is the app's own keys, for the help line.
func (m *model) extHelp() string {
	var b strings.Builder
	for _, k := range m.ext.keys {
		b.WriteString(k.Key + " " + k.Help + " · ")
	}
	return b.String()
}

// quitHelp is how to leave: stopping everything, or leaving it running.
func (m *model) quitHelp() string {
	if m.attached {
		return "q detach · Q stop dev"
	}
	return "q quit"
}

// wrapHelp is the key that switches how long lines show, for the help line.
func (m *model) wrapHelp() string {
	if m.wrap {
		return "w unwrap · "
	}
	return "w wrap · "
}

func (m *model) pageSize() int { return max(m.height-4, 1) }

var (
	titleStyle   = lipgloss.NewStyle().Bold(true)
	dimStyle     = lipgloss.NewStyle().Faint(true)
	problemStyle = lipgloss.NewStyle().Foreground(lipgloss.Color("3"))
	cursorBar    = lipgloss.NewStyle().Bold(true).Foreground(lipgloss.Color("12"))
	stateStyle   = map[state]lipgloss.Style{
		stateRunning:   lipgloss.NewStyle().Foreground(lipgloss.Color("2")),
		stateBuilding:  lipgloss.NewStyle().Foreground(lipgloss.Color("3")),
		stateFailed:    lipgloss.NewStyle().Foreground(lipgloss.Color("1")),
		stateExited:    lipgloss.NewStyle().Foreground(lipgloss.Color("1")),
		stateStopped:   lipgloss.NewStyle().Faint(true),
		stateStarting:  lipgloss.NewStyle().Foreground(lipgloss.Color("3")),
		stateReady:     lipgloss.NewStyle().Foreground(lipgloss.Color("2")),
		stateFinished:  lipgloss.NewStyle().Foreground(lipgloss.Color("2")),
		stateUnhealthy: lipgloss.NewStyle().Foreground(lipgloss.Color("1")),
		stateWaiting:   lipgloss.NewStyle().Faint(true),
	}
	stateMark = map[state]string{
		stateRunning: "●", stateBuilding: "◐", stateFailed: "✗", stateExited: "✗", stateStopped: "○",
		stateStarting: "◐", stateReady: "●", stateUnhealthy: "✗", stateWaiting: "◌", stateFinished: "✓",
	}
)

func (m *model) View() tea.View {
	var b strings.Builder
	switch m.view {
	case viewHome:
		m.home(&b)
	case viewLogs:
		services := m.sup.statuses()
		name := services[min(m.cursor, len(services)-1)].Name
		m.log(&b, name, m.sup.lines(name), "esc back · r restart · ↑↓ scroll · ctrl+u/d page · g top · G follow · "+m.wrapHelp()+m.quitHelp())
	case viewProfiles:
		m.profiles(&b)
	case viewAll:
		m.log(&b, "all output", m.sup.lines(""), "esc back · ↑↓ scroll · ctrl+u/d page · g top · G follow · "+m.wrapHelp()+m.quitHelp())
	}
	v := tea.NewView(b.String())
	v.AltScreen = true
	v.WindowTitle = "dev · " + m.name
	return v
}

func (m *model) home(b *strings.Builder) {
	title := "dev"
	if m.name != "" {
		title += " · " + m.name
	}
	if m.attached {
		title += " (attached)"
	}
	if _, active := m.sup.profileChoices(); len(active) > 0 {
		title += " · " + strings.Join(active, " + ")
	}
	b.WriteString(titleStyle.Render(title))
	if stack := m.stackLine(); stack != "" {
		b.WriteString("   " + stack)
	}
	b.WriteString("\n")
	// A before command can take a minute; show that it is getting somewhere.
	if what, _ := m.sup.stackState(); what != "" {
		if all := m.sup.lines(""); len(all) > 0 {
			b.WriteString(dimStyle.Render(truncate("  "+all[len(all)-1], m.width)))
		}
	}
	b.WriteString("\n")
	if len(m.rows) > 0 {
		m.extraRows(b)
	}

	services := m.sup.statuses()
	width := 0
	for _, s := range services {
		width = max(width, len(s.Name))
	}
	for i, s := range services {
		bar := "  "
		if i == m.cursor {
			bar = cursorBar.Render("> ")
		}
		st := stateStyle[s.State]
		detail := s.Detail
		if s.State == stateStopped && s.Manual {
			detail = "manual"
		}
		fmt.Fprintf(b, "%s%s %-*s  %s  %s  %s\n", bar, st.Render(stateMark[s.State]), width, s.Name,
			st.Render(fmt.Sprintf("%-9s", s.State)), dimStyle.Render(since(s.Since)),
			strings.TrimSpace(link(s.URL, s.State.up())+"  "+dimStyle.Render(detail)))
	}
	if len(services) == 0 {
		b.WriteString(dimStyle.Render("  no services in dev.json") + "\n")
	}

	// The status and help lines stay at the bottom of the screen, as in the
	// log views.
	for range m.height - 2 - strings.Count(b.String(), "\n") {
		b.WriteString("\n")
	}
	switch {
	case m.notice != "":
		b.WriteString(m.notice + "\n")
	case m.problems != nil && m.problems.recent() != "":
		b.WriteString(problemStyle.Render(truncate(m.problems.recent(), m.width)) + "\n")
	default:
		b.WriteString("\n")
	}
	if m.quitting {
		b.WriteString(dimStyle.Render("stopping…"))
	} else {
		b.WriteString(dimStyle.Render("↑↓ select · enter output · a all output · r restart · s start/stop · p profiles · " + m.extHelp() + m.quitHelp()))
	}
}

// stackLine describes the stack, each part styled on its own: styling a
// string that already holds a link would cut into the link's own styling.
func (m *model) profiles(b *strings.Builder) {
	b.WriteString(titleStyle.Render("profiles") + "\n\n")
	all, active := m.sup.profileChoices()
	for i, name := range all {
		bar := "  "
		if i == m.pick {
			bar = cursorBar.Render("> ")
		}
		mark := "  "
		if slices.Contains(active, name) {
			mark = stateStyle[stateRunning].Render("● ")
		}
		b.WriteString(bar + mark + name + "\n")
	}
	for range m.height - 3 - len(all) {
		b.WriteString("\n")
	}
	b.WriteString(dimStyle.Render("↑↓ select · enter switch to it, restarting dev · esc back"))
}

// rowStyle colors an app's rows by their state.
var rowStyle = map[string]lipgloss.Style{
	"ok":    lipgloss.NewStyle().Foreground(lipgloss.Color("2")),
	"busy":  lipgloss.NewStyle().Foreground(lipgloss.Color("3")),
	"error": lipgloss.NewStyle().Foreground(lipgloss.Color("1")),
	"off":   lipgloss.NewStyle().Faint(true),
}

var rowMark = map[string]string{"ok": "●", "busy": "◐", "error": "✗", "off": "○"}

func (m *model) extraRows(b *strings.Builder) {
	width := 0
	for _, r := range m.rows {
		width = max(width, len(r.Name))
	}
	for _, r := range m.rows {
		st, ok := rowStyle[r.State]
		if !ok {
			st = dimStyle
		}
		mark := rowMark[r.State]
		if mark == "" {
			mark = "·"
		}
		line := fmt.Sprintf("  %s %-*s  %s", st.Render(mark), width, r.Name, dimStyle.Render(r.Detail))
		if r.URL != "" {
			line += "  " + link(r.URL, r.State == "ok")
		}
		b.WriteString(line + "\n")
	}
	b.WriteString("\n")
}

func (m *model) stackLine() string {
	if what, since := m.sup.stackState(); what != "" {
		return dimStyle.Render(fmt.Sprintf("%s… %s", what, strings.TrimSpace(elapsed(since))))
	}
	var parts []string
	pg, s3 := m.sup.stackAddrs()
	if pg != 0 {
		parts = append(parts, dimStyle.Render(fmt.Sprintf("postgres :%d", pg)))
	}
	if s3 != "" {
		parts = append(parts, dimStyle.Render("s3 ")+link("http://"+s3, true))
	}
	return strings.Join(parts, dimStyle.Render(" · "))
}

func (m *model) log(b *strings.Builder, title string, lines []string, help string) {
	b.WriteString(titleStyle.Render(title))
	if m.scroll > 0 {
		b.WriteString(dimStyle.Render(fmt.Sprintf("   %d lines up", m.scroll)))
	}
	b.WriteString("\n")
	lines = m.screenRows(lines)
	page := m.pageSize()
	m.scroll = min(m.scroll, max(len(lines)-page, 0))
	end := len(lines) - m.scroll
	for _, line := range lines[max(end-page, 0):end] {
		b.WriteString(truncate(line, m.width) + "\n")
	}
	for range page - min(page, end) {
		b.WriteString("\n")
	}
	if m.quitting {
		help = "stopping…"
	} else if m.notice != "" {
		help = m.notice
	}
	b.WriteString(dimStyle.Render(help))
}

// link renders a URL the terminal opens on cmd-click (OSC 8), in link blue,
// dimmed while nothing answers there.
func link(url string, up bool) string {
	if url == "" {
		return ""
	}
	style := lipgloss.NewStyle().Foreground(lipgloss.Color("12")).Underline(true).Hyperlink(url)
	if !up {
		style = style.Faint(true)
	}
	return style.Render(url)
}

// elapsed is since for a moment that may be unset.
func elapsed(t time.Time) string {
	if t.IsZero() {
		return ""
	}
	return since(t)
}

func since(t time.Time) string {
	d := time.Since(t).Round(time.Second)
	switch {
	case d < time.Minute:
		return fmt.Sprintf("%4ds", int(d.Seconds()))
	case d < time.Hour:
		return fmt.Sprintf("%4dm", int(d.Minutes()))
	default:
		return fmt.Sprintf("%4dh", int(d.Hours()))
	}
}

// truncate keeps a line to the terminal's width; a wrapped line would push
// the view off the screen.
func truncate(s string, width int) string {
	if width <= 0 {
		return s
	}
	return lipgloss.NewStyle().MaxWidth(width).Render(s)
}
