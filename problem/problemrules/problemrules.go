// Package problemrules holds go-ruleguard rules that keep internal errors out
// of problem responses. Import them into a ruleguard rules file:
//
//	//go:build ruleguard
//
//	package gorules
//
//	import (
//		"github.com/parallelworks/foundation/problem/problemrules"
//		"github.com/quasilyte/go-ruleguard/dsl"
//	)
//
//	func init() { dsl.ImportRules("", problemrules.Bundle) }
package problemrules

import "github.com/quasilyte/go-ruleguard/dsl"

// Bundle exports the rules for dsl.ImportRules.
var Bundle = dsl.Bundle{}

const leak = `an internal error leaks to the client here: detail and params are sent. ` +
	`Describe the problem in words and attach the error with .WithCause(err), which is only logged`

// noErrorInProblem forbids an error, or its Error() text, in anything a
// problem sends: a detail, a field error's detail, or a param. A problem's
// cause, attached with WithCause, is the one place an error belongs.
//
// Bad:  NameTaken.Newf("insert failed: %v", err)
// Good: NameTaken.New("a team with this name exists").WithCause(err)
func noErrorInProblem(m dsl.Matcher) {
	m.Import("github.com/parallelworks/foundation/problem")

	// A string formatted from an error elsewhere, fmt.Sprint(err), is not
	// caught: Contains cannot check the type of what it matches.
	carriesError := func(x dsl.Var) bool {
		return x.Type.Implements(`error`) || x.Text.Matches(`\.Error\(\)`)
	}

	// gogrep cannot match an argument in any position, so Newf's are listed.
	m.Match(
		`$t.New($x)`, `$t.At($_, $x)`, `$t.AtParameter($_, $_, $x)`,
		`$t.Newf($_, $x, $*_)`, `$t.Newf($_, $_, $x, $*_)`, `$t.Newf($_, $_, $_, $x, $*_)`,
		`$t.Newf($_, $_, $_, $_, $x, $*_)`, `$t.Newf($_, $_, $_, $_, $_, $x, $*_)`,
	).
		Where(m["t"].Type.Is(`*problem.Type`) && carriesError(m["x"])).
		At(m["x"]).
		Report(leak)

	m.Match(`problem.Status($_, $x)`).
		Where(carriesError(m["x"])).
		At(m["x"]).
		Report(leak)

	m.Match(`$p.With($_, $x)`).
		Where((m["p"].Type.Is(`*problem.Problem`) || m["p"].Type.Is(`*problem.FieldError`)) && carriesError(m["x"])).
		At(m["x"]).
		Report(leak)
}

// noSprintfInProblem forbids New(fmt.Sprintf(...)): Newf formats.
//
// Bad:  NotInWorkspace.New(fmt.Sprintf("%s is not a member", name))
// Good: NotInWorkspace.Newf("%s is not a member", name)
func noSprintfInProblem(m dsl.Matcher) {
	m.Import("github.com/parallelworks/foundation/problem")

	m.Match(`$t.New(fmt.Sprintf($*args))`).
		Where(m["t"].Type.Is(`*problem.Type`)).
		Suggest(`$t.Newf($args)`).
		Report(`use Newf(format, args...) instead of New(fmt.Sprintf(...))`)
}
