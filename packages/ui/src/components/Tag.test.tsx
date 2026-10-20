// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { normalizeTags, Tag, TagList } from './Tag'

describe('Tag', () => {
  it('shows a color dot, hidden from screen readers', () => {
    const { container } = render(<Tag color="#e5484d">bug</Tag>)
    expect(container.querySelector('[aria-hidden="true"]')).toHaveStyle({ background: '#e5484d' })
    expect(screen.getByText('bug')).toBeInTheDocument()
  })

  it('removes itself with a button named for it', () => {
    const onRemove = vi.fn()
    render(<Tag onRemove={onRemove}>gpu</Tag>)
    fireEvent.click(screen.getByRole('button', { name: 'Remove gpu' }))
    expect(onRemove).toHaveBeenCalledOnce()
  })

  it('is a link with href', () => {
    render(<Tag href="/issues?label=bug">bug</Tag>)
    expect(screen.getByRole('link', { name: 'bug' })).toHaveAttribute('href', '/issues?label=bug')
  })

  it('takes capitals only when asked', () => {
    const { rerender } = render(<Tag>us-east</Tag>)
    expect(screen.getByText('us-east').parentElement).not.toHaveClass('uppercase')
    rerender(<Tag caps>us-east</Tag>)
    expect(screen.getByText('us-east').parentElement).toHaveClass('uppercase')
  })
})

describe('TagList', () => {
  it('lists its tags', () => {
    render(<TagList tags={['gpu', { key: 'b', label: 'bug', color: 'red' }]} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('folds the tags past max into a +N button that names them', () => {
    render(<TagList tags={['a', 'b', 'c', 'd']} max={2} />)
    expect(screen.getByRole('button', { name: '2 more: c, d' })).toHaveTextContent('+2')
    expect(screen.queryByText('c')).toBeNull()
  })

  it('removes a tag by its key', () => {
    const onRemove = vi.fn()
    render(<TagList tags={[{ key: 'k1', label: 'gpu' }]} onRemove={onRemove} />)
    fireEvent.click(screen.getByRole('button', { name: 'Remove gpu' }))
    expect(onRemove).toHaveBeenCalledWith('k1')
  })
})

describe('normalizeTags', () => {
  it('takes an array or a comma list, trimmed, each once', () => {
    expect(normalizeTags([' gpu', 'gpu', '', 'a100'])).toEqual(['gpu', 'a100'])
    expect(normalizeTags('gpu, a100 ,')).toEqual(['gpu', 'a100'])
    expect(normalizeTags(null)).toEqual([])
    expect(normalizeTags({ a: 1 })).toEqual([])
  })
})
