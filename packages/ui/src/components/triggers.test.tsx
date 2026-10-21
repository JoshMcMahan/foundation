// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createRef, type ReactElement, type Ref } from 'react'
import { openTooltip } from '../test/tooltip'
import { Avatar } from './Avatar'
import { Kbd } from './Kbd'
import { LetterBadge } from './LetterBadge'
import { UIProvider } from './Provider'
import { RunStatusIcon } from './RunStatusIcon'
import { Elapsed, RelativeTime } from './relativeTime'
import { CountBadge, StatusBadge, StatusDot } from './StatusBadge'
import { Tag } from './Tag'
import { Tooltip } from './Tooltip'

// Each inline component a host may hang a tooltip or a popover on, given the ref and the props a
// trigger passes, and the tag its own element is.
const TRIGGERS: [name: string, tag: string, make: (ref: Ref<never>) => ReactElement][] = [
  [
    'StatusBadge',
    'SPAN',
    (ref) => (
      <StatusBadge ref={ref} tabIndex={0} variant="success">
        Running
      </StatusBadge>
    ),
  ],
  [
    'StatusBadge as a link',
    'A',
    (ref) => (
      <StatusBadge ref={ref} render={<a href="/runs/12" />}>
        Run 12
      </StatusBadge>
    ),
  ],
  ['CountBadge', 'SPAN', (ref) => <CountBadge ref={ref} tabIndex={0} count={4} />],
  ['StatusDot', 'SPAN', (ref) => <StatusDot ref={ref} tabIndex={0} variant="error" />],
  [
    'Tag',
    'SPAN',
    (ref) => (
      <Tag ref={ref} tabIndex={0}>
        gpu
      </Tag>
    ),
  ],
  [
    'Tag as a link',
    'A',
    (ref) => (
      <Tag ref={ref} href="/labels/gpu">
        gpu
      </Tag>
    ),
  ],
  [
    'Tag with an ×',
    'SPAN',
    (ref) => (
      <Tag ref={ref} tabIndex={0} onRemove={() => {}}>
        gpu
      </Tag>
    ),
  ],
  ['Kbd', 'KBD', (ref) => <Kbd ref={ref} tabIndex={0} keys="K" />],
  [
    'Kbd with a chord',
    'KBD',
    (ref) => <Kbd ref={ref} tabIndex={0} keys="Mod+K" platform="other" />,
  ],
  ['Kbd plain', 'KBD', (ref) => <Kbd ref={ref} tabIndex={0} keys="Mod+K" variant="plain" />],
  ['Avatar', 'SPAN', (ref) => <Avatar ref={ref} tabIndex={0} name="Ada Lovelace" />],
  ['RunStatusIcon', 'SPAN', (ref) => <RunStatusIcon ref={ref} tabIndex={0} status="failed" />],
  ['LetterBadge', 'SPAN', (ref) => <LetterBadge ref={ref} tabIndex={0} text="PY" />],
  [
    'RelativeTime',
    'TIME',
    (ref) => <RelativeTime ref={ref} tabIndex={0} value={Date.now() - 60_000} exact={false} />,
  ],
  [
    'Elapsed',
    'TIME',
    (ref) => <Elapsed ref={ref} tabIndex={0} start={Date.now() - 45_000} end={Date.now()} />,
  ],
]

const host = (make: (ref: Ref<never>) => ReactElement, ref: Ref<never>) =>
  render(
    <UIProvider>
      <Tooltip content="More about it">{make(ref)}</Tooltip>
    </UIProvider>,
  )

describe('inline components as tooltip triggers', () => {
  it.each(TRIGGERS)('%s takes the ref and the props a trigger passes', async (_, tag, make) => {
    const ref = createRef<HTMLElement>()
    host(make, ref as Ref<never>)
    const el = ref.current
    expect(el?.tagName).toBe(tag)
    if (!el) {
      return
    }
    fireEvent.pointerEnter(el, { pointerType: 'mouse' })
    fireEvent.mouseEnter(el)
    fireEvent.pointerMove(el, { pointerType: 'mouse' })
    fireEvent.mouseMove(el)
    await waitFor(() => expect(openTooltip()).toHaveTextContent('More about it'))
  })

  it.each(TRIGGERS)('%s opens its tooltip on focus', async (_, __, make) => {
    const ref = createRef<HTMLElement>()
    host(make, ref as Ref<never>)
    const el = ref.current
    if (!el) {
      throw new Error('no element')
    }
    act(() => el.focus())
    expect(await screen.findByText('More about it')).toBeInTheDocument()
  })

  it('merges a class and a style with its own', () => {
    render(
      <>
        <StatusBadge className="ml-2" style={{ maxWidth: 80 }}>
          Beta
        </StatusBadge>
        <StatusDot data-testid="dot" className="ml-1" style={{ opacity: 0.5 }} size={6} />
      </>,
    )
    const badge = screen.getByText('Beta')
    expect(badge).toHaveClass('ml-2', 'inline-flex')
    expect(badge).toHaveStyle({ maxWidth: '80px' })
    const dot = screen.getByTestId('dot')
    expect(dot).toHaveClass('ml-1', 'relative')
    expect(dot).toHaveStyle({ opacity: '0.5', width: '6px' })
  })
})
