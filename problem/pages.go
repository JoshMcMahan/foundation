package problem

import (
	"html/template"
	"net/http"
	"strings"
)

// Handler serves the documentation pages the problem type URIs resolve to:
// /problems/ lists every type, /problems/<code> documents a shared rule, and
// /problems/<name>/<code> a type in the registry called name. Mount it at
// /problems/ on the host that serves the API.
func Handler(registries ...*Registry) http.Handler {
	return &pages{registries: registries}
}

type pages struct {
	registries []*Registry
}

type indexData struct {
	Status     []statusRow
	Validation *Type
	Rules      []*Type
	Registries []*Registry
}

type statusRow struct {
	Code   Code
	Status string
}

func (h *pages) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		Write(w, Status(http.StatusMethodNotAllowed, ""))
		return
	}
	_, rest, ok := strings.Cut(r.URL.Path, "/problems/")
	if !ok {
		Write(w, Status(http.StatusNotFound, "not a problem type URI"))
		return
	}
	if rest == "" {
		render(w, indexPage, indexData{
			Status:     statusRows,
			Validation: Validation,
			Rules:      Rules,
			Registries: h.registries,
		})
		return
	}
	if t := h.lookup(rest); t != nil {
		render(w, typePage, t)
		return
	}
	Write(w, Status(http.StatusNotFound, "no problem type at "+r.URL.Path))
}

func (h *pages) lookup(rest string) *Type {
	name, code, nested := strings.Cut(rest, "/")
	if !nested {
		if Code(name) == Validation.Code {
			return Validation
		}
		for _, t := range Rules {
			if t.Code == Code(name) {
				return t
			}
		}
		return nil
	}
	for _, r := range h.registries {
		if r.name == name {
			if t, ok := r.Lookup(Code(code)); ok {
				return t
			}
		}
	}
	return nil
}

var statusRows = []statusRow{
	{InvalidRequest, "any other 4xx"},
	{Unauthenticated, "401"},
	{Forbidden, "403"},
	{NotFound, "404"},
	{Conflict, "409"},
	{RateLimited, "429"},
	{Internal, "any other 5xx"},
	{Unavailable, "503"},
}

func render(w http.ResponseWriter, t *template.Template, data any) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Security-Policy", "default-src 'none'")
	_ = t.Execute(w, data)
}

const head = `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
`

var indexPage = template.Must(template.New("index").Parse(head + `<title>Problem types</title>
<h1>Problem types</h1>
<p>Error responses are <a href="https://www.rfc-editor.org/rfc/rfc9457">RFC 9457</a> problem details
(<code>application/problem+json</code>). The <code>type</code> member identifies the problem and
resolves to one of the pages below. Every type has a stable <code>code</code>, for clients to show a
message in the reader's language; <code>title</code> and <code>detail</code> are English, for developers.</p>

<h2>Status only</h2>
<p>A problem whose <code>type</code> is <code>about:blank</code> means nothing beyond its HTTP status
and carries no <code>code</code>. Clients derive one from the status:</p>
<table>
<tr><th>Status</th><th>Code</th></tr>
{{range .Status}}<tr><td>{{.Status}}</td><td><code>{{.Code}}</code></td></tr>
{{end}}</table>

<h2>Validation</h2>
<p><a href="{{.Validation.URI}}"><code>{{.Validation.Code}}</code></a>: {{.Validation.Doc}}
Each entry in <code>errors</code> has the <code>type</code> and <code>code</code> of the rule it failed:</p>
<ul>
{{range .Rules}}<li><a href="{{.URI}}"><code>{{.Code}}</code></a>: {{.Title}}</li>
{{end}}</ul>
{{range .Registries}}
<h2>{{.Name}}</h2>
<ul>
{{range .Types}}<li><a href="{{.URI}}"><code>{{.Code}}</code></a>: {{.Title}}</li>
{{end}}</ul>
{{end}}`))

var typePage = template.Must(template.New("type").Parse(head + `<title>{{.Title}}</title>
<h1>{{.Title}}</h1>
{{with .Doc}}<p>{{.}}</p>{{end}}
<dl>
<dt>Type</dt><dd><code>{{.URI}}</code></dd>
<dt>Code</dt><dd><code>{{.Code}}</code></dd>
<dt>Status</dt><dd>{{.Status}}</dd>
{{with .Params}}<dt>Params</dt><dd>{{range $i, $p := .}}{{if $i}}, {{end}}<code>{{$p}}</code>{{end}}</dd>{{end}}
</dl>
<p><a href="/problems/">All problem types</a></p>`))
