// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, render, screen } from '@testing-library/react'
import { DateTime } from 'luxon'
import { hoverTooltip } from '../test/tooltip'
import { Elapsed, RelativeTime, useClock, useRelativeTime } from './relativeTime'
import { TooltipProvider } from './Tooltip'

const START = new Date('2026-01-01T12:00:00Z')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] })
  vi.setSystemTime(START)
})

afterEach(() => {
  vi.useRealTimers()
})

const ago = (seconds: number) => START.getTime() - seconds * 1000

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

describe('useRelativeTime', () => {
  function Label({
    value,
    compact,
  }: {
    value: Parameters<typeof useRelativeTime>[0]
    compact?: boolean
  }) {
    return <span>{useRelativeTime(value, compact ? 'compact' : 'long') || 'none'}</span>
  }

  it('reads how long ago a time was, long or compact', () => {
    render(
      <>
        <Label value={ago(5 * 60)} />
        <Label value={ago(5 * 60)} compact />
      </>,
    )
    expect(screen.getByText('5 minutes ago')).toBeInTheDocument()
    expect(screen.getByText('5m')).toBeInTheDocument()
  })

  it('reads a time just recorded, even a moment ahead of the clock, as now', () => {
    render(<Label value={START.getTime() + 400} />)
    expect(screen.getByText('now')).toBeInTheDocument()
    advance(2000)
    expect(screen.getByText('1 second ago')).toBeInTheDocument()
  })

  it('takes an ISO string, a Date or a DateTime', () => {
    const at = ago(2 * 3600)
    render(
      <>
        <Label value={new Date(at).toISOString()} compact />
        <Label value={new Date(at)} compact />
        <Label value={DateTime.fromMillis(at)} compact />
      </>,
    )
    expect(screen.getAllByText('2h')).toHaveLength(3)
  })

  it('is empty for a missing or invalid time', () => {
    render(
      <>
        <Label value={undefined} />
        <Label value="not-a-date" />
      </>,
    )
    expect(screen.getAllByText('none')).toHaveLength(2)
  })

  it('counts on as time passes', () => {
    render(<Label value={ago(58)} />)
    expect(screen.getByText('58 seconds ago')).toBeInTheDocument()
    advance(3000)
    expect(screen.getByText('1 minute ago')).toBeInTheDocument()
  })

  it('re-renders only when its label changes', () => {
    let renders = 0
    function Counted() {
      renders++
      return <span>{useRelativeTime(ago(2 * 3600), 'compact')}</span>
    }
    render(<Counted />)
    const first = renders
    advance(30 * 60 * 1000)
    expect(screen.getByText('2h')).toBeInTheDocument()
    expect(renders).toBe(first)
    advance(31 * 60 * 1000)
    expect(screen.getByText('3h')).toBeInTheDocument()
    expect(renders).toBe(first + 1)
  })
})

describe('useClock', () => {
  it('shares one clock, and stops it when nothing reads it', () => {
    function Seconds() {
      return <span>{useClock((now) => Math.floor((now - START.getTime()) / 1000))}s</span>
    }
    const { unmount } = render(
      <>
        <Seconds />
        <Seconds />
      </>,
    )
    expect(vi.getTimerCount()).toBe(1)
    advance(2000)
    expect(screen.getAllByText('2s')).toHaveLength(2)
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('leaves the clock while not running', () => {
    function Stopped() {
      return <span>{useClock((now) => now, false)}</span>
    }
    render(<Stopped />)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('Elapsed', () => {
  it('counts while running and stops at its end', () => {
    const { rerender } = render(<Elapsed start={ago(75)} />)
    expect(screen.getByText('1m 15s').tagName).toBe('TIME')
    advance(2000)
    expect(screen.getByText('1m 17s')).toBeInTheDocument()
    rerender(<Elapsed start={ago(75)} end={ago(5)} />)
    expect(screen.getByText('1m 10s')).toHaveAttribute('dateTime', 'PT70S')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('holds still when told it is not running', () => {
    const { container } = render(<Elapsed start={ago(30)} running={false} />)
    const shown = container.textContent
    advance(5000)
    expect(container.textContent).toBe(shown)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('renders nothing without a start', () => {
    const { container } = render(<Elapsed start={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})

describe('RelativeTime', () => {
  it('renders a machine-readable time, with the exact time on hover', async () => {
    vi.useRealTimers()
    const at = DateTime.now().minus({ minutes: 3 })
    render(
      <TooltipProvider>
        <RelativeTime value={at} />
      </TooltipProvider>,
    )
    const time = screen.getByText('3 minutes ago')
    expect(time.tagName).toBe('TIME')
    expect(time).toHaveAttribute('dateTime', at.toISO())
    const tooltip = await hoverTooltip(time)
    expect(tooltip).toHaveTextContent(at.toLocaleString(DateTime.DATETIME_MED_WITH_SECONDS))
  })

  it('renders nothing without a time', () => {
    const { container } = render(<RelativeTime value={null} />)
    expect(container).toBeEmptyDOMElement()
  })
})
