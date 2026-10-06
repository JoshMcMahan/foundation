package dev

import (
	"bufio"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"strings"
)

// environ is the environment for the server and processes: the dotenv file
// under the real environment, so that `NAME=value go tool dev` overrides it.
func environ(path string) ([]string, error) {
	file, err := readDotenv(path)
	if err != nil {
		return nil, err
	}
	env := os.Environ()
	for _, kv := range file {
		key, _, _ := strings.Cut(kv, "=")
		if _, set := os.LookupEnv(key); !set {
			env = append(env, kv)
		}
	}
	return env, nil
}

// readDotenv reads KEY=value lines, skipping blanks and # comments. Values
// may be quoted; nothing is expanded.
func readDotenv(path string) ([]string, error) {
	f, err := os.Open(path) //nolint:gosec // the developer's own env file
	if errors.Is(err, fs.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer f.Close()

	var env []string
	scanner := bufio.NewScanner(f)
	for n := 1; scanner.Scan(); n++ {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(strings.TrimPrefix(line, "export "), "=")
		key = strings.TrimSpace(key)
		if !ok || key == "" {
			return nil, fmt.Errorf("%s:%d: want KEY=value", path, n)
		}
		value = strings.TrimSpace(value)
		if len(value) >= 2 && (value[0] == '"' || value[0] == '\'') && value[len(value)-1] == value[0] {
			value = value[1 : len(value)-1]
		}
		env = append(env, key+"="+value)
	}
	return env, scanner.Err()
}
