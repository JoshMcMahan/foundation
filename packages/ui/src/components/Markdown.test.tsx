// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import Markdown from './Markdown'

// jsdom lacks it; streamdown's mermaid block waits for it before drawing.
global.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
} as unknown as typeof IntersectionObserver

// Both load lazily on first render; loading them up front keeps a busy test run within its timeout.
beforeAll(async () => {
  await Promise.all([import('./MarkdownImpl'), import('@streamdown/mermaid')])
}, 60_000)

afterEach(cleanup)

describe('Markdown mermaid', () => {
  const chart = '```mermaid\ngraph TD; A-->B;\n```'

  it('renders a mermaid fence as a diagram', async () => {
    const { container } = render(<Markdown>{chart}</Markdown>)
    await waitFor(() =>
      expect(container.querySelector('[data-streamdown="mermaid-block"]')).toBeInTheDocument(),
    )
  })
})

describe('Markdown httpsImagesOnly', () => {
  const images =
    '![https](https://example.com/a.png) ![http](http://example.com/b.png) ![root](/c.png) ![dot](./d.png)'
  const sources = (container: HTMLElement) =>
    [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))

  it('shows only images at an absolute https URL', async () => {
    const { container } = render(<Markdown httpsImagesOnly>{images}</Markdown>)
    await screen.findByText('[Image blocked: http]')
    expect(screen.getByText('[Image blocked: root]')).toBeInTheDocument()
    expect(screen.getByText('[Image blocked: dot]')).toBeInTheDocument()
    expect(sources(container)).toEqual(['https://example.com/a.png'])
  })

  it('leaves images alone by default', async () => {
    const { container } = render(<Markdown>{images}</Markdown>)
    await waitFor(() => expect(sources(container)).toContain('http://example.com/b.png'))
    expect(sources(container)).toContain('/c.png')
  })

  it('drops a picture source that is not https', async () => {
    const picture =
      '<picture><source srcset="http://example.com/x.png 2x"><img src="https://example.com/y.png" alt="y"></picture>'
    const { container } = render(<Markdown httpsImagesOnly>{picture}</Markdown>)
    await waitFor(() => expect(container.querySelector('picture source')).toBeInTheDocument())
    expect(container.querySelector('picture source')).not.toHaveAttribute('srcset')
  })

  it('checks every candidate of a srcset, on a picture source and on an image', async () => {
    const markup = [
      '<picture><source srcset="https://example.com/a.png 1x, /api/me 2x"><img src="https://example.com/y.png" alt="y"></picture>',
      '<picture><source srcset="https://example.com/a.png 1x, https://example.com/b.png 2x"><img src="https://example.com/z.png" alt="z"></picture>',
      '<img src="https://example.com/w.png" srcset="https://example.com/w.png 1x, http://example.com/w2.png 2x" alt="w">',
    ].join('\n\n')
    const { container } = render(<Markdown httpsImagesOnly>{markup}</Markdown>)
    await waitFor(() => expect(container.querySelectorAll('picture source')).toHaveLength(2))
    const [unsafe, safe] = container.querySelectorAll('picture source')
    expect(unsafe).not.toHaveAttribute('srcset')
    expect(safe).toHaveAttribute(
      'srcset',
      'https://example.com/a.png 1x, https://example.com/b.png 2x',
    )
    expect(container.querySelector('img[alt="w"]')).not.toHaveAttribute('srcset')
  })
})

describe('Markdown details', () => {
  it('renders a collapsible section with markdown inside it', async () => {
    const { container } = render(
      <Markdown>
        {'<details><summary>Failures</summary>\n\n**test_a** failed\n\n</details>'}
      </Markdown>,
    )
    await waitFor(() =>
      expect(container.querySelector('details > summary')).toHaveTextContent('Failures'),
    )
    expect(container.querySelector('details')).toHaveTextContent('test_a failed')
  })
})

describe('Markdown compact', () => {
  it('takes the compact type only when asked', async () => {
    const { container, rerender } = render(<Markdown compact>{'## Results'}</Markdown>)
    await screen.findByRole('heading', { name: 'Results' })
    expect(container.querySelector('.markdown')).toHaveClass('markdown-compact')
    rerender(<Markdown>{'## Results'}</Markdown>)
    expect(container.querySelector('.markdown')).not.toHaveClass('markdown-compact')
  })
})

describe('Markdown tildes', () => {
  it('leaves single tildes as text and strikes double ones', async () => {
    const { container } = render(
      <Markdown>
        {'Test clusters (~$1.50/day each), plus snapshots (~$0.40/day). ~~Gone~~ for good.'}
      </Markdown>,
    )
    await screen.findByText('Gone')
    expect(container.querySelectorAll('del')).toHaveLength(1)
    expect(container.querySelector('del')).toHaveTextContent('Gone')
    expect(container).toHaveTextContent(
      'Test clusters (~$1.50/day each), plus snapshots (~$0.40/day).',
    )
  })
})
