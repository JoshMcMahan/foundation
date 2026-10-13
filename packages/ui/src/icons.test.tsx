// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { GitHubIcon } from './brandIcons'
import { PinFilledIcon, TrashIcon } from './icons'

describe('icons', () => {
  it('take the text size and hide from assistive technology by default', () => {
    const { container } = render(<TrashIcon className="text-red-600" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '1em')
    expect(svg).toHaveAttribute('height', '1em')
    expect(svg).toHaveAttribute('stroke-width', '2')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveClass('text-red-600')
  })

  it('are named by a title', () => {
    render(<TrashIcon title="Deleted" />)
    expect(screen.getByRole('img', { name: 'Deleted' })).not.toHaveAttribute('aria-hidden')
  })

  it('are named by an aria-label', () => {
    render(<TrashIcon aria-label="Deleted" />)
    expect(screen.getByRole('img', { name: 'Deleted' })).toBeInTheDocument()
  })

  it('fill a glyph that marks a state', () => {
    const { container } = render(<PinFilledIcon />)
    expect(container.querySelector('svg')).toHaveAttribute('fill', 'currentColor')
  })

  it('take a size', () => {
    const { container } = render(<TrashIcon size={24} />)
    expect(container.querySelector('svg')).toHaveAttribute('width', '24')
  })
})

describe('brand icons', () => {
  it('fill with the text colour at the text size, hidden by default', () => {
    const { container } = render(<GitHubIcon strokeWidth={3} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '1em')
    expect(svg).toHaveAttribute('fill', 'currentColor')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    // A logo is filled, so stroke settings for outline icons don't reach it.
    expect(svg).not.toHaveAttribute('stroke-width')
  })

  it('are named by a title', () => {
    render(<GitHubIcon title="Hosted on GitHub" />)
    expect(screen.getByRole('img', { name: 'Hosted on GitHub' })).toBeInTheDocument()
  })
})
