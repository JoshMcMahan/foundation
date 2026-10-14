import { cx } from './cx'

describe('cx', () => {
  it('lets a later utility replace one it conflicts with', () => {
    expect(cx('w-full min-w-0', 'w-20')).toBe('min-w-0 w-20')
    expect(cx('bg-(--theme-input-bg)', 'bg-(--theme-panel-bg)')).toBe('bg-(--theme-panel-bg)')
  })

  it('keeps a theme color beside a size or width of the same kind', () => {
    expect(cx('text-xs', 'text-(--theme-muted-text-color)')).toBe(
      'text-xs text-(--theme-muted-text-color)',
    )
    expect(cx('border', 'border-(--theme-border)')).toBe('border border-(--theme-border)')
    expect(cx('ring-1', 'ring-(--theme-focus)')).toBe('ring-1 ring-(--theme-focus)')
  })

  it('drops falsy parts as clsx does', () => {
    expect(cx('a', false, undefined, { b: true, c: false })).toBe('a b')
  })
})
