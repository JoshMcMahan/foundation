// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { EmptyState } from './EmptyState'
import { ErrorPage, errorPageKind } from './ErrorPage'
import { ErrorText } from './Field'
import { Loader } from './Loader'
import { UIProvider } from './Provider'

function withHistory(canGoBack: boolean, goBack = vi.fn()) {
  return ({ children }: { children: ReactNode }) => (
    <UIProvider navigation={{ canGoBack: () => canGoBack, goBack }}>{children}</UIProvider>
  )
}

describe('ErrorPage', () => {
  it('names a status in words and keeps the large code from screen readers', () => {
    render(<ErrorPage status={404} />, { wrapper: withHistory(false) })
    expect(
      screen.getByRole('heading', { level: 1, name: 'Could not find the requested page' }),
    ).toBeVisible()
    expect(
      screen.getByText('This page does not exist, or you do not have access to it.'),
    ).toBeVisible()
    expect(screen.getByText('404')).toHaveAttribute('aria-hidden', 'true')
  })

  it.each([
    [401, 'unauthenticated'],
    [403, 'forbidden'],
    [404, 'notFound'],
    [502, 'unavailable'],
    [503, 'unavailable'],
    [504, 'unavailable'],
    [500, 'server'],
    ['500', 'server'],
    [418, undefined],
    [undefined, undefined],
  ] as const)('reads %s as %s', (status, kind) => {
    expect(errorPageKind(status)).toBe(kind)
  })

  it('titles a status with no words of its own by its number', () => {
    render(<ErrorPage status={418} />, { wrapper: withHistory(false) })
    expect(screen.getByRole('heading', { name: 'Error 418' })).toBeVisible()
  })

  it('heads the page with a message given alone', () => {
    render(<ErrorPage description="The cluster is gone." />, { wrapper: withHistory(false) })
    expect(screen.getByRole('heading', { name: 'The cluster is gone.' })).toBeVisible()
    expect(screen.getAllByText('The cluster is gone.')).toHaveLength(1)
  })

  it('takes the network kind without a status', () => {
    render(<ErrorPage kind="network" />, { wrapper: withHistory(false) })
    expect(screen.getByRole('heading', { name: 'You’re offline' })).toBeVisible()
  })

  it('goes back through the history when there is some', () => {
    const goBack = vi.fn()
    render(<ErrorPage status={500} />, { wrapper: withHistory(true, goBack) })
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(goBack).toHaveBeenCalledOnce()
  })

  it('goes home when there is no history', () => {
    render(<ErrorPage status={500} />, { wrapper: withHistory(false) })
    expect(screen.getByRole('link', { name: 'Back to home' })).toHaveAttribute('href', '/')
  })

  it('goes where the host says, with its words, after its own actions', () => {
    render(
      <ErrorPage
        status={401}
        back={{ href: '/sessions', label: 'Back to sessions' }}
        actions={<a href="/login">Sign in</a>}
      />,
      { wrapper: withHistory(true) },
    )
    const links = screen.getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['Sign in', 'Back to sessions'])
    expect(links[1]).toHaveAttribute('href', '/sessions')
  })

  it('offers no way back when told not to', () => {
    render(<ErrorPage status={404} back={false} />, { wrapper: withHistory(true) })
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('heads a card or an inline error one level down, and draws no backdrop inline', () => {
    const { container, rerender } = render(<ErrorPage status={404} layout="card" />, {
      wrapper: withHistory(false),
    })
    expect(screen.getByRole('heading', { level: 2 })).toBeVisible()
    expect(container.querySelector('.error-page-glow')).not.toBeNull()
    rerender(<ErrorPage status={404} layout="inline" headingLevel={3} />)
    expect(screen.getByRole('heading', { level: 3 })).toBeVisible()
    expect(container.querySelector('.error-page-glow')).toBeNull()
  })

  it('takes its words from the host', () => {
    render(
      <UIProvider
        strings={{ errorPage: { titles: { notFound: 'Introuvable' }, home: 'Accueil' } }}
        navigation={{ canGoBack: () => false }}
      >
        <ErrorPage status={404} />
      </UIProvider>,
    )
    expect(screen.getByRole('heading', { name: 'Introuvable' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'Accueil' })).toBeVisible()
  })
})

describe('EmptyState', () => {
  it('makes its title a heading at the level given, and a paragraph otherwise', () => {
    const { rerender } = render(<EmptyState variant="plain" title="No buckets" headingLevel={2} />)
    expect(screen.getByRole('heading', { level: 2, name: 'No buckets' })).toBeVisible()
    rerender(<EmptyState variant="dashed" title="No buckets" />)
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.getByText('No buckets').tagName).toBe('P')
  })

  it('keeps its icon from screen readers', () => {
    render(<EmptyState title="No buckets" icon={<svg data-testid="glyph" />} />)
    expect(screen.getByTestId('glyph').parentElement).toHaveAttribute('aria-hidden', 'true')
  })
})

describe('ErrorText', () => {
  it('is announced, and sits in a line of text when inline', () => {
    render(
      <p>
        Saving failed:{' '}
        <ErrorText inline size="md" className="ml-1">
          Name taken
        </ErrorText>
      </p>,
    )
    const error = screen.getByRole('alert')
    expect(error.tagName).toBe('SPAN')
    // Text, not a flex box, so it sits on the sentence's baseline in the sentence's size.
    expect(error).toHaveClass('ml-1')
    expect(error).not.toHaveClass('inline-flex')
    expect(error).not.toHaveClass('text-sm')
  })

  it('renders nothing without an error', () => {
    const { container } = render(<ErrorText>{undefined}</ErrorText>)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('Loader fill', () => {
  it('centers in the page at 40px, and in the window at 48px', () => {
    const { rerender } = render(<Loader fill="page" />)
    const status = screen.getByRole('status')
    expect(status.parentElement).toHaveClass('h-dvh', 'max-h-full')
    expect(status.querySelector('svg')).toHaveStyle({ fontSize: '40px' })
    rerender(<Loader fill="screen" />)
    expect(screen.getByRole('status').parentElement).toHaveClass('min-h-dvh')
    expect(screen.getByRole('status').querySelector('svg')).toHaveStyle({ fontSize: '48px' })
    rerender(<Loader fill="section" size={24} />)
    expect(screen.getByRole('status').querySelector('svg')).toHaveStyle({ fontSize: '24px' })
  })
})
