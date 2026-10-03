// Package humaproblem makes huma produce problem details: every error huma
// builds, including request validation, becomes a *problem.Problem, and the
// OpenAPI document lists the codes clients localize on.
package humaproblem

import (
	"context"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"

	"github.com/danielgtaylor/huma/v2"
	"github.com/danielgtaylor/huma/v2/validation"

	"github.com/parallelworks/foundation/problem"
)

// Options configure Install.
type Options struct {
	// Map turns an error a handler returned that is not a problem, such as a
	// database's not-found error, into one. It returns nil for an error it does
	// not recognize, which becomes a 500. The error becomes the problem's cause.
	Map func(error) *problem.Problem
	// Debug sends a 5xx problem's cause as its detail. Never set it in production.
	Debug bool
}

var (
	options   atomic.Pointer[Options]
	installed sync.Once
)

// Install makes huma build its errors with NewError. Call it at startup,
// before registering operations: huma also reads the error type from it to
// document error responses. Calling it again, as tests do, only replaces the
// options, so it is safe while other goroutines serve requests.
func Install(opts Options) {
	options.Store(&opts)
	installed.Do(func() {
		huma.NewError = NewError
		huma.NewErrorWithContext = func(_ huma.Context, status int, msg string, errs ...error) huma.StatusError {
			return NewError(status, msg, errs...)
		}
	})
}

func current() Options {
	if o := options.Load(); o != nil {
		return *o
	}
	return Options{}
}

// NewError converts an error huma reports into a problem. A problem among errs
// is returned as is, and so is one Options.Map returns for them. A 422 with
// field details becomes a problem.Validation listing them, each typed with the
// rule it failed. Anything else is an about:blank problem; for a 5xx its
// message and errs can hold internals, so they become the cause, for logs,
// rather than the detail.
func NewError(status int, msg string, errs ...error) huma.StatusError {
	for _, err := range errs {
		if p, ok := errors.AsType[*problem.Problem](err); ok {
			return p
		}
	}
	opts := current()
	if opts.Map != nil {
		for _, err := range errs {
			if err == nil {
				continue
			}
			if p := opts.Map(err); p != nil {
				if p.Unwrap() == nil {
					p = p.WithCause(err)
				}
				return p
			}
		}
	}
	if status >= http.StatusInternalServerError {
		p := problem.Status(status, "")
		cause := errors.Join(errs...)
		if cause == nil && msg != "" {
			cause = errors.New(msg)
		}
		if cause == nil {
			return p
		}
		if opts.Debug {
			p.Detail = cause.Error()
		}
		return p.WithCause(cause)
	}
	if fields := FieldErrors(errs); status == http.StatusUnprocessableEntity && len(fields) > 0 {
		p := problem.ValidationFailed(fields...)
		if msg != "" {
			p.Detail = msg
		}
		return p
	}
	return problem.Status(status, detail(msg, errs))
}

// Report returns a huma Transformer that calls fn with every problem the API
// sends and its request's context, to log each cause with the request's
// logger and report server errors. Add it to huma.Config.Transformers.
func Report(fn func(ctx context.Context, p *problem.Problem)) huma.Transformer {
	return func(ctx huma.Context, _ string, v any) (any, error) {
		if p, ok := v.(*problem.Problem); ok {
			fn(ctx.Context(), p)
		}
		return v, nil
	}
}

// Localize returns a huma Transformer that writes every problem the API
// sends in the reader's language with l, and says which in Content-Language.
// Add it to huma.Config.Transformers after Report, which logs the original.
func Localize(l *problem.Localizer) huma.Transformer {
	return func(ctx huma.Context, _ string, v any) (any, error) {
		p, ok := v.(*problem.Problem)
		if !ok {
			return v, nil
		}
		h := http.Header{}
		ctx.EachHeader(func(name, value string) { h.Add(name, value) })
		lang := l.Language(h)
		ctx.SetHeader("Content-Language", lang)
		return l.Localize(lang, p), nil
	}
}

func detail(msg string, errs []error) string {
	parts := make([]string, 0, len(errs)+1)
	if msg != "" {
		parts = append(parts, msg)
	}
	for _, err := range errs {
		var d huma.ErrorDetailer
		if errors.As(err, &d) {
			if ed := d.ErrorDetail(); ed != nil {
				parts = append(parts, ed.Message)
				continue
			}
		}
		if err != nil {
			parts = append(parts, err.Error())
		}
	}
	return strings.Join(parts, ": ")
}

// FieldErrors converts huma's error details into field errors. A
// *problem.FieldError among errs, such as one a Resolver returns, is kept as
// is; an error that locates no field is skipped.
func FieldErrors(errs []error) []*problem.FieldError {
	var out []*problem.FieldError
	for _, err := range errs {
		if fe, ok := errors.AsType[*problem.FieldError](err); ok {
			out = append(out, fe)
			continue
		}
		var d huma.ErrorDetailer
		if !errors.As(err, &d) {
			continue
		}
		if ed := d.ErrorDetail(); ed != nil && ed.Location != "" {
			out = append(out, fieldError(ed))
		}
	}
	return out
}

func fieldError(d *huma.ErrorDetail) *problem.FieldError {
	c := classify(d.Message)
	in, path := splitLocation(d.Location)
	if c.property != "" {
		path = append(path, c.property)
	}
	var fe *problem.FieldError
	if in == "body" {
		segs := make([]any, len(path))
		for i, s := range path {
			segs[i] = s
		}
		fe = c.rule.At(problem.Pointer(segs...), d.Message)
	} else {
		fe = c.rule.AtParameter(in, strings.Join(path, "."), d.Message)
	}
	fe.Params = c.params
	return fe
}

// splitLocation splits huma's "body.items[3].tags" into "body" and the
// segments items, 3, tags.
func splitLocation(loc string) (string, []string) {
	in, rest, _ := strings.Cut(loc, ".")
	if rest == "" {
		return in, nil
	}
	var path []string
	for seg := range strings.SplitSeq(rest, ".") {
		name, idx, _ := strings.Cut(seg, "[")
		if name != "" {
			path = append(path, name)
		}
		for idx != "" {
			var n string
			n, idx, _ = strings.Cut(idx, "]")
			path = append(path, n)
			idx = strings.TrimPrefix(idx, "[")
		}
	}
	return in, path
}

type classification struct {
	rule     *problem.Type
	params   map[string]any
	property string
}

type matcher struct {
	re    *regexp.Regexp
	build func(args []string) classification
}

var formatVerb = regexp.MustCompile(`%[vds]`)

// pattern turns one of huma's validation message formats into a regexp that
// captures its arguments.
func pattern(format string) *regexp.Regexp {
	parts := formatVerb.Split(format, -1)
	for i, p := range parts {
		parts[i] = regexp.QuoteMeta(p)
	}
	return regexp.MustCompile("^" + strings.Join(parts, "(.+?)") + "$")
}

func number(s string) any {
	if n, err := strconv.ParseInt(s, 10, 64); err == nil {
		return n
	}
	if f, err := strconv.ParseFloat(s, 64); err == nil {
		return f
	}
	return s
}

func is(rule *problem.Type) func([]string) classification {
	return func([]string) classification { return classification{rule: rule} }
}

func bound(rule *problem.Type, key, exclusive string) func([]string) classification {
	return func(args []string) classification {
		params := map[string]any{key: number(args[0])}
		if exclusive != "" {
			params["exclusive"] = exclusive
		}
		return classification{rule: rule, params: params}
	}
}

var matchers = func() []matcher {
	m := func(format string, build func([]string) classification) matcher {
		return matcher{re: pattern(format), build: build}
	}
	requiredProperty := func(a []string) classification {
		return classification{rule: problem.Required, property: a[0]}
	}
	var out []matcher
	out = append(out,
		m(validation.MsgExpectedRequiredProperty, requiredProperty),
		m(validation.MsgExpectedDependentRequiredProperty, requiredProperty),
		m("required %s parameter is missing", is(problem.Required)),
		m(validation.MsgUnexpectedProperty, is(problem.UnexpectedField)),
		m("unknown query parameter", is(problem.UnexpectedField)),
		m(validation.MsgExpectedMinLength, bound(problem.TooShort, "min", "")),
		m(validation.MsgExpectedMaxLength, bound(problem.TooLong, "max", "")),
		m(validation.MsgExpectedMinItems, bound(problem.TooFew, "min", "")),
		m(validation.MsgExpectedMaxItems, bound(problem.TooMany, "max", "")),
		m(validation.MsgExpectedMinimumNumber, bound(problem.BelowMinimum, "min", "false")),
		m(validation.MsgExpectedExclusiveMinimumNumber, bound(problem.BelowMinimum, "min", "true")),
		m(validation.MsgExpectedMaximumNumber, bound(problem.AboveMaximum, "max", "false")),
		m(validation.MsgExpectedExclusiveMaximumNumber, bound(problem.AboveMaximum, "max", "true")),
		m(validation.MsgExpectedOneOf, func(a []string) classification {
			return classification{rule: problem.InvalidChoice, params: map[string]any{"allowed": a[0]}}
		}),
		m(validation.MsgExpectedArrayItemsUnique, is(problem.DuplicateItems)),
	)
	for _, f := range []string{
		validation.MsgExpectedBoolean, validation.MsgExpectedNumber, validation.MsgExpectedInteger,
		validation.MsgExpectedString, validation.MsgExpectedArray, validation.MsgExpectedObject,
		"invalid integer", "invalid float", "invalid boolean",
	} {
		out = append(out, m(f, is(problem.InvalidType)))
	}
	for _, f := range []string{
		validation.MsgExpectedRFC3339DateTime, validation.MsgExpectedRFC1123DateTime,
		validation.MsgExpectedRFC3339Date, validation.MsgExpectedRFC3339Time,
		validation.MsgExpectedRFC5322Email, validation.MsgExpectedRFC5322EmailBare,
		validation.MsgExpectedRFC5890Hostname, validation.MsgExpectedRFC2673IPv4,
		validation.MsgExpectedRFC2373IPv6, validation.MsgExpectedRFCIPAddr,
		validation.MsgExpectedRFC3986URI, validation.MsgExpectedRFC3986AbsoluteURI,
		validation.MsgExpectedRFC4122UUID, validation.MsgExpectedRFC6570URITemplate,
		validation.MsgExpectedRFC6901JSONPointer, validation.MsgExpectedRFC6901RelativeJSONPointer,
		validation.MsgExpectedRegexp, validation.MsgExpectedDuration,
		validation.MsgExpectedBase64String, validation.MsgExpectedMatchPattern,
		validation.MsgExpectedBePattern, "invalid date/time for format %s",
	} {
		out = append(out, m(f, is(problem.InvalidFormat)))
	}
	return out
}()

func classify(msg string) classification {
	for _, m := range matchers {
		if args := m.re.FindStringSubmatch(msg); args != nil {
			return m.build(args[1:])
		}
	}
	return classification{rule: problem.Invalid}
}
