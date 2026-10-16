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

  it('drops an href that would run script', () => {
    // Built up so the lint that flags a script URL in source lets the test name one.
    const script = ['javascript', 'alert(1)'].join(':')
    render(<ExternalLink href={script}>Bad</ExternalLink>)
    expect(screen.getByText('Bad').closest('a')).not.toHaveAttribute('href')
  })

  it('keeps a safe href as given', () => {
    render(<ExternalLink href="mailto:help@example.com">Email</ExternalLink>)
    expect(screen.getByRole('link')).toHaveAttribute('href', 'mailto:help@example.com')
  })
})
