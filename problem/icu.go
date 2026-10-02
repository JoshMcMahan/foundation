package problem

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"

	"golang.org/x/text/feature/plural"
	"golang.org/x/text/language"
	"golang.org/x/text/message"
	"golang.org/x/text/number"
)

// format renders an ICU MessageFormat message, the syntax clients' catalogs
// use, in lang: plain {arg}s, {arg, number}, and {arg, plural, ...} and
// {arg, select, ...} with nested messages, # and exact =n cases. Numbers are
// formatted for lang. A missing param or unsupported syntax is an error.
func format(lang, msg string, params map[string]any) (string, error) {
	tag, err := language.Parse(lang)
	if err != nil {
		tag = language.English
	}
	f := formatter{tag: tag, printer: message.NewPrinter(tag), param: func(name string) (any, bool) {
		v, ok := params[name]
		return v, ok
	}}
	var b strings.Builder
	if err := f.message(&b, msg, 0, false, nil); err != nil {
		return "", err
	}
	return b.String(), nil
}

type formatter struct {
	tag     language.Tag
	printer *message.Printer
	param   func(name string) (any, bool)
}

var errSyntax = errors.New("problem: invalid message syntax")

// message renders msg from i until an unmatched } (when nested) or the end.
// pound is the number # stands for in a plural case, nil elsewhere.
func (f *formatter) message(b *strings.Builder, msg string, i int, nested bool, pound *float64) error {
	for i < len(msg) {
		switch c := msg[i]; {
		case c == '\'':
			i = quote(b, msg, i, pound != nil)
		case c == '{':
			end, err := f.argument(b, msg, i+1)
			if err != nil {
				return err
			}
			i = end
		case c == '}':
			if !nested {
				return fmt.Errorf("%w: unmatched } in %q", errSyntax, msg)
			}
			return nil
		case c == '#' && pound != nil:
			b.WriteString(f.number(*pound))
			i++
		default:
			b.WriteByte(c)
			i++
		}
	}
	if nested {
		return fmt.Errorf("%w: unclosed { in %q", errSyntax, msg)
	}
	return nil
}

// quote handles ICU apostrophes: ” is one apostrophe, and an apostrophe
// before { } (or # in a plural case) quotes up to the next apostrophe. Any
// other apostrophe, as in "can't", is literal.
func quote(b *strings.Builder, msg string, i int, inPlural bool) int {
	if i+1 < len(msg) && msg[i+1] == '\'' {
		b.WriteByte('\'')
		return i + 2
	}
	if i+1 < len(msg) && (msg[i+1] == '{' || msg[i+1] == '}' || (inPlural && msg[i+1] == '#')) {
		end := strings.IndexByte(msg[i+1:], '\'')
		if end < 0 {
			b.WriteString(msg[i+1:])
			return len(msg)
		}
		b.WriteString(msg[i+1 : i+1+end])
		return i + 2 + end
	}
	b.WriteByte('\'')
	return i + 1
}

// argument renders {name}, {name, number} or {name, plural|select, cases}
// starting just after the {, and returns the index after its }.
func (f *formatter) argument(b *strings.Builder, msg string, i int) (int, error) {
	name, i := token(msg, i)
	value, ok := f.param(name)
	if name == "" || !ok {
		return 0, fmt.Errorf("problem: message %q needs param %q", msg, name)
	}
	i = skipSpace(msg, i)
	if i < len(msg) && msg[i] == '}' {
		b.WriteString(f.value(value))
		return i + 1, nil
	}
	if i >= len(msg) || msg[i] != ',' {
		return 0, fmt.Errorf("%w: expected , or } after %q", errSyntax, name)
	}
	kind, i := token(msg, skipSpace(msg, i+1))
	i = skipSpace(msg, i)
	switch kind {
	case "number":
		if i >= len(msg) || msg[i] != '}' {
			return 0, fmt.Errorf("%w: number styles are not supported", errSyntax)
		}
		n, ok := toFloat(value)
		if !ok {
			return 0, fmt.Errorf("problem: param %q is not a number", name)
		}
		b.WriteString(f.number(n))
		return i + 1, nil
	case "plural", "select":
		if i >= len(msg) || msg[i] != ',' {
			return 0, fmt.Errorf("%w: expected cases after %s", errSyntax, kind)
		}
		return f.cases(b, msg, i+1, name, kind, value)
	default:
		return 0, fmt.Errorf("%w: unsupported argument type %q", errSyntax, kind)
	}
}

// cases picks and renders the matching case of a plural or select argument.
func (f *formatter) cases(b *strings.Builder, msg string, i int, name, kind string, value any) (int, error) {
	var n float64
	var want []string
	if kind == "plural" {
		var ok bool
		if n, ok = toFloat(value); !ok {
			return 0, fmt.Errorf("problem: param %q is not a number", name)
		}
		want = []string{"=" + strconv.FormatFloat(n, 'f', -1, 64), f.pluralForm(n), "other"}
	} else {
		want = []string{fmt.Sprint(value), "other"}
	}
	type option struct{ start, end int }
	options := map[string]option{}
	for {
		i = skipSpace(msg, i)
		if i < len(msg) && msg[i] == '}' {
			break
		}
		key, next := token(msg, i)
		next = skipSpace(msg, next)
		if key == "" || next >= len(msg) || msg[next] != '{' {
			return 0, fmt.Errorf("%w: bad %s case in %q", errSyntax, kind, msg)
		}
		end, err := skipNested(msg, next+1)
		if err != nil {
			return 0, err
		}
		options[key] = option{next + 1, end}
		i = end + 1
	}
	for _, key := range want {
		if o, ok := options[key]; ok {
			var pound *float64
			if kind == "plural" {
				pound = &n
			}
			var sub strings.Builder
			if err := f.message(&sub, msg[:o.end+1], o.start, true, pound); err != nil {
				return 0, err
			}
			b.WriteString(sub.String())
			return i + 1, nil
		}
	}
	return 0, fmt.Errorf("%w: %s has no case for %v and no other", errSyntax, kind, value)
}

// skipNested returns the index of the } closing a case body starting at i.
func skipNested(msg string, i int) (int, error) {
	depth := 0
	for ; i < len(msg); i++ {
		switch msg[i] {
		case '\'':
			if i+1 < len(msg) && (msg[i+1] == '{' || msg[i+1] == '}' || msg[i+1] == '#') {
				if end := strings.IndexByte(msg[i+1:], '\''); end >= 0 {
					i += 1 + end
				}
			}
		case '{':
			depth++
		case '}':
			if depth == 0 {
				return i, nil
			}
			depth--
		}
	}
	return 0, fmt.Errorf("%w: unclosed case in %q", errSyntax, msg)
}

func (f *formatter) pluralForm(n float64) string {
	if n != math.Trunc(n) || math.Abs(n) > math.MaxInt32 {
		return "other"
	}
	switch plural.Cardinal.MatchPlural(f.tag, int(math.Abs(n)), 0, 0, 0, 0) {
	case plural.Zero:
		return "zero"
	case plural.One:
		return "one"
	case plural.Two:
		return "two"
	case plural.Few:
		return "few"
	case plural.Many:
		return "many"
	default:
		return "other"
	}
}

func (f *formatter) value(v any) string {
	if n, ok := toFloat(v); ok {
		return f.number(n)
	}
	return fmt.Sprint(v)
}

func (f *formatter) number(n float64) string {
	return f.printer.Sprint(number.Decimal(n))
}

func toFloat(v any) (float64, bool) {
	switch n := v.(type) {
	case int:
		return float64(n), true
	case int32:
		return float64(n), true
	case int64:
		return float64(n), true
	case uint:
		return float64(n), true
	case uint32:
		return float64(n), true
	case uint64:
		return float64(n), true
	case float32:
		return float64(n), true
	case float64:
		return n, true
	}
	return 0, false
}

func token(msg string, i int) (string, int) {
	i = skipSpace(msg, i)
	start := i
	for i < len(msg) && !strings.ContainsRune(" \t\n,{}", rune(msg[i])) {
		i++
	}
	return msg[start:i], i
}

func skipSpace(msg string, i int) int {
	for i < len(msg) && strings.ContainsRune(" \t\n", rune(msg[i])) {
		i++
	}
	return i
}
