// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import Markdown from './Markdown'
import { withoutUnfinishedTable } from './MarkdownImpl'

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

  it('keeps an existing code block mounted when a diagram arrives', async () => {
    const code = '```javascript\nconst value = 1\n```'
    const { container, rerender } = render(<Markdown>{code}</Markdown>)
    await waitFor(() => expect(container.querySelector('[data-code-block]')).not.toBeNull())
    const block = container.querySelector('[data-code-block]')

    rerender(<Markdown>{`${code}\n\n${chart}`}</Markdown>)
    await waitFor(() =>
      expect(container.querySelector('[data-streamdown="mermaid-block"]')).toBeInTheDocument(),
    )
    expect(container.querySelector('[data-code-block]')).toBe(block)
  })
})

describe('Markdown renderer identity', () => {
  it('preserves code scrolling and link focus when controls change', async () => {
    const text = '[Documentation](https://example.com/docs)\n\n```javascript\nconst value = 1\n```'
    const { container, rerender } = render(<Markdown>{text}</Markdown>)
    const link = await screen.findByRole('link', { name: /Documentation/ })
    await waitFor(() => expect(container.querySelector('[data-code-block]')).not.toBeNull())
    const block = container.querySelector('[data-code-block]')!
    const scroll = block.querySelector('pre')!.parentElement!
    scroll.scrollTop = 120
    link.focus()

    rerender(<Markdown controls={false}>{text}</Markdown>)

    expect(container.querySelector('[data-code-block]')).toBe(block)
    expect(block.querySelector('pre')!.parentElement).toBe(scroll)
    expect(scroll.scrollTop).toBe(120)
    expect(screen.getByRole('link', { name: /Documentation/ })).toBe(link)
    expect(link).toHaveFocus()
  })
})

describe('Markdown code line numbers', () => {
  it.each([
    ['', 1],
    ['startLine=0', 1],
    ['startLine=7', 7],
    ['startLine=invalid', 1],
  ] as const)('starts a fence with metadata %j at line %i', async (metadata, first) => {
    const { container } = render(
      <Markdown>{`\`\`\`javascript ${metadata}\nconst value = 1\nconst next = 2\n\`\`\``}</Markdown>,
    )
    await waitFor(() => expect(container.querySelector('[data-code-block] code')).not.toBeNull())
    expect(container.querySelector('[data-code-block] code')).toHaveStyle({
      counterReset: `line ${first - 1}`,
    })
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

describe('withoutUnfinishedTable', () => {
  it('holds back a table until its delimiter row arrives', () => {
    expect(withoutUnfinishedTable('Spend:\n\n| Allocation | Spen')).toBe('Spend:\n')
    expect(withoutUnfinishedTable('Spend:\n\n| Allocation | Spend |\n| --')).toBe('Spend:\n')
  })

  it('shows a table once its delimiter row is in', () => {
    const text = 'Spend:\n\n| Allocation | Spend |\n| --- | --- |\n| AWS | $1'
    expect(withoutUnfinishedTable(text)).toBe(text)
  })

  it('leaves pipes inside an open code block alone', () => {
    const text = '```sh\nls | grep x'
    expect(withoutUnfinishedTable(text)).toBe(text)
  })

  it('leaves text without a trailing table alone', () => {
    expect(withoutUnfinishedTable('a | b in a sentence')).toBe('a | b in a sentence')
  })
})
