package spa

import (
	"bytes"
	"cmp"
	"html"
	"net/http"
	"slices"
	"strconv"
	"strings"

	"golang.org/x/text/language"
)

// Locales are the languages an app is translated into, which Handler chooses
// from for each request and writes to index.html as <html lang>. The client
// reads it back, as with @parallelworks/i18n's
// detectLocale(locales, {injected: document.documentElement.lang, ...}), so
// the first paint is already in the reader's language.
type Locales struct {
	// Available are the app's locales as the client names them, such as
	// "en" and "es". None leaves index.html as it is.
	Available []string
	// Fallback is chosen when nothing matches. Defaults to Available[0].
	Fallback string
	// Cookie names a cookie holding the person's choice, which wins over
	// Accept-Language.
	Cookie string
}

// Negotiate returns the locale for r: the Cookie's choice, then the
// Accept-Language header's languages in order of preference, then Fallback.
func (l Locales) Negotiate(r *http.Request) string {
	if l.Cookie != "" {
		if c, err := r.Cookie(l.Cookie); err == nil && c.Value != "" {
			if match := NegotiateLocale([]string{c.Value}, l.Available, ""); match != "" {
				return match
			}
		}
	}
	fallback := l.Fallback
	if fallback == "" && len(l.Available) > 0 {
		fallback = l.Available[0]
	}
	return NegotiateLocale(acceptLanguage(r.Header.Get("Accept-Language")), l.Available, fallback)
}

// NegotiateHeader is Negotiate for a request's headers alone, as a
// problem.Localizer's Locale.
func (l Locales) NegotiateHeader(h http.Header) string {
	return l.Negotiate(&http.Request{Header: h})
}

// NegotiateLocale picks the locale for the first preferred tag that has one:
// an exact match, ignoring case, else a locale with the same base language, so
// es-MX gets es. It returns fallback when nothing matches. It is the server's
// half of @parallelworks/i18n's negotiateLocale, and the two agree.
func NegotiateLocale(preferred, locales []string, fallback string) string {
	for _, tag := range preferred {
		for _, l := range locales {
			if strings.EqualFold(l, tag) {
				return l
			}
		}
		base, ok := baseLanguage(tag)
		if !ok {
			continue
		}
		for _, l := range locales {
			if b, ok := baseLanguage(l); ok && b == base {
				return l
			}
		}
	}
	return fallback
}

// baseLanguage is the tag's own language subtag, canonicalized as
// Intl.Locale does, never one inferred from its region or script.
func baseLanguage(tag string) (language.Base, bool) {
	// Intl.Locale rejects underscores, which x/text accepts.
	if strings.Contains(tag, "_") {
		return language.Base{}, false
	}
	t, err := (language.Default | language.Macro).Parse(tag)
	if err != nil {
		return language.Base{}, false
	}
	base, confidence := t.Base()
	return base, confidence == language.Exact
}

// acceptLanguage lists the header's tags most preferred first, as
// navigator.languages does.
func acceptLanguage(header string) []string {
	type weighted struct {
		tag string
		q   float64
	}
	var tags []weighted
	for part := range strings.SplitSeq(header, ",") {
		tag, params, _ := strings.Cut(part, ";")
		tag = strings.TrimSpace(tag)
		if tag == "" || tag == "*" {
			continue
		}
		q := 1.0
		if v, ok := strings.CutPrefix(strings.TrimSpace(params), "q="); ok {
			parsed, err := strconv.ParseFloat(strings.TrimSpace(v), 64)
			if err != nil {
				continue
			}
			q = parsed
		}
		if q <= 0 {
			continue
		}
		tags = append(tags, weighted{tag, q})
	}
	slices.SortStableFunc(tags, func(a, b weighted) int { return cmp.Compare(b.q, a.q) })
	out := make([]string, len(tags))
	for i, t := range tags {
		out[i] = t.tag
	}
	return out
}

func setLang(page []byte, lang string) []byte {
	start := bytes.Index(page, []byte("<html"))
	if start < 0 {
		return page
	}
	tagEnd := bytes.IndexByte(page[start:], '>')
	if tagEnd < 0 {
		return page
	}
	tagEnd += start
	attr := []byte(` lang="` + html.EscapeString(lang) + `"`)

	out := make([]byte, 0, len(page)+len(attr))
	tag := page[start+len("<html") : tagEnd]
	if i := bytes.Index(tag, []byte(" lang=")); i >= 0 {
		valueStart := start + len("<html") + i + len(" lang=")
		valueEnd := attrValueEnd(page, valueStart, tagEnd)
		out = append(out, page[:start+len("<html")+i]...)
		out = append(out, attr...)
		return append(out, page[valueEnd:]...)
	}
	out = append(out, page[:start+len("<html")]...)
	out = append(out, attr...)
	return append(out, page[start+len("<html"):]...)
}

func attrValueEnd(page []byte, i, tagEnd int) int {
	if i < tagEnd && (page[i] == '"' || page[i] == '\'') {
		if j := bytes.IndexByte(page[i+1:tagEnd], page[i]); j >= 0 {
			return i + 1 + j + 1
		}
		return tagEnd
	}
	for i < tagEnd && page[i] != ' ' && page[i] != '/' {
		i++
	}
	return i
}

func (l Locales) vary(h http.Header) {
	if len(l.Available) == 0 {
		return
	}
	h.Add("Vary", "Accept-Language")
	if l.Cookie != "" {
		h.Add("Vary", "Cookie")
	}
}
