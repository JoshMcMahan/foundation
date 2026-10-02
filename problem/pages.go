package problem

import (
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"html/template"
	"net/http"
	"strings"
)

// PagesOptions configure Pages.
type PagesOptions struct {
	// Registries are the application's problem types, documented beside the
	// shared ones.
	Registries []*Registry
	// Localizer picks the reader's language and renders each type's message.
	// Nil uses Accept-Language and the shared messages only.
	Localizer *Localizer
	// Docs hold the application's guidance; SharedDocs is consulted after them.
	Docs []*Docs
}

// Handler serves the problem pages for registries in the reader's language.
// See Pages.
func Handler(registries ...*Registry) http.Handler {
	return Pages(PagesOptions{Registries: registries})
}

// Pages serves the documentation pages problem type URIs resolve to:
// /problems/ lists every type, /problems/<code> documents a shared one, and
// /problems/<name>/<code> a type in the registry called name. Each page is in
// the reader's language (?lang= overrides it, so a shared link keeps its
// language) and shows the message readers see, why it happens, how to fix
// it, and the technical details. Mount it at /problems/ on the API's host.
func Pages(opts PagesOptions) http.Handler {
	if opts.Localizer == nil {
		opts.Localizer = &Localizer{}
	}
	return &pages{opts: opts, docs: append(append([]*Docs(nil), opts.Docs...), SharedDocs)}
}

type pages struct {
	opts PagesOptions
	docs []*Docs
}

type statusRow struct {
	Code   Code
	Status string
}

type indexData struct {
	Lang       string
	T          map[string]string
	Status     []statusRow
	Validation entry
	Rules      []entry
	Registries []registryData
}

type registryData struct {
	Name  string
	Types []entry
}

// entry is a type as the index lists it: its code, link and title.
type entry struct {
	URI    string
	Code   Code
	Status int
	Title  string
}

type typeData struct {
	Lang    string
	T       map[string]string
	Type    *Type
	Title   string
	Doc     Doc
	Message string
	Server  bool
	Example string
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
	lang := h.language(r)
	if rest == "" {
		render(w, lang, indexPage, h.index(lang))
		return
	}
	if t := h.lookup(rest); t != nil {
		render(w, lang, typePage, h.typeData(lang, t))
		return
	}
	Write(w, Status(http.StatusNotFound, "no problem type at "+r.URL.Path))
}

// language is ?lang= when the pages speak it, else the Localizer's choice
// when they do, else English.
func (h *pages) language(r *http.Request) string {
	if q := strings.ToLower(r.URL.Query().Get("lang")); pageText[q] != nil {
		return q
	}
	if lang := h.opts.Localizer.Language(r.Header); pageText[lang] != nil {
		return lang
	}
	return "en"
}

func (h *pages) title(lang string, t *Type) string {
	if d := doc(h.docs, lang, t.Code); d.Title != "" {
		return d.Title
	}
	return t.Title
}

func (h *pages) entry(lang string, t *Type) entry {
	return entry{URI: t.URI(), Code: t.Code, Status: t.Status, Title: h.title(lang, t)}
}

func (h *pages) index(lang string) indexData {
	text := pageText[lang]
	d := indexData{Lang: lang, T: text, Validation: h.entry(lang, Validation)}
	for _, row := range statusRows {
		label := row.Status
		if v, ok := text[label]; ok {
			label = v
		}
		d.Status = append(d.Status, statusRow{Code: row.Code, Status: label})
	}
	for _, t := range Rules {
		d.Rules = append(d.Rules, h.entry(lang, t))
	}
	for _, reg := range h.opts.Registries {
		rd := registryData{Name: reg.Name()}
		for _, t := range reg.Types() {
			rd.Types = append(rd.Types, h.entry(lang, t))
		}
		d.Registries = append(d.Registries, rd)
	}
	return d
}

func (h *pages) typeData(lang string, t *Type) typeData {
	d := typeData{
		Lang: lang, T: pageText[lang], Type: t, Title: h.title(lang, t),
		Doc:    doc(h.docs, lang, t.Code),
		Server: t.Status >= http.StatusInternalServerError,
	}
	if d.Doc.Why == "" {
		d.Doc.Why = t.Doc
	}
	params := map[string]any{}
	for _, p := range t.Params {
		params[p] = "{" + p + "}"
	}
	msg, ok := h.opts.Localizer.Message(lang, t.Code, params)
	if !ok {
		// A plural or number param needs a number to show its message.
		for _, p := range t.Params {
			params[p] = 3
		}
		msg, _ = h.opts.Localizer.Message(lang, t.Code, params)
	}
	d.Message = msg
	example := struct {
		Type   string         `json:"type"`
		Title  string         `json:"title"`
		Status int            `json:"status"`
		Code   Code           `json:"code"`
		Detail string         `json:"detail,omitempty"`
		Params map[string]any `json:"params,omitempty"`
	}{t.URI(), t.Title, t.Status, t.Code, msg, nil}
	if len(t.Params) > 0 {
		example.Params = params
	}
	b, _ := json.MarshalIndent(example, "", "  ")
	d.Example = string(b)
	return d
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
		for _, row := range statusRows {
			if row.Code == Code(name) {
				return statusType(row.Code)
			}
		}
		return nil
	}
	for _, r := range h.opts.Registries {
		if r.name == name {
			if t, ok := r.Lookup(Code(code)); ok {
				return t
			}
		}
	}
	return nil
}

// statusType describes a code clients derive from an about:blank problem's
// status, so it has a page like any type.
func statusType(c Code) *Type {
	status := http.StatusBadRequest
	for _, s := range []int{401, 403, 404, 409, 429, 500, 503} {
		if CodeForStatus(s) == c {
			status = s
		}
	}
	return &Type{Code: c, Status: status, Title: http.StatusText(status), uri: "/problems/" + string(c)}
}

var statusRows = []statusRow{
	{InvalidRequest, "anyOther4xx"},
	{Unauthenticated, "401"},
	{Forbidden, "403"},
	{NotFound, "404"},
	{Conflict, "409"},
	{RateLimited, "429"},
	{Internal, "anyOther5xx"},
	{Unavailable, "503"},
}

func render(w http.ResponseWriter, lang string, t *template.Template, data any) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.Header().Set("Content-Language", lang)
	w.Header().Set("Vary", "Accept-Language, Cookie")
	w.Header().Set("Content-Security-Policy", "default-src 'none'; style-src '"+styleHash+"'")
	_ = t.Execute(w, data)
}

const style = `
:root{color-scheme:light dark;--bg:oklch(98.5% 0 0);--ink:oklch(22% 0.01 255);--muted:oklch(46% 0.01 255);--line:oklch(90% 0.005 255);--code:oklch(95.5% 0.004 255);--link:oklch(50% 0.17 255);--client:oklch(95% 0.035 85);--client-ink:oklch(38% 0.08 70);--server:oklch(95% 0.03 25);--server-ink:oklch(42% 0.12 25);--focus:oklch(58% 0.17 255)}
@media (prefers-color-scheme:dark){:root{--bg:oklch(17% 0.005 255);--ink:oklch(94% 0.005 255);--muted:oklch(72% 0.01 255);--line:oklch(30% 0.01 255);--code:oklch(22% 0.008 255);--link:oklch(74% 0.13 255);--client:oklch(26% 0.04 75);--client-ink:oklch(86% 0.08 85);--server:oklch(26% 0.045 25);--server-ink:oklch(85% 0.07 25);--focus:oklch(74% 0.13 255)}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Hiragino Sans","Noto Sans CJK JP","Noto Sans KR","PingFang SC",sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:46rem;margin:0 auto;padding:40px 20px 72px}
p,li,dd{max-width:60ch;text-wrap:pretty}
a{color:var(--link);text-underline-offset:2px}
a:focus-visible,summary:focus-visible{outline:2px solid var(--focus);outline-offset:2px;border-radius:2px}
code,pre{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:.875em}
.back{display:inline-block;font-size:.875rem;color:var(--muted);text-decoration:none;margin-bottom:28px}
.back:hover{color:var(--ink)}
.facts{margin:0 0 8px;font-size:.875rem;color:var(--muted)}
.facts code{color:var(--ink)}
h1{font-size:1.875rem;line-height:1.25;margin:0 0 20px;letter-spacing:-.02em;text-wrap:balance}
h2{font-size:1.0625rem;margin:36px 0 8px;text-wrap:balance}
.seen{margin:0;padding:14px 18px;border-radius:8px;background:var(--client);color:var(--client-ink)}
.seen.server{background:var(--server);color:var(--server-ink)}
.seen p{margin:0;font-size:1.0625rem;color:var(--ink)}
.seen .label{margin:0 0 2px;font-size:.8125rem;font-weight:600}
ul{padding-left:1.25rem;margin:0}li{margin:0 0 6px}li::marker{color:var(--muted)}
.technical{margin-top:44px;border-top:1px solid var(--line);padding-top:12px}
summary{cursor:pointer;font-weight:600;padding:6px 0;width:fit-content}
dl{display:grid;grid-template-columns:max-content 1fr;gap:4px 20px;margin:12px 0 20px}dt{color:var(--muted)}dd{margin:0}
.label{font-size:.8125rem;font-weight:600;color:var(--muted);margin:0 0 6px}
pre{background:var(--code);border-radius:8px;padding:14px 16px;overflow-x:auto;margin:0;line-height:1.5}
.lead{color:var(--muted);margin:0 0 8px}
.rows{list-style:none;padding:0;margin:12px 0 0;border-top:1px solid var(--line)}
.rows li{margin:0;max-width:none}
.rows a{display:grid;grid-template-columns:minmax(11rem,max-content) 1fr auto;gap:2px 20px;align-items:baseline;padding:9px 4px;border-bottom:1px solid var(--line);color:var(--ink);text-decoration:none}
.rows a:hover{background:var(--code)}
.rows code{color:var(--link)}
.rows .status{color:var(--muted);font-size:.875rem;font-variant-numeric:tabular-nums}
@media (max-width:560px){.rows a{grid-template-columns:1fr auto}.rows .title{grid-column:1/-1;grid-row:2;color:var(--muted);font-size:.9375rem}}
footer{margin-top:40px;font-size:.9375rem}
`

var styleHash = func() string {
	sum := sha256.Sum256([]byte(style))
	return "sha256-" + base64.StdEncoding.EncodeToString(sum[:])
}()

const head = `<!doctype html>
<html lang="{{.Lang}}">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>` + style + `</style>
`

var indexPage = template.Must(template.New("index").Parse(head + `<title>{{.T.reference}}</title>
<main>
<h1>{{.T.reference}}</h1>
<p class="lead">{{.T.intro}}</p>

<h2>{{.T.statusOnly}}</h2>
<p>{{.T.statusOnlyDoc}}</p>
<ul class="rows">
{{range .Status}}<li><a href="/problems/{{.Code}}"><code>{{.Code}}</code><span class="title"></span><span class="status">{{.Status}}</span></a></li>
{{end}}</ul>

<h2>{{.T.validation}}</h2>
<ul class="rows"><li><a href="{{.Validation.URI}}"><code>{{.Validation.Code}}</code><span class="title">{{.Validation.Title}}</span><span class="status">{{.Validation.Status}}</span></a></li></ul>
<p>{{.T.rulesDoc}}</p>
<ul class="rows">
{{range .Rules}}<li><a href="{{.URI}}"><code>{{.Code}}</code><span class="title">{{.Title}}</span><span class="status"></span></a></li>
{{end}}</ul>
{{range .Registries}}
<h2>{{.Name}}</h2>
<ul class="rows">
{{range .Types}}<li><a href="{{.URI}}"><code>{{.Code}}</code><span class="title">{{.Title}}</span><span class="status">{{.Status}}</span></a></li>
{{end}}</ul>
{{end}}
</main>`))

var typePage = template.Must(template.New("type").Parse(head + `<title>{{.Title}} · {{.Type.Code}}</title>
<main>
<a class="back" href="/problems/">← {{.T.allTypes}}</a>
<p class="facts">{{.Type.Status}} · <code>{{.Type.Code}}</code></p>
<h1>{{.Title}}</h1>
{{with .Message}}<div class="seen{{if $.Server}} server{{end}}"><p class="label">{{$.T.message}}</p><p>{{.}}</p></div>{{end}}
{{with .Doc.Why}}<h2>{{$.T.why}}</h2>
<p>{{.}}</p>{{end}}
{{with .Doc.Fix}}<h2>{{$.T.fix}}</h2>
<ul>{{range .}}<li>{{.}}</li>{{end}}</ul>{{end}}
{{with .Doc.Links}}<h2>{{$.T.links}}</h2>
<ul>{{range .}}<li><a href="{{.Href}}">{{.Title}}</a></li>{{end}}</ul>{{end}}
<details class="technical">
<summary>{{.T.technical}}</summary>
<dl>
<dt>{{.T.type}}</dt><dd><code>{{.Type.URI}}</code></dd>
<dt>{{.T.code}}</dt><dd><code>{{.Type.Code}}</code></dd>
<dt>{{.T.status}}</dt><dd>{{.Type.Status}}</dd>
{{with .Type.Params}}<dt>{{$.T.params}}</dt><dd>{{range $i, $p := .}}{{if $i}}, {{end}}<code>{{$p}}</code>{{end}}</dd>{{end}}
</dl>
<p class="label">{{.T.example}}</p>
<pre>{{.Example}}</pre>
</details>
</main>`))
