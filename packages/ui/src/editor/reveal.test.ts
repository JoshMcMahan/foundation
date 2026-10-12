import { describe, expect, it, vi } from 'vitest'
import { registerRevealer, revealLines } from './reveal'

describe('revealLines', () => {
  it('reaches the editor showing a path until it goes away', () => {
    const reveal = vi.fn()
    const unregister = registerRevealer('file:///workflow.yaml', reveal)
    revealLines('file:///workflow.yaml', 3, 7)
    expect(reveal).toHaveBeenCalledWith(3, 7)
    revealLines('file:///other.yaml', 1, 1)
    expect(reveal).toHaveBeenCalledTimes(1)
    unregister()
    revealLines('file:///workflow.yaml', 3, 7)
    expect(reveal).toHaveBeenCalledTimes(1)
  })
})
