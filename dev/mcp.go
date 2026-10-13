package dev

import (
	"bytes"
	"context"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

// The MCP server lets an agent drive the checkout's dev as tools: start it
// in the background, see its services and their URLs, read their output,
// restart them, wait for them, and stop it.

type (
	mcpNone    struct{}
	mcpService struct {
		Service string `json:"service" jsonschema:"the service's name, as dev.json and the status tool give it"`
	}
	mcpLogs struct {
		Service string `json:"service,omitempty" jsonschema:"the service whose output to read; empty for every service's, prefixed"`
		Lines   int    `json:"lines,omitempty" jsonschema:"how many of the latest lines to return (default 100)"`
		Match   string `json:"match,omitempty" jsonschema:"keep only lines containing this text"`
	}
	mcpServices struct {
		Services []string `json:"services,omitempty" jsonschema:"the services to start or wait for; empty for every service not marked manual"`
		Timeout  int      `json:"timeout_seconds,omitempty" jsonschema:"how long to wait for them to be up (default 300)"`
	}
	mcpStatus struct {
		Starting string    `json:"starting,omitempty"`
		Services []status  `json:"services"`
		Info     *Instance `json:"info,omitempty"`
	}
	mcpText struct {
		Text string `json:"text"`
	}
)

func newMCPServer(cfg Config, ext extension) *mcp.Server {
	server := mcp.NewServer(&mcp.Implementation{Name: "dev", Version: version()}, nil)
	text := func(s string) *mcp.CallToolResult {
		return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: s}}}
	}
	statusText := func(resp controlResponse) string {
		var b bytes.Buffer
		if resp.Starting != "" {
			fmt.Fprintf(&b, "dev is %s…\n", resp.Starting)
		}
		printStatuses(&b, resp.Services)
		if resp.Info != nil && len(resp.Info.Ports) > 0 {
			fmt.Fprintf(&b, "ports: %s\n", formatPorts(resp.Info.Ports))
		}
		return b.String()
	}
	timeout := func(seconds int) time.Duration {
		if seconds <= 0 {
			return 5 * time.Minute
		}
		return time.Duration(seconds) * time.Second
	}

	mcp.AddTool(server, &mcp.Tool{
		Name: "status",
		Description: "Show the checkout's running dev: each service's state (building, starting, ready, running, " +
			"finished, unhealthy, failed, exited, stopped), its URL, and the ports dev allocated. Fails if dev is not running; start it with up.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, _ mcpNone) (*mcp.CallToolResult, mcpStatus, error) {
		resp, err := controlFull(ctx, cfg, controlRequest{Command: "info"})
		if err != nil {
			return nil, mcpStatus{}, err
		}
		return text(statusText(resp)), mcpStatus{Starting: resp.Starting, Services: resp.Services, Info: resp.Info}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "logs",
		Description: "Read the latest output of a service, or of every service, from the current or last run of dev.",
	}, func(_ context.Context, _ *mcp.CallToolRequest, in mcpLogs) (*mcp.CallToolResult, mcpText, error) {
		c, err := cfg.withDefaults()
		if err != nil {
			return nil, mcpText{}, err
		}
		n := in.Lines
		if n <= 0 {
			n = 100
		}
		lines := (&remote{logs: filepath.Join(c.Dir, "logs")}).lines(in.Service)
		if in.Match != "" {
			kept := lines[:0]
			for _, l := range lines {
				if strings.Contains(l, in.Match) {
					kept = append(kept, l)
				}
			}
			lines = kept
		}
		out := strings.Join(lines[max(len(lines)-n, 0):], "\n")
		return text(out), mcpText{Text: out}, nil
	})

	for _, c := range []struct{ name, what string }{
		{"start", "Start a stopped service, such as a manual one, in the running dev."},
		{"stop", "Stop a service in the running dev; the others keep running."},
		{"restart", "Restart a service in the running dev, rebuilding a server first."},
	} {
		mcp.AddTool(server, &mcp.Tool{Name: c.name, Description: c.what},
			func(ctx context.Context, _ *mcp.CallToolRequest, in mcpService) (*mcp.CallToolResult, mcpStatus, error) {
				resp, err := controlFull(ctx, cfg, controlRequest{Command: c.name, Service: in.Service})
				if err != nil {
					return nil, mcpStatus{}, err
				}
				return text(statusText(resp)), mcpStatus{Starting: resp.Starting, Services: resp.Services}, nil
			})
	}

	mcp.AddTool(server, &mcp.Tool{
		Name: "wait",
		Description: "Wait until services of the running dev are up (ready, or running without a health URL). " +
			"Fails as soon as one fails its build, exits or turns unhealthy; its logs then say why.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in mcpServices) (*mcp.CallToolResult, mcpText, error) {
		names := in.Services
		if len(names) == 0 {
			c, err := cfg.withDefaults()
			if err != nil {
				return nil, mcpText{}, err
			}
			for _, svc := range c.Services {
				if !svc.Manual {
					names = append(names, svc.Name)
				}
			}
		}
		if err := waitServices(ctx, cfg, names, timeout(in.Timeout)); err != nil {
			return nil, mcpText{}, err
		}
		out := strings.Join(names, ", ") + " up"
		return text(out), mcpText{Text: out}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name: "up",
		Description: "Start dev for the checkout in the background and return once its services are up, or with why not. " +
			"Ports are allocated, so it runs beside other checkouts; status gives the URLs.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, in mcpServices) (*mcp.CallToolResult, mcpText, error) {
		var b bytes.Buffer
		if err := up(ctx, cfg, in.Services, in.Services, timeout(in.Timeout), &b); err != nil {
			return nil, mcpText{}, err
		}
		return text(b.String()), mcpText{Text: b.String()}, nil
	})

	mcp.AddTool(server, &mcp.Tool{
		Name:        "down",
		Description: "Stop the checkout's running dev and everything it started.",
	}, func(ctx context.Context, _ *mcp.CallToolRequest, _ mcpNone) (*mcp.CallToolResult, mcpText, error) {
		if err := down(ctx, cfg); err != nil {
			return nil, mcpText{}, err
		}
		return text("dev stopped"), mcpText{Text: "dev stopped"}, nil
	})
	for _, add := range ext.mcp {
		add(server)
	}
	return server
}

// serveMCP answers MCP over stdin and stdout until the client leaves.
func serveMCP(ctx context.Context, cfg Config, ext extension) error {
	return newMCPServer(cfg, ext).Run(ctx, &mcp.StdioTransport{})
}
