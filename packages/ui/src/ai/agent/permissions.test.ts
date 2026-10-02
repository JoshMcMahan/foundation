import { describe, expect, it } from 'vitest'
import { clampPermissionMode, isNamedPermissionMode, permissionModesUpTo } from './permissions'

describe('permissionModesUpTo', () => {
  it('offers every requestable mode up to the ceiling', () => {
    expect(permissionModesUpTo('bypass-permissions')).toEqual([
      'read-only',
      'accept-edits',
      'bypass-permissions',
    ])
    expect(permissionModesUpTo('read-only')).toEqual(['read-only'])
  })

  // Plan sits between read-only and accept-edits but is never requested.
  it('never offers plan, even as the ceiling', () => {
    expect(permissionModesUpTo('plan')).toEqual(['read-only'])
  })

  it('falls back to the default ceiling for an unknown or missing one', () => {
    expect(permissionModesUpTo(undefined)).toEqual(['read-only', 'accept-edits'])
    expect(permissionModesUpTo('')).toEqual(['read-only', 'accept-edits'])
  })
})

describe('clampPermissionMode', () => {
  it('keeps a mode the ceiling allows', () => {
    expect(clampPermissionMode('accept-edits', 'accept-edits')).toBe('accept-edits')
  })

  it('lowers a mode above the ceiling to the highest offered', () => {
    expect(clampPermissionMode('bypass-permissions', 'accept-edits')).toBe('accept-edits')
    expect(clampPermissionMode('accept-edits', 'read-only')).toBe('read-only')
  })
})

describe('isNamedPermissionMode', () => {
  it('names the modes a session can report', () => {
    expect(isNamedPermissionMode('plan')).toBe(true)
    expect(isNamedPermissionMode('yolo')).toBe(false)
    expect(isNamedPermissionMode(undefined)).toBe(false)
  })
})
