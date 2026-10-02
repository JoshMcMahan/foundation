package problem

import "testing"

func TestFormat(t *testing.T) {
	tests := []struct {
		lang, msg string
		params    map[string]any
		want      string
	}{
		{"en", "Plain text, can't stop.", nil, "Plain text, can't stop."},
		{"en", "Hello {name}.", map[string]any{"name": "Ada"}, "Hello Ada."},
		{"en", "{n} items", map[string]any{"n": 12345}, "12,345 items"},
		{"de", "{n} Einträge", map[string]any{"n": 12345.0}, "12.345 Einträge"},
		{"en", "Must be at most {max, plural, one {# character} other {# characters}}.", map[string]any{"max": 1}, "Must be at most 1 character."},
		{"en", "Must be at most {max, plural, one {# character} other {# characters}}.", map[string]any{"max": 2000.0}, "Must be at most 2,000 characters."},
		{"en", "{n, plural, =0 {none} one {one} other {#}}", map[string]any{"n": 0}, "none"},
		{"ja", "{max, number}文字以内で入力してください。", map[string]any{"max": 64}, "64文字以内で入力してください。"},
		{"en", "{kind, select, cluster {A cluster} other {Something}} is busy.", map[string]any{"kind": "cluster"}, "A cluster is busy."},
		{"en", "{kind, select, cluster {A cluster} other {Something}} is busy.", map[string]any{"kind": "bucket"}, "Something is busy."},
		{"en", "Use '{braces}' and ''quotes''.", nil, "Use {braces} and 'quotes'."},
		{"en", "{n, plural, one {# '#' item} other {# items}}", map[string]any{"n": 1}, "1 # item"},
		{"en", "Nested {n, plural, one {{who} has one} other {{who} has #}}.", map[string]any{"n": 3, "who": "Ada"}, "Nested Ada has 3."},
	}
	for _, tt := range tests {
		got, err := format(tt.lang, tt.msg, tt.params)
		if err != nil || got != tt.want {
			t.Errorf("format(%q, %q, %v) = %q, %v; want %q", tt.lang, tt.msg, tt.params, got, err, tt.want)
		}
	}
}

func TestFormatErrors(t *testing.T) {
	for _, tt := range []struct {
		msg    string
		params map[string]any
	}{
		{"Hello {name}", nil},
		{"Unclosed {name", map[string]any{"name": "x"}},
		{"{n, plural, one {x}}", map[string]any{"n": 2}},
		{"{n, plural, other {#}}", map[string]any{"n": "many"}},
		{"{n, date}", map[string]any{"n": 1}},
	} {
		if got, err := format("en", tt.msg, tt.params); err == nil {
			t.Errorf("format(%q) = %q, want an error", tt.msg, got)
		}
	}
}

// Every shared message formats in every language with the params its type needs.
func TestSharedMessagesFormat(t *testing.T) {
	params := map[string]any{"min": 2, "max": 64, "exclusive": false, "allowed": "a, b"}
	for _, lang := range Shared.Languages() {
		for code := range Shared.messages["en"] {
			if _, err := format(lang, Shared.messages[lang][code], params); err != nil {
				t.Errorf("%s %s: %v", lang, code, err)
			}
		}
	}
}
