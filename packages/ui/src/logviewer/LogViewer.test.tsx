// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { LogViewer } from './index'

vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  URL.createObjectURL = vi.fn(() => 'blob:log')
  URL.revokeObjectURL = vi.fn()
  Element.prototype.scroll = vi.fn()
})

const IMG_PAYLOAD = '<img src=x onerror=alert(1)>'

function renderLog(log: string, enableWorkflowCommands = false) {
  return render(
    <LogViewer log={log} width="100%" inline enableWorkflowCommands={enableWorkflowCommands} />,
  )
}

function filterFor(term: string) {
  fireEvent.change(screen.getByPlaceholderText('Filter logs'), {
    target: { value: term },
  })
}

describe('LogViewer log text is never treated as markup', () => {
  it('renders an HTML payload as text with no filter applied', () => {
    const { container } = renderLog(`boom ${IMG_PAYLOAD} done`)

    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain(IMG_PAYLOAD)
  })

  it('renders an HTML payload as text while a matching filter is active', () => {
    const { container } = renderLog(`boom ${IMG_PAYLOAD} done`)

    filterFor('boom')

    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain(IMG_PAYLOAD)
    expect(container.querySelector('mark.search-highlight')).not.toBeNull()
  })

  it('keeps escaped entities literal instead of decoding them into elements', () => {
    const { container } = renderLog('value &lt;b&gt;bold&lt;/b&gt; end')

    filterFor('value')

    expect(container.querySelector('b')).toBeNull()
    expect(container.textContent).toContain('&lt;b&gt;bold&lt;/b&gt;')
  })

  it('renders a workflow command message as text while filtering', () => {
    const { container } = renderLog(`::error::${IMG_PAYLOAD} bad`, true)

    filterFor('bad')

    expect(container.querySelector('img')).toBeNull()
    expect(container.textContent).toContain(IMG_PAYLOAD)
  })

  it('does not let a script payload become a script element', () => {
    const { container } = renderLog('pre <script>alert(1)</script> post')

    filterFor('pre')

    expect(container.querySelector('script')).toBeNull()
    expect(container.textContent).toContain('<script>alert(1)</script>')
  })
})

const GROUP_LOG = [
  '::group::Install dependencies',
  'pnpm install --frozen-lockfile',
  '::endgroup::',
  'Running test suite',
].join('\n')

function lineNumber(container: HTMLElement, line: number) {
  const button = container.querySelector(`[data-line-number="${line}"] > button`)
  if (!button) {
    throw new Error(`no line number for line ${line}`)
  }
  return button
}

describe('LogViewer line selection inside collapsible groups', () => {
  afterEach(() => {
    window.getSelection()?.removeAllRanges()
  })

  it('selects a group header line without collapsing the group', () => {
    const { container } = renderLog(GROUP_LOG, true)

    fireEvent.click(lineNumber(container, 1))

    expect(container.textContent).toContain('pnpm install --frozen-lockfile')
    expect(screen.getByRole('button', { name: /Copy 1 line/ })).toBeVisible()
  })

  it('collapses the group when the header row itself is clicked', () => {
    const { container } = renderLog(GROUP_LOG, true)

    fireEvent.click(screen.getByText('Install dependencies'))

    expect(container.textContent).not.toContain('pnpm install --frozen-lockfile')
  })

  it('keeps the group open when the header text is drag-selected', () => {
    const { container } = renderLog(GROUP_LOG, true)
    const header = screen.getByText('Install dependencies')

    const range = document.createRange()
    range.selectNodeContents(header)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)

    fireEvent.click(header)

    expect(container.textContent).toContain('pnpm install --frozen-lockfile')
  })
})

describe('LogViewer search highlighting', () => {
  it('highlights every occurrence of the term on a line', () => {
    const { container } = renderLog('error here and error there')

    filterFor('error')

    const marks = container.querySelectorAll('mark.search-highlight')
    expect(marks).toHaveLength(2)
    for (const mark of marks) {
      expect(mark.textContent).toBe('error')
    }
  })

  it('highlights case-insensitively without changing the displayed text', () => {
    const { container } = renderLog('Error and ERROR')

    filterFor('error')

    expect(container.querySelectorAll('mark.search-highlight')).toHaveLength(2)
    expect(container.textContent).toContain('Error and ERROR')
  })

  it('treats a term with regex metacharacters literally', () => {
    const { container } = renderLog('a.c and abc')

    expect(() => filterFor('a.c')).not.toThrow()

    const marks = container.querySelectorAll('mark.search-highlight')
    expect(marks).toHaveLength(1)
    expect(marks[0]?.textContent).toBe('a.c')
  })

  it('filters bracketed text after ANSI escape sequences are removed', () => {
    const { container } = renderLog(
      '\u001b[90m2026-08-05\u001b[0m \u001b[31m[ERROR]\u001b[0m failed',
    )

    filterFor('[ERROR]')

    expect(container.textContent).toContain('[ERROR] failed')
    expect(container.querySelector('mark.search-highlight')?.textContent).toBe('[ERROR]')
  })

  it('keeps ANSI colouring while highlighting a match', () => {
    const { container } = renderLog('\u001b[31mred error\u001b[0m')

    filterFor('error')

    expect(container.querySelector('.ansi-red-fg')).not.toBeNull()
    expect(container.querySelector('mark.search-highlight')?.textContent).toBe('error')
  })
})
