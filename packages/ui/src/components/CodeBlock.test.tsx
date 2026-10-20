// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CodeBlock } from './CodeBlock'
import Markdown from './Markdown'
import { UIProvider } from './Provider'

// Loading the highlighter and renderer once up front keeps a busy run within its timeout.
beforeAll(async () => {
  await Promise.all([import('./codeHighlight'), import('./MarkdownImpl')])
}, 60_000)

const YAML = 'jobs:\n  build:\n    steps:\n      - run: make\n'

const lines = (container: HTMLElement) => [...container.querySelectorAll('code > span')]

describe('CodeBlock', () => {
  it('names the language on its header and numbers several lines', () => {
    const { container } = render(<CodeBlock code={YAML} language="yaml" />)
    expect(screen.getByText('yaml')).toBeInTheDocument()
    // The final newline ends the last line rather than adding an empty one.
    expect(lines(container)).toHaveLength(4)
    expect(lines(container)[0]?.className).toContain('counter-increment')
    expect(container.querySelector('code')).toHaveStyle({ counterReset: 'line 0' })
  })

  it('leaves one line unnumbered unless asked, and starts where told', () => {
    const { container, rerender } = render(<CodeBlock code="make test" />)
    expect(lines(container)[0]?.className).not.toContain('counter-increment')
    rerender(<CodeBlock code={YAML} startLine={10} />)
    expect(container.querySelector('code')).toHaveStyle({ counterReset: 'line 9' })
    rerender(<CodeBlock code={YAML} lineNumbers={false} />)
    expect(lines(container)[0]?.className).not.toContain('counter-increment')
  })

  it('takes a title of its own in place of the language', () => {
    render(<CodeBlock code={YAML} language="yaml" title="Resolved YAML" />)
    expect(screen.getByText('Resolved YAML')).toBeInTheDocument()
    expect(screen.queryByText('yaml')).toBeNull()
  })

  it('highlights in the theme code colors once the highlighter loads', async () => {
    const { container } = render(<CodeBlock code={YAML} language="yaml" />)
    await waitFor(() =>
      expect(container.querySelector('code span[style*="--theme-code-"]')).not.toBeNull(),
    )
    expect(container.querySelector('code')?.textContent).toBe(YAML.slice(0, -1).replace(/\n/g, ''))
  })

  it('copies the code and says so in the shared strings', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(
      <UIProvider strings={{ common: { copy: 'Kopieren', copied: 'Kopiert' } }}>
        <CodeBlock code={YAML} language="yaml" />
      </UIProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Kopieren' }))
    await screen.findByRole('button', { name: 'Kopiert' })
    expect(writeText).toHaveBeenCalledWith(YAML)
  })

  it('downloads only with a filename, under that name', () => {
    const { rerender } = render(<CodeBlock code={YAML} />)
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
    rerender(<CodeBlock code={YAML} filename="build.yaml" />)
    const created = vi.fn(() => 'blob:code')
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('build.yaml')
    })
    fireEvent.click(screen.getByRole('button', { name: 'Download' }))
    expect(click).toHaveBeenCalledOnce()
    expect(created).toHaveBeenCalledOnce()
    click.mockRestore()
  })

  it('puts the host controls on the header and can drop copy', () => {
    render(
      <CodeBlock code={YAML} copy={false} headerActions={<button type="button">Edit</button>} />,
    )
    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Copy' })).toBeNull()
  })

  it('caps its height without fill, and fills its container with it', () => {
    const { container, rerender } = render(<CodeBlock code={YAML} maxHeight={240} />)
    const body = () => container.querySelector('[dir="ltr"]') as HTMLElement
    expect(body()).toHaveStyle({ maxHeight: '240px' })
    rerender(<CodeBlock code={YAML} maxHeight="20rem" fill />)
    expect(body().style.maxHeight).toBe('')
    expect(body()).toHaveClass('flex-1')
    expect(container.firstElementChild).toHaveClass('h-full')
  })

  it('breaks long lines only with wrap', () => {
    const { container, rerender } = render(<CodeBlock code="a very long line" />)
    const content = () => container.querySelector('code > span > span') as HTMLElement
    expect(content()).toHaveClass('whitespace-pre')
    rerender(<CodeBlock code="a very long line" wrap />)
    expect(content()).toHaveClass('whitespace-pre-wrap')
  })
})

describe('Markdown fenced code', () => {
  it('renders as a CodeBlock with the fence language, copy and download', async () => {
    const { container } = render(<Markdown>{'```yaml\njobs: {}\n```'}</Markdown>)
    await waitFor(() => expect(container.querySelector('[data-code-block]')).not.toBeNull())
    expect(screen.getByText('yaml')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Download' })).toBeInTheDocument()
  })

  it('follows the code controls and the fence meta', async () => {
    const { container } = render(
      <Markdown controls={{ code: { copy: true, download: false } }}>
        {'```js startLine=7\nconst a = 1\nconst b = 2\n```'}
      </Markdown>,
    )
    await waitFor(() => expect(container.querySelector('[data-code-block]')).not.toBeNull())
    expect(screen.queryByRole('button', { name: 'Download' })).toBeNull()
    expect(container.querySelector('code[style]')).toHaveStyle({ counterReset: 'line 6' })
  })

  it('leaves inline code alone', async () => {
    const { container } = render(<Markdown>{'Run `make`.'}</Markdown>)
    await waitFor(() =>
      expect(container.querySelector('[data-streamdown="inline-code"]')).not.toBeNull(),
    )
    expect(container.querySelector('[data-code-block]')).toBeNull()
  })
})
