// Package problem is a stub of the real package's API, for the rule tests.
package problem

type Problem struct{}

func (p *Problem) With(string, any) *Problem { return p }
func (p *Problem) WithCause(error) *Problem  { return p }

type FieldError struct{}

func (e *FieldError) With(string, any) *FieldError { return e }

type Type struct{}

func (t *Type) New(string) *Problem                            { return nil }
func (t *Type) Newf(string, ...any) *Problem                   { return nil }
func (t *Type) At(string, string) *FieldError                  { return nil }
func (t *Type) AtParameter(string, string, string) *FieldError { return nil }

func Status(int, string) *Problem { return nil }
