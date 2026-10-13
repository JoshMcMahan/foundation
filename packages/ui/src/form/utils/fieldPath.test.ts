import { describe, expect, it } from 'vitest'
import { fieldPath } from './fieldPath'

describe('fieldPath', () => {
  it("names a workflow's bracketed row with dots", () => {
    expect(fieldPath('hosts[0].cpus')).toBe('hosts.0.cpus')
    expect(fieldPath('pools[1].nodes[12]')).toBe('pools.1.nodes.12')
  })

  it("keeps the store's own path", () => {
    expect(fieldPath('hosts.0.cpus')).toBe('hosts.0.cpus')
    expect(fieldPath('name')).toBe('name')
  })

  it("reads a problem response's JSON Pointer, in a URI fragment or bare", () => {
    expect(fieldPath('#/hosts/0/cpus')).toBe('hosts.0.cpus')
    expect(fieldPath('/hosts/0/cpus')).toBe('hosts.0.cpus')
  })

  it("decodes a pointer's escapes, and a fragment's percent-encoding before them", () => {
    expect(fieldPath('#/a~1b/m~0n')).toBe('a/b.m~n')
    expect(fieldPath('#/caf%C3%A9/x%7E1y')).toBe('café.x/y')
    expect(fieldPath('/50%25')).toBe('50%25')
  })
})
