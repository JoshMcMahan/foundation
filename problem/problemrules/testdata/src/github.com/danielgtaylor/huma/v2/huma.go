// Package huma is a stub of the real package's API, for the rule tests.
package huma

type StatusError interface{ error }

var NewError = func(int, string, ...error) StatusError { return nil }

func Error404NotFound(string, ...error) StatusError            { return nil }
func Error422UnprocessableEntity(string, ...error) StatusError { return nil }
