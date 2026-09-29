package example

import (
	"errors"
	"fmt"

	"github.com/parallelworks/foundation/problem"
)

var nameTaken = &problem.Type{}

type other struct{}

func (other) New(error) error        { return nil }
func (other) With(string, any) other { return other{} }

func bad(err error, name string) {
	_ = nameTaken.New(err.Error())                          // want `internal error leaks`
	_ = nameTaken.Newf("insert failed: %v", err)            // want `internal error leaks`
	_ = nameTaken.Newf("%s: %s", name, err.Error())         // want `internal error leaks`
	_ = nameTaken.At("#/name", err.Error())                 // want `internal error leaks`
	_ = nameTaken.AtParameter("query", "team", err.Error()) // want `internal error leaks`
	_ = problem.Status(500, err.Error())                    // want `internal error leaks`
	_ = nameTaken.New("taken").With("reason", err)          // want `internal error leaks`
	_ = nameTaken.At("#/name", "bad").With("why", err)      // want `internal error leaks`
	_ = nameTaken.New(fmt.Sprintf("%s is taken", name))     // want `use Newf`
}

func good(err error, name string) {
	_ = nameTaken.New("a team with this name exists").WithCause(err)
	_ = nameTaken.Newf("%s is taken", name).With("name", name)
	_ = problem.Status(404, "no team "+name)
	_ = other{}.New(err)
	_ = other{}.With("err", err)
	_ = errors.New(name)
}
