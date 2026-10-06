import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export function affectedChecks(paths) {
  const checks = { go: false, js: false, dev: false }
  for (const path of paths) {
    if (
      /(^|\/)(README|CONTRIBUTING|CHANGELOG|AGENTS|CLAUDE|SECURITY)\.md$/.test(path) ||
      path === 'LICENSE'
    ) {
      continue
    }
    // Both sides must validate changes to the shared contract and its catalogs.
    if (path.startsWith('problem/') || path.startsWith('packages/problem/')) {
      checks.go = checks.js = true
    } else if (path.startsWith('packages/')) {
      checks.js = true
    } else if (path.startsWith('dev/')) {
      checks.dev = true
    } else if (/^(tools\/|\.golangci\.yml$)/.test(path)) {
      // Both Go modules lint with the same tools and rules.
      checks.go = checks.dev = true
    } else if (/^(pgdb\/|server\/|spa\/|go\.(mod|sum)$)/.test(path)) {
      checks.go = true
    } else {
      // New directories and build configuration are checked until classified.
      checks.go = checks.js = checks.dev = true
    }
  }
  return checks
}

export function detectChanges(cwd = process.cwd()) {
  const git = (...args) => execFileSync('git', args, { cwd, maxBuffer: 16 * 1024 * 1024 })
  try {
    // Comparing against the merge commit's first parent covers the whole PR,
    // including deletions, without an API limit or a fetch of the full history.
    const parents = git('rev-list', '--parents', '-n', '1', 'HEAD').toString().trim().split(/\s+/)
    if (parents.length !== 3) {
      return { go: true, js: true, dev: true }
    }
    const paths = git('diff', '--name-only', '--no-renames', '-z', 'HEAD^1', 'HEAD', '--')
      .toString()
      .split('\0')
      .filter(Boolean)
    return affectedChecks(paths)
  } catch {
    // An unavailable base or failed diff must cost time, never test coverage.
    return { go: true, js: true, dev: true }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const [check, affected] of Object.entries(detectChanges())) {
    console.log(`${check}=${affected}`)
  }
}
