package problem

import (
	"encoding/json"
	"net/url"
	"strconv"
	"strings"
)

// FieldError is one entry in a validation problem's errors, the extension
// RFC 9457 §3 uses in its validation example. Pointer locates a field in the
// request body; Parameter and In locate a query, path, header or cookie
// parameter instead.
type FieldError struct {
	Type      string         `json:"type" format:"uri-reference" doc:"The rule's problem type."`
	Code      Code           `json:"code" doc:"Stable name of the rule, for clients to show a localized message. New codes can appear: fall back to a generic message for one you don't know."`
	Detail    string         `json:"detail,omitempty" doc:"English explanation, for developers and logs."`
	Pointer   string         `json:"pointer,omitempty" doc:"JSON Pointer to the invalid body field, as a URI fragment such as #/items/0/name."`
	Parameter string         `json:"parameter,omitempty" doc:"Name of the invalid request parameter."`
	In        string         `json:"in,omitempty" enum:"query,path,header,cookie" doc:"Where parameter is."`
	Params    map[string]any `json:"params,omitempty" doc:"Values the rule's localized message shows."`

	needs []string
}

// At returns a field error of this type for the body field at pointer, which
// Pointer builds.
func (t *Type) At(pointer, detail string) *FieldError {
	return &FieldError{Type: t.uri, Code: t.Code, Detail: detail, Pointer: pointer, needs: t.Params}
}

// AtParameter returns a field error of this type for a request parameter. in
// is "query", "path", "header" or "cookie", as in OpenAPI.
func (t *Type) AtParameter(in, name, detail string) *FieldError {
	return &FieldError{Type: t.uri, Code: t.Code, Detail: detail, Parameter: name, In: in, needs: t.Params}
}

// Error makes a FieldError an error, so a huma Resolver can return one.
func (e *FieldError) Error() string {
	loc := e.Pointer
	if e.Parameter != "" {
		loc = e.In + " " + e.Parameter
	}
	return loc + ": " + e.Detail
}

// MarshalJSON encodes a field error missing a param its type's message needs
// as Invalid, so a client never shows a message with a placeholder it cannot
// fill.
func (e FieldError) MarshalJSON() ([]byte, error) {
	type wire FieldError
	if !hasAll(e.Params, e.needs) {
		e.Type, e.Code, e.Params = Invalid.uri, Invalid.Code, nil
	}
	return json.Marshal(wire(e))
}

// With adds a value the field error's localized message shows.
func (e *FieldError) With(key string, value any) *FieldError {
	if e.Params == nil {
		e.Params = map[string]any{}
	}
	e.Params[key] = value
	return e
}

// ValidationFailed returns a Validation problem listing errs.
func ValidationFailed(errs ...*FieldError) *Problem {
	p := Validation.New("validation failed")
	p.Errors = errs
	return p
}

// Pointer returns the JSON Pointer (RFC 6901) to a body field, in the URI
// fragment form RFC 9457's example uses: Pointer("items", 3, "name") is
// "#/items/3/name". Pointer() is the whole body, "#".
func Pointer(path ...any) string {
	var b strings.Builder
	b.WriteByte('#')
	for _, seg := range path {
		b.WriteByte('/')
		var s string
		switch v := seg.(type) {
		case int:
			s = strconv.Itoa(v)
		case string:
			s = strings.NewReplacer("~", "~0", "/", "~1").Replace(v)
		default:
			panic("problem: Pointer takes string and int segments")
		}
		b.WriteString(url.PathEscape(s))
	}
	return b.String()
}
