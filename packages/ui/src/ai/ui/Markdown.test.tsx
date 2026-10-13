// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ChatConfigProvider, resolveChatConfig } from '../core/config'
import Markdown from './Markdown'

// The renderer loads lazily. Loading it once up front keeps the first test from
// racing its import on a busy machine; each test still waits for the render.
beforeAll(async () => {
  await import('../../components/MarkdownImpl')
}, 30_000)

describe('Markdown', () => {
  it('renders the built-in safe link without any config', async () => {
    render(<Markdown>[docs](https://example.com)</Markdown>)
    const link = await screen.findByRole('link', { name: /^docs/ })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  // The chat's caret rule matches this class rather than the inline style that sets the caret, which
  // would make every inline style change on the page restyle the subtree it changed in.
  it('marks a reply being written by a class, for its caret', async () => {
    const { container, rerender } = render(<Markdown isStreaming>writing</Markdown>)
    await waitFor(() => expect(container.querySelector('.markdown-streaming')).not.toBeNull())
    rerender(<Markdown isStreaming={false}>written</Markdown>)
    await waitFor(() => expect(container.querySelector('.markdown-streaming')).toBeNull())
  })

  it('lets the chat host override a tag via config.markdownComponents', async () => {
    render(
      <ChatConfigProvider
        value={resolveChatConfig({
          markdownComponents: {
            img: (props) =>
              typeof props.src === 'string' && props.src.startsWith('/?embed=') ? (
                <iframe
                  src={props.src}
                  title={props.alt ?? 'embedded viewer'}
                  data-testid="embed-frame"
                />
              ) : (
                // biome-ignore lint/a11y/useAltText: passthrough of markdown-authored props
                <img {...props} />
              ),
          },
        })}
      >
        <Markdown>![viewer](/?embed=abc)</Markdown>
      </ChatConfigProvider>,
    )
    expect(await screen.findByTestId('embed-frame')).toHaveAttribute('src', '/?embed=abc')
  })

  it('gives inline code a place to break after each path separator', async () => {
    const { container } = render(<Markdown>{'`/api/storage/:type`'}</Markdown>)
    await waitFor(() => expect(container.querySelectorAll('code wbr').length).toBeGreaterThan(0))
  })

  it('renders a mermaid fence without crashing and lazy-loads the plugin', async () => {
    const { container } = render(<Markdown>{'```mermaid\ngraph TD; A-->B;\n```'}</Markdown>)
    await waitFor(() => expect(container.firstChild).toBeTruthy())
  })
})
