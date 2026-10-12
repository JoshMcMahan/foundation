import { afterEach, describe, expect, it, vi } from 'vitest'
import { testEngine } from '../test/engine'
import { lintContext } from './lintContext'

describe('lintContext', () => {
  it('fetches each uses target and the secret names once, then hands them over', async () => {
    const source = `jobs:
  a:
    steps:
      - uses: workflow/child
      - uses: example/checkout
      - uses: marketplace/other
      - uses: marketplace/other
        with:
          $yaml: elsewhere.yaml
`
    const resolve = vi.fn(async () => ({
      on: { execute: { inputs: { color: { type: 'string' } } } },
    }))
    const secrets = vi.fn(async () => ['token'])
    const onMore = vi.fn()
    const actions = { 'example/checkout': {} }
    expect(lintContext(testEngine.editing, source, { resolve, secrets, actions }, onMore)).toEqual({
      usesInputs: {},
    })
    await vi.waitFor(() => expect(onMore).toHaveBeenCalledTimes(2))
    // The target two steps read from different files isn't fetched at all.
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(resolve).toHaveBeenCalledWith({ kind: 'workflow', name: 'child' })
    expect(lintContext(testEngine.editing, source, { resolve, secrets, actions }, onMore)).toEqual({
      usesInputs: { 'workflow/child': { color: { type: 'string' } } },
      secretVars: ['token'],
    })
    expect(resolve).toHaveBeenCalledTimes(1)
    expect(secrets).toHaveBeenCalledTimes(1)
  })
})

describe('lintContext over time', () => {
  // Each test starts from nothing fetched.
  async function fresh() {
    vi.resetModules()
    return (await import('./lintContext')).lintContext
  }
  const usesChild = (name: string) => `jobs:
  a:
    steps:
      - uses: workflow/${name}
`
  const inputs = (name: string) => ({ on: { execute: { inputs: { [name]: { type: 'string' } } } } })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('tells every check waiting on a fetch when it lands', async () => {
    const lint = await fresh()
    let land = (_: unknown) => {}
    const resolve = vi.fn(() => new Promise((done) => (land = done)))
    const first = vi.fn()
    const second = vi.fn()
    lint(testEngine.editing, usesChild('a'), { resolve }, first)
    lint(testEngine.editing, usesChild('a'), { resolve }, second)
    expect(resolve).toHaveBeenCalledTimes(1)
    land(inputs('color'))
    await vi.waitFor(() => expect(second).toHaveBeenCalledOnce())
    expect(first).toHaveBeenCalledOnce()
  })

  it('fetches a target again once it goes stale, keeping the last one meanwhile', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const lint = await fresh()
    const resolve = vi.fn(async () => inputs('color'))
    const onMore = vi.fn()
    lint(testEngine.editing, usesChild('b'), { resolve }, onMore)
    await vi.waitFor(() => expect(onMore).toHaveBeenCalledOnce())
    resolve.mockImplementation(async () => inputs('size'))
    vi.setSystemTime(Date.now() + 61_000)
    expect(lint(testEngine.editing, usesChild('b'), { resolve }, onMore).usesInputs).toEqual({
      'workflow/b': { color: { type: 'string' } },
    })
    await vi.waitFor(() => expect(onMore).toHaveBeenCalledTimes(2))
    expect(lint(testEngine.editing, usesChild('b'), { resolve }, onMore).usesInputs).toEqual({
      'workflow/b': { size: { type: 'string' } },
    })
  })

  it('waits a few seconds before reading a target that failed again', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const lint = await fresh()
    const resolve = vi.fn(async () => {
      throw new Error('no such workflow')
    })
    const onMore = vi.fn()
    lint(testEngine.editing, usesChild('typo'), { resolve }, onMore)
    await vi.waitFor(() => expect(onMore).toHaveBeenCalledOnce())
    lint(testEngine.editing, usesChild('typo'), { resolve }, onMore)
    expect(resolve).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + 11_000)
    lint(testEngine.editing, usesChild('typo'), { resolve }, onMore)
    expect(resolve).toHaveBeenCalledTimes(2)
  })

  it('reads the secret names again once they go stale', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const lint = await fresh()
    const secrets = vi.fn(async () => ['token'])
    const onMore = vi.fn()
    lint(testEngine.editing, 'jobs: {}\n', { secrets }, onMore)
    await vi.waitFor(() => expect(onMore).toHaveBeenCalledOnce())
    lint(testEngine.editing, 'jobs: {}\n', { secrets }, onMore)
    expect(secrets).toHaveBeenCalledTimes(1)
    vi.setSystemTime(Date.now() + 61_000)
    lint(testEngine.editing, 'jobs: {}\n', { secrets }, onMore)
    expect(secrets).toHaveBeenCalledTimes(2)
  })

  it('keeps the last target it read when a refresh fails, and tries again soon', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const lint = await fresh()
    const resolve = vi.fn(async () => inputs('color'))
    const onMore = vi.fn()
    lint(testEngine.editing, usesChild('flaky'), { resolve }, onMore)
    await vi.waitFor(() => expect(onMore).toHaveBeenCalledOnce())
    resolve.mockImplementation(async () => {
      throw new Error('offline')
    })
    vi.setSystemTime(Date.now() + 61_000)
    lint(testEngine.editing, usesChild('flaky'), { resolve }, onMore)
    await vi.waitFor(() => expect(onMore).toHaveBeenCalledTimes(2))
    expect(lint(testEngine.editing, usesChild('flaky'), { resolve }, onMore).usesInputs).toEqual({
      'workflow/flaky': { color: { type: 'string' } },
    })
    expect(resolve).toHaveBeenCalledTimes(2)
    vi.setSystemTime(Date.now() + 11_000)
    lint(testEngine.editing, usesChild('flaky'), { resolve }, onMore)
    expect(resolve).toHaveBeenCalledTimes(3)
  })
})
