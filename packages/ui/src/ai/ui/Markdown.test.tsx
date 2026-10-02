// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { ChatConfigProvider, resolveChatConfig } from '../core/config'
import Markdown from './Markdown'

describe('Markdown host component overrides', () => {
  it('renders the built-in safe link without any config', () => {
    render(<Markdown>[docs](https://example.com)</Markdown>)
    const link = screen.getByRole('link', { name: 'docs' })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('lets the host override a tag via config.markdownComponents', () => {
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
    expect(screen.getByTestId('embed-frame')).toHaveAttribute('src', '/?embed=abc')
  })
})

describe('mermaid fences', () => {
  it('renders a mermaid fence without crashing and lazy-loads the plugin', async () => {
    const { container } = render(<Markdown>{'```mermaid\ngraph TD; A-->B;\n```'}</Markdown>)
    expect(container.firstChild).toBeTruthy()
    // The dynamic plugin import settles without breaking the render.
    await waitFor(() => expect(container.firstChild).toBeTruthy())
  })
})
