package problem

import (
	"fmt"
	"net/http"
	"regexp"
	"slices"
)

// Type is a problem type (RFC 9457 §4): a URI, a short title and the status
// it is used with. Define one with Registry.Define.
type Type struct {
	Code   Code
	Status int
	// Title is a short English summary that never varies between occurrences.
	Title string
	// Doc explains, in English, what causes the problem and how to resolve it.
	Doc string
	// Params names the values the type's localized message shows.
	Params []string

	uri string
}

// URI is the type's relative URI, which resolves to its documentation page.
func (t *Type) URI() string { return t.uri }

// New returns a problem of this type.
func (t *Type) New(detail string) *Problem {
	return &Problem{Type: t.uri, Title: t.Title, Status: t.Status, Detail: detail, Code: t.Code, needs: t.Params}
}

// Newf returns a problem of this type with a formatted detail.
func (t *Type) Newf(format string, args ...any) *Problem {
	return t.New(fmt.Sprintf(format, args...))
}

// Registry holds the problem types of one application. Their URIs are
// /problems/<name>/<code>, so a host that mounts several applications serves
// all their pages without collisions.
type Registry struct {
	name  string
	types []*Type
}

var (
	codePattern = regexp.MustCompile(`^[a-z][a-z0-9_]*$`)
	namePattern = regexp.MustCompile(`^[a-z][a-z0-9-]*$`)
)

// NewRegistry returns an empty registry for the application name, such as
// "shop". It panics if name is not a lowercase URI segment.
func NewRegistry(name string) *Registry {
	if !namePattern.MatchString(name) {
		panic(fmt.Sprintf("problem: registry name %q must match %s", name, namePattern))
	}
	return &Registry{name: name}
}

// Name is the application name in the registry's URIs.
func (r *Registry) Name() string { return r.name }

// Types returns the registry's types in the order they were defined.
func (r *Registry) Types() []*Type { return slices.Clone(r.types) }

// Lookup returns the type with the given code.
func (r *Registry) Lookup(code Code) (*Type, bool) {
	for _, t := range r.types {
		if t.Code == code {
			return t, true
		}
	}
	return nil, false
}

// Define adds a type to the registry and returns it. Call it from package
// variable declarations: it panics on an invalid or duplicate code, or on
// one that collides with the codes this package defines.
func (r *Registry) Define(t Type) *Type {
	d := define(t, "/problems/"+r.name+"/")
	if _, ok := r.Lookup(d.Code); ok {
		panic(fmt.Sprintf("problem: %s defines %q twice", r.name, d.Code))
	}
	if reserved(d.Code) {
		panic(fmt.Sprintf("problem: %s cannot define %q, which this package defines", r.name, d.Code))
	}
	r.types = append(r.types, d)
	return d
}

func define(t Type, prefix string) *Type {
	if !codePattern.MatchString(string(t.Code)) {
		panic(fmt.Sprintf("problem: code %q must match %s", t.Code, codePattern))
	}
	if t.Status < 400 || t.Status > 599 {
		panic(fmt.Sprintf("problem: %q has status %d, which is not an error", t.Code, t.Status))
	}
	if t.Title == "" {
		panic(fmt.Sprintf("problem: %q needs a title", t.Code))
	}
	t.Params = slices.Clone(t.Params)
	t.uri = prefix + string(t.Code)
	return &t
}

func reserved(c Code) bool {
	if slices.Contains(StatusCodes, c) {
		return true
	}
	return slices.ContainsFunc(Rules, func(t *Type) bool { return t.Code == c }) || c == Validation.Code
}

func rule(code Code, title, doc string, params ...string) *Type {
	return define(Type{Code: code, Status: http.StatusUnprocessableEntity, Title: title, Doc: doc, Params: params}, "/problems/")
}

// Validation is the problem for a request with invalid fields. Its Errors
// list each one, typed with a rule.
var Validation = rule("validation", "Invalid request",
	"One or more fields in the request are invalid. Each entry in errors names the field and the rule it failed.")

// The rules a field can fail. They are shared by every application, so their
// URIs are /problems/<code>. An application whose field fails a check of its
// own uses one of its Types instead.
var (
	Invalid = rule("invalid", "Invalid value",
		"The value is not valid for this field.")
	Required = rule("required", "Value required",
		"The field is required and was missing or empty.")
	TooShort = rule("too_short", "Value too short",
		"The value has fewer characters than the field allows.", "min")
	TooLong = rule("too_long", "Value too long",
		"The value has more characters than the field allows.", "max")
	TooFew = rule("too_few", "Too few items",
		"The list has fewer items than the field allows.", "min")
	TooMany = rule("too_many", "Too many items",
		"The list has more items than the field allows.", "max")
	BelowMinimum = rule("below_minimum", "Number too small",
		"The number is below the field's minimum. exclusive is \"true\" when the minimum itself is not allowed.", "min", "exclusive")
	AboveMaximum = rule("above_maximum", "Number too large",
		"The number is above the field's maximum. exclusive is \"true\" when the maximum itself is not allowed.", "max", "exclusive")
	InvalidFormat = rule("invalid_format", "Invalid format",
		"The value does not have the field's format, such as an email address, a URI or a date.")
	InvalidChoice = rule("invalid_choice", "Not an allowed value",
		"The value is not one of the field's allowed values, listed in allowed.", "allowed")
	InvalidType = rule("invalid_type", "Wrong type",
		"The value has the wrong JSON type, such as a string where a number belongs.")
	UnexpectedField = rule("unexpected_field", "Unknown field",
		"The request has a field the operation does not accept.")
	DuplicateItems = rule("duplicate_items", "Duplicate items",
		"The list has the same item more than once.")
)

// Rules lists every rule, in the order above.
var Rules = []*Type{
	Invalid, Required, TooShort, TooLong, TooFew, TooMany, BelowMinimum,
	AboveMaximum, InvalidFormat, InvalidChoice, InvalidType, UnexpectedField, DuplicateItems,
}
