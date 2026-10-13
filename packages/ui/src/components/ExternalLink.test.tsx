// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { ExternalLink } from './ExternalLink'
import { UIProvider } from './Provider'

describe('ExternalLink', () => {
  it('opens a new tab without handing it this page, and says so', () => {
    render(<ExternalLink href="https://example.com">Docs</ExternalLink>)
    const link = screen.getByRole('link', { name: /^Docs/ })
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveTextContent('(opens in a new tab)')
  })

  it('announces the new tab in the host’s words', () => {
    render(
      <UIProvider strings={{ common: { opensInNewTab: '(nueva pestaña)' } }}>
        <ExternalLink href="https://example.com">Docs</ExternalLink>
      </UIProvider>,
    )
    expect(screen.getByRole('link')).toHaveTextContent('(nueva pestaña)')
  })

  it('shows an arrow when asked, hidden from screen readers', () => {
    const { container } = render(
      <ExternalLink href="https://example.com" icon>
        Docs
      </ExternalLink>,
    )
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })
})
