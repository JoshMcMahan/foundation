// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SplitView } from './SplitView'

const panes = [
  { value: 'text', label: 'Text', content: <p>the text</p> },
  { value: 'preview', label: 'Preview', content: <p>the preview</p> },
  { value: 'form', label: 'Form', content: <p>the form</p> },
] as const

const setWidth = (width: number) =>
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width,
  } as DOMRect)

afterEach(() => vi.restoreAllMocks())

describe('SplitView', () => {
  it('shows one pane at a time where two don’t fit, keeping the others mounted', () => {
    setWidth(390)
    const onValueChange = vi.fn()
    render(<SplitView label="Views" panes={[...panes]} onValueChange={onValueChange} />)
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Text',
      'Preview',
      'Form',
    ])
    expect(screen.queryByRole('separator')).toBeNull()
    expect(screen.getByText('the preview').closest('section')).toHaveClass('hidden')

    fireEvent.click(screen.getByRole('tab', { name: 'Preview' }))
    expect(onValueChange).toHaveBeenCalledWith('preview')
    expect(screen.getByText('the preview').closest('section')).not.toHaveClass('hidden')
    expect(screen.getByText('the text').closest('section')).toHaveClass('hidden')
  })

  it('shows the start pane beside the one picked where two fit, with a handle between', () => {
    setWidth(1200)
    render(<SplitView label="Views" panes={[...panes]} defaultValue="form" />)
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Preview', 'Form'])
    expect(screen.getByRole('separator')).toBeInTheDocument()
    expect(screen.getByText('the text').closest('section')).not.toHaveClass('hidden')
    expect(screen.getByText('the form').closest('section')).not.toHaveClass('hidden')
    expect(screen.getByText('the preview').closest('section')).toHaveClass('hidden')
  })
})
