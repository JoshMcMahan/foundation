// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { useCssIsDark } from './useCssIsDark'

test('every reader follows the root’s color-scheme through one observer', async () => {
  const observe = vi.spyOn(MutationObserver.prototype, 'observe')
  const a = renderHook(() => useCssIsDark())
  const b = renderHook(() => useCssIsDark())
  expect(a.result.current).toBe(false)
  expect(observe).toHaveBeenCalledTimes(1)

  act(() => {
    document.documentElement.style.colorScheme = 'dark'
  })
  await waitFor(() => expect(a.result.current).toBe(true))
  expect(b.result.current).toBe(true)

  a.unmount()
  b.unmount()
  document.documentElement.style.colorScheme = ''
  observe.mockRestore()
})
