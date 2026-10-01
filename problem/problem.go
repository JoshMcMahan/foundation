// Package problem implements RFC 9457 problem details with stable codes that
// clients localize on.
//
// A problem's type is either "about:blank", meaning nothing beyond its HTTP
// status, or a Type defined in a Registry, served as a relative URI such as
// "/problems/shop/name_taken". Every defined type has a Code, a short
// snake_case name that clients use as a message key. For an about:blank
// problem, clients derive the code from the status with CodeForStatus.
package problem

import (
	"encoding/json"
	"errors"
	"net/http"
)

// MediaType is the RFC 9457 media type for a problem details object.
const MediaType = "application/problem+json"

// Blank is the problem type for a problem with no semantics beyond its status.
const Blank = "about:blank"

// Code is a problem type's stable, machine-readable name. Clients key their
// messages on it, so a code is part of the API contract: never rename one. The
// set is open: a client that meets a code it doesn't know falls back to the
// one for the status.
type Code string

// The codes clients derive from the status of an about:blank problem. They are
// never sent, since about:blank has no members beyond RFC 9457's own.
const (
	InvalidRequest  Code = "invalid_request"
	Unauthenticated Code = "unauthenticated"
	Forbidden       Code = "forbidden"
	NotFound        Code = "not_found"
	Conflict        Code = "conflict"
	RateLimited     Code = "rate_limited"
	Internal        Code = "internal"
	Unavailable     Code = "unavailable"
)

// StatusCodes lists the codes CodeForStatus returns.
var StatusCodes = []Code{
	InvalidRequest, Unauthenticated, Forbidden, NotFound,
	Conflict, RateLimited, Internal, Unavailable,
}

// CodeForStatus is the code for an about:blank problem with the given status.
func CodeForStatus(status int) Code {
	switch {
	case status == http.StatusUnauthorized:
		return Unauthenticated
	case status == http.StatusForbidden:
		return Forbidden
	case status == http.StatusNotFound:
		return NotFound
	case status == http.StatusConflict:
		return Conflict
	case status == http.StatusTooManyRequests:
		return RateLimited
	case status == http.StatusServiceUnavailable:
		return Unavailable
	case status >= 400 && status < 500:
		return InvalidRequest
	default:
		return Internal
	}
}

// Problem is an RFC 9457 problem details object. Title, Detail and each
// FieldError's Detail are English, for developers and logs; clients show the
// message for Code instead.
type Problem struct { //nolint:errname // RFC 9457 calls it a problem details object
	Type     string         `json:"type" format:"uri-reference" doc:"Identifies the problem type and resolves to its documentation. about:blank means nothing beyond the status."`
	Title    string         `json:"title,omitempty" doc:"Short English summary of the problem type, for developers."`
	Status   int            `json:"status,omitempty" doc:"The HTTP status code."`
	Detail   string         `json:"detail,omitempty" doc:"English explanation of this occurrence, for developers and logs."`
	Instance string         `json:"instance,omitempty" format:"uri-reference" doc:"Identifies this occurrence of the problem."`
	Code     Code           `json:"code,omitempty" doc:"Stable name of the problem type, for clients to show a localized message. New codes can appear: fall back to the status for one you don't know. Absent for about:blank: derive it from the status."`
	Params   map[string]any `json:"params,omitempty" doc:"Values the code's localized message shows."`
	Errors   []*FieldError  `json:"errors,omitempty" doc:"For a validation problem, each invalid field and the rule it failed."`

	cause  error
	denied bool
}

// Status returns an about:blank problem: one the status fully describes.
func Status(status int, detail string) *Problem {
	return &Problem{Type: Blank, Title: http.StatusText(status), Status: status, Detail: detail}
}

// With adds a value the problem's localized message shows.
func (p *Problem) With(key string, value any) *Problem {
	if p.Params == nil {
		p.Params = map[string]any{}
	}
	p.Params[key] = value
	return p
}

// WithCause attaches the underlying error, for logs. It is never sent.
func (p *Problem) WithCause(err error) *Problem {
	p.cause = err
	return p
}

// AsDenial marks p as a refusal to authorize, so callers can tell it from a
// failure to work out the answer, such as an unreachable database, which must
// never be reported as a permission problem. It changes nothing sent.
func (p *Problem) AsDenial() *Problem {
	p.denied = true
	return p
}

// Denied reports whether err is, or wraps, a problem marked with AsDenial.
func Denied(err error) bool {
	p, ok := errors.AsType[*Problem](err)
	return ok && p.denied
}

// Key is the code clients localize on: Code, or for an about:blank problem,
// the code its status implies.
func (p *Problem) Key() Code {
	if p.Code != "" {
		return p.Code
	}
	return CodeForStatus(p.Status)
}

func (p *Problem) Error() string {
	if p.Detail != "" {
		return p.Detail
	}
	return p.Title
}

// Unwrap returns the cause attached with WithCause.
func (p *Problem) Unwrap() error { return p.cause }

// GetStatus returns the HTTP status, so a Problem is a huma.StatusError.
func (p *Problem) GetStatus() int { return p.Status }

// ContentType makes huma serve a Problem as application/problem+json.
func (p *Problem) ContentType(string) string { return MediaType }

// Write sends p as the response.
func Write(w http.ResponseWriter, p *Problem) {
	w.Header().Set("Content-Type", MediaType)
	w.WriteHeader(p.Status)
	_ = json.NewEncoder(w).Encode(p)
}
