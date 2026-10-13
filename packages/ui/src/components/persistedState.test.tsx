// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { useLocalPersistedState } from './persistedState'

beforeEach(() => window.localStorage.clear())

describe('useLocalPersistedState', () => {
  it('starts from the default, and stores what is set as JSON', () => {
    const { result } = renderHook(() => useLocalPersistedState('width', 300))
    expect(result.current[0]).toBe(300)
    act(() => result.current[1]((prev) => prev + 16))
    expect(result.current[0]).toBe(316)
    expect(window.localStorage.getItem('width')).toBe('316')
  })

  it('keeps every reader of a key in step', () => {
    const first = renderHook(() => useLocalPersistedState('terms', ['a']))
    const second = renderHook(() => useLocalPersistedState('terms', ['a']))
    act(() => first.result.current[1](['a', 'b']))
    expect(second.result.current[0]).toEqual(['a', 'b'])
    // The value keeps its identity while the stored text doesn't change.
    const before = second.result.current[0]
    second.rerender()
    expect(second.result.current[0]).toBe(before)
  })

  it('falls back to the default for a value it cannot read', () => {
    window.localStorage.setItem('style', 'not json')
    const { result } = renderHook(() => useLocalPersistedState('style', 'quicklook'))
    expect(result.current[0]).toBe('quicklook')
  })

  it('hears another tab’s write', () => {
    const { result } = renderHook(() => useLocalPersistedState('style', 'quicklook'))
    window.localStorage.setItem('style', JSON.stringify('full'))
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: 'style' }))
    })
    expect(result.current[0]).toBe('full')
  })

  it('keeps a value for the page when storage refuses it', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    const { result } = renderHook(() => useLocalPersistedState('big', 'small'))
    act(() => result.current[1]('large'))
    expect(result.current[0]).toBe('large')
    setItem.mockRestore()
  })
})
