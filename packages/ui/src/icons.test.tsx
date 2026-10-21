// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { GitHubIcon } from './brandIcons'
import type { IconType } from './icons'
import * as allIcons from './icons'
import {
  PendingRingIcon,
  PinFilledIcon,
  RunningRingIcon,
  SuccessFilledIcon,
  TrashIcon,
} from './icons'

const icons = allIcons as unknown as Record<string, IconType>

describe('icons', () => {
  it('take the text size and hide from assistive technology by default', () => {
    const { container } = render(<TrashIcon className="text-red-600" />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('width', '1em')
    expect(svg).toHaveAttribute('height', '1em')
    expect(svg).toHaveAttribute('stroke-width', '1.5')
    expect(svg).toHaveAttribute('aria-hidden', 'true')
    expect(svg).toHaveClass('text-red-600')
  })

  it('take a stroke width on their 16px grid', () => {
    const { container } = render(<TrashIcon strokeWidth={2} />)
    const svg = container.querySelector('svg')
    expect(svg).toHaveAttribute('viewBox', '0 0 16 16')
    expect(svg).toHaveAttribute('stroke-width', '2')
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

  it('are all drawn as one path on one grid at one weight, but for status icons', () => {
    for (const [name, Icon] of Object.entries(icons)) {
      if (!name.endsWith('Icon')) continue
      const { container, unmount } = render(<Icon />)
      const svg = container.querySelector('svg')
      expect(svg, name).toHaveAttribute('viewBox', '0 0 16 16')
      expect(svg, name).toHaveAttribute('stroke-width', '1.5')
      // A status icon is a solid shape with a mark cut out, or a ring with parts that move.
      const status = svg?.getAttribute('data-status-icon')
      if (status === 'filled') {
        expect(svg?.querySelectorAll(':scope > path'), name).toHaveLength(1)
        expect(svg?.querySelector(':scope > path'), name).toHaveAttribute('fill', 'currentColor')
        expect(svg?.querySelector('mask path'), name).toHaveAttribute('stroke', '#000')
      } else if (status === 'ring') {
        expect(svg?.querySelector('circle'), name).toBeInTheDocument()
      } else {
        expect(svg?.querySelectorAll('path'), name).toHaveLength(1)
      }
      unmount()
    }
  })

  it('cut a status mark out through a mask of its own, so it shows any surface behind it', () => {
    const { container } = render(
      <>
        <SuccessFilledIcon />
        <SuccessFilledIcon />
      </>,
    )
    const masks = [...container.querySelectorAll('mask')].map((m) => m.id)
    expect(new Set(masks).size).toBe(2)
    const shapes = [...container.querySelectorAll('svg > path')]
    expect(shapes.map((p) => p.getAttribute('mask'))).toEqual(masks.map((id) => `url(#${id})`))
    // The mark is cut, never painted in a surface's color.
    expect(container.querySelector('svg > path')).toHaveAttribute('stroke', 'none')
  })

  it('turn a running ring and breathe its dot, still for reduced motion', () => {
    const { container } = render(<RunningRingIcon />)
    expect(container.querySelector('path')?.getAttribute('class')).toContain('motion-safe:animate-')
    expect(container.querySelector('circle[r="2.6"]')?.getAttribute('class')).toBe(
      'motion-safe:animate-pulse',
    )
  })

  it('dash a pending ring', () => {
    const { container } = render(<PendingRingIcon />)
    expect(container.querySelector('svg')).toHaveAttribute('stroke-dasharray', '2.2 2.5124')
  })

  it('give each meaning its own drawing', () => {
    // Close and Remove share the X by convention; a filled twin marks a state.
    const shared = new Set(['CloseIcon', 'RemoveIcon'])
    const seen = new Map<string, string>()
    for (const [name, Icon] of Object.entries(icons)) {
      if (!name.endsWith('Icon') || shared.has(name)) continue
      const { container, unmount } = render(<Icon />)
      const svg = container.querySelector('svg')
      const key = `${svg?.getAttribute('fill')} ${svg?.getAttribute('stroke-dasharray')} ${svg?.querySelector('path')?.getAttribute('d')}`
      const other = seen.get(key)
      // A deprecated name is the same icon, not a second meaning.
      if (other && icons[other] !== Icon) expect.fail(`${name} is drawn the same as ${other}`)
      seen.set(key, name)
      unmount()
    }
  })

  it('take a size', () => {
    const { container } = render(<TrashIcon size={24} />)
    expect(container.querySelector('svg')).toHaveAttribute('width', '24')
  })
})

describe('brand icons', () => {
  it('fill with the text color at the text size, hidden by default', () => {
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
