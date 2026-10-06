import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { affectedChecks, detectChanges } from './changes.mjs'

const both = { go: true, js: true }
const goOnly = { go: true, js: false }
const jsOnly = { go: false, js: true }

for (const [path, expected] of [
  ['README.md', { go: false, js: false }],
  ['packages/ui/CHANGELOG.md', { go: false, js: false }],
  ['LICENSE', { go: false, js: false }],
  ['server/server.go', goOnly],
  ['spa/locale_test.go', goOnly],
  ['pgdb/testdata/migrations/00001_widgets.sql', goOnly],
  ['go.mod', goOnly],
  ['go.sum', goOnly],
  ['tools/go.sum', goOnly],
  ['.golangci.yml', goOnly],
  ['packages/ui/src/Table.tsx', jsOnly],
  ['packages/ui/.storybook/main.ts', jsOnly],
  ['packages/ui/src/Guide.mdx', jsOnly],
  ['packages/i18n/src/index.ts', jsOnly],
  ['packages/lint/ui-text.grit', jsOnly],
  ['packages/pnpm-lock.yaml', jsOnly],
  ['packages/pnpm-workspace.yaml', jsOnly],
  ['packages/package.json', jsOnly],
  ['packages/tsconfig.base.json', jsOnly],
  ['problem/types.go', both],
  ['problem/messages/en.json', both],
  ['packages/problem/src/index.ts', both],
  ['packages/problem/src/messages/en.json', both],
  ['Makefile', both],
  ['.github/workflows/ci.yml', both],
  ['.github/scripts/changes.mjs', both],
  ['.gitignore', both],
  ['new-package/index.go', both],
]) {
  test(`checks affected by ${path}`, () => {
    assert.deepEqual(affectedChecks([path]), expected)
  })
}

function repository(t) {
  const root = mkdtempSync(join(tmpdir(), 'ci-changes-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const cwd = join(root, 'repo')
  mkdirSync(cwd)
  const git = (...args) =>
    execFileSync(
      'git',
      [
        '-c',
        'user.name=Test',
        '-c',
        'user.email=test',
        '-c',
        'commit.gpgsign=false',
        '-c',
        'core.hooksPath=/dev/null',
        ...args,
      ],
      { cwd, stdio: 'pipe' },
    )
  const write = (path, content = path) => {
    const target = join(cwd, path)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content)
  }
  const commit = () => {
    git('add', '--all')
    git('commit', '-qm', 'test change')
  }
  const merge = () => {
    git('checkout', '-q', 'base')
    git('merge', '--no-ff', '-qm', 'test merge', 'feature')
  }
  const shallow = (depth) => {
    const target = join(root, `shallow-${depth}`)
    git('clone', '--depth', String(depth), pathToFileURL(cwd).href, target)
    return target
  }
  git('init', '-qb', 'base')
  write('README.md')
  write('server/original.go')
  commit()
  git('checkout', '-qb', 'feature')
  return { cwd, git, write, commit, merge, shallow }
}

test('a shallow merge checkout includes every commit in the PR', (t) => {
  const repo = repository(t)
  repo.write('server/server.go')
  repo.commit()
  repo.write('packages/ui/src/component.tsx')
  repo.commit()
  repo.merge()
  assert.deepEqual(detectChanges(repo.shallow(2)), both)
})

test('deleting a file still runs its checks', (t) => {
  const repo = repository(t)
  repo.git('rm', 'server/original.go')
  repo.commit()
  repo.merge()
  assert.deepEqual(detectChanges(repo.cwd), goOnly)
})

test('renaming across language boundaries checks both paths', (t) => {
  const repo = repository(t)
  mkdirSync(join(repo.cwd, 'packages/ui'), { recursive: true })
  renameSync(join(repo.cwd, 'server/original.go'), join(repo.cwd, 'packages/ui/renamed.ts'))
  repo.commit()
  repo.merge()
  assert.deepEqual(detectChanges(repo.cwd), both)
})

test('filenames with newlines are not split into extra paths', (t) => {
  const repo = repository(t)
  repo.write('packages/ui/component\nwith spaces.tsx')
  repo.commit()
  repo.merge()
  assert.deepEqual(detectChanges(repo.cwd), jsOnly)
})

test('documentation-only merges skip both language jobs', (t) => {
  const repo = repository(t)
  repo.write('README.md', 'updated docs')
  repo.commit()
  repo.merge()
  assert.deepEqual(detectChanges(repo.cwd), { go: false, js: false })
})

test('non-merge checkouts and missing history run all checks', (t) => {
  const repo = repository(t)
  assert.deepEqual(detectChanges(repo.cwd), both)
  repo.write('README.md', 'updated docs')
  repo.commit()
  repo.merge()
  assert.deepEqual(detectChanges(repo.shallow(1)), both)
  assert.deepEqual(detectChanges(join(repo.cwd, 'missing')), both)
})
