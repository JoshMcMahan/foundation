// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ActionMenu } from '../components/ActionMenu'
import { AppFrame, AppFrameNavItem, AppFrameToggle } from './index'

let mobile = false
beforeEach(() => {
  mobile = false
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: mobile, addEventListener() {}, removeEventListener() {} })),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})
const navigation = (
  <nav aria-label="Primary">
    <AppFrameNavItem label="Projects" icon={<span>P</span>} href="#projects" selected />
    <AppFrameNavItem label="Settings" icon={<span>S</span>} />
  </nav>
)
const props = {
  navigation,
  header: <AppFrameToggle />,
  children: <button type="button">Content action</button>,
}

function pointer(element: Element, type: string, clientX: number, pointerId = 1) {
  const event = new MouseEvent(type, { bubbles: true, button: 0, clientX })
  Object.defineProperty(event, 'pointerId', { value: pointerId })
  fireEvent(element, event)
}

function startResize() {
  const splitter = screen.getByRole('separator')
  Object.defineProperty(splitter, 'setPointerCapture', { value: vi.fn() })
  pointer(splitter, 'pointerdown', 240)
  return splitter
}

describe('AppFrame', () => {
  it('collapses into a named icon rail without removing navigation links', () => {
    render(<AppFrame {...props} />)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '64')
    expect(screen.getByRole('link', { name: 'Projects' })).toHaveAttribute('aria-current', 'page')
    fireEvent.click(screen.getByRole('button', { name: 'Expand sidebar' }))
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '240')
  })
  it('resizes with the keyboard, bounds widths, and reopens a collapsed rail', () => {
    render(<AppFrame {...props} defaultWidth={184} minWidth={168} maxWidth={320} />)
    const splitter = screen.getByRole('separator')
    for (const [key, width] of [
      ['Home', '168'],
      ['ArrowLeft', '64'],
      ['ArrowRight', '168'],
      ['End', '320'],
      ['ArrowRight', '320'],
    ]) {
      fireEvent.keyDown(splitter, { key })
      expect(splitter).toHaveAttribute('aria-valuenow', width)
    }
  })
  it('reports controlled changes and keeps the host value authoritative', () => {
    const onWidthChange = vi.fn(),
      onExpandedChange = vi.fn()
    render(
      <AppFrame
        {...props}
        width={260}
        expanded
        onWidthChange={onWidthChange}
        onExpandedChange={onExpandedChange}
      />,
    )
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowRight' })
    expect(onWidthChange).toHaveBeenCalledWith(276)
    expect(screen.getByRole('separator')).toHaveAttribute('aria-valuenow', '260')
    fireEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(onExpandedChange).toHaveBeenCalledWith(false)
    expect(screen.getByRole('button', { name: 'Collapse sidebar' })).toBeInTheDocument()
  })
  it.each(['pointerup', 'pointercancel', 'lostpointercapture'])(
    'previews a drag locally and commits its width once on %s',
    (end) => {
      const onWidthChange = vi.fn()
      render(<AppFrame {...props} onWidthChange={onWidthChange} />)
      const splitter = startResize()
      pointer(splitter, 'pointermove', 280)
      pointer(splitter, 'pointermove', 320)
      expect(splitter).toHaveAttribute('aria-valuenow', '320')
      expect(onWidthChange).not.toHaveBeenCalled()
      pointer(splitter, end, 320)
      pointer(splitter, 'lostpointercapture', 320)
      expect(onWidthChange).toHaveBeenCalledExactlyOnceWith(320)
      expect(splitter).toHaveAttribute('aria-valuenow', '320')
    },
  )
  it('ignores a second pointer while resizing', () => {
    render(<AppFrame {...props} />)
    const splitter = startResize()
    pointer(splitter, 'pointermove', 280)
    pointer(splitter, 'pointermove', 380, 2)
    pointer(splitter, 'pointerup', 380, 2)
    expect(splitter).toHaveAttribute('aria-valuenow', '280')
    pointer(splitter, 'pointermove', 300)
    pointer(splitter, 'pointerup', 300)
    expect(splitter).toHaveAttribute('aria-valuenow', '300')
  })
  it('ends an interrupted drag when the resize handle is removed', () => {
    const view = render(<AppFrame {...props} />)
    const splitter = startResize()
    pointer(splitter, 'pointermove', 280)
    view.rerender(<AppFrame {...props} resizable={false} />)
    view.rerender(<AppFrame {...props} />)
    expect(screen.getByRole('complementary')).not.toHaveAttribute('data-resizing')
    const restored = screen.getByRole('separator')
    const width = restored.getAttribute('aria-valuenow')
    pointer(restored, 'pointermove', 350)
    expect(restored).toHaveAttribute('aria-valuenow', width)
  })
  it('ends an interrupted drag when navigation switches to mobile', () => {
    const view = render(<AppFrame {...props} />)
    const splitter = startResize()
    pointer(splitter, 'pointermove', 280)
    mobile = true
    view.rerender(<AppFrame {...props} mobileBreakpoint={1000} />)
    expect(screen.queryByRole('separator')).not.toBeInTheDocument()
    mobile = false
    view.rerender(<AppFrame {...props} />)
    expect(screen.getByRole('complementary')).not.toHaveAttribute('data-resizing')
    const restored = screen.getByRole('separator')
    const width = restored.getAttribute('aria-valuenow')
    pointer(restored, 'pointermove', 350)
    expect(restored).toHaveAttribute('aria-valuenow', width)
  })
  it('moves focus to content without changing a hash route', () => {
    render(<AppFrame {...props} />)
    fireEvent.click(screen.getByRole('link', { name: 'Skip to content' }))
    expect(screen.getByRole('main')).toHaveFocus()
    expect(window.location.hash).toBe('')
  })
  it('opens a mobile dialog, closes on navigation, and restores focus', async () => {
    mobile = true
    render(<AppFrame {...props} defaultExpanded={false} />)
    const trigger = screen.getByRole('button', { name: 'Open navigation' })
    expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument()
    act(() => trigger.focus())
    fireEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Main navigation' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveTextContent('Settings')
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(trigger).toHaveFocus())
  })
  it('closes the drawer when the host changes route', async () => {
    mobile = true
    const view = render(<AppFrame {...props} navigationKey="projects" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    await screen.findByRole('dialog')
    view.rerender(<AppFrame {...props} navigationKey="settings" />)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  })
  it('uses the chosen sidebar width for mobile navigation', async () => {
    mobile = true
    render(<AppFrame {...props} width={208} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    expect(await screen.findByRole('dialog')).toHaveStyle({ width: '208px' })
  })
  it('contains the mobile overlay below the banner and beside the page', async () => {
    mobile = true
    const view = render(<AppFrame {...props} banner={<div>Service notice</div>} />)
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    const dialog = await screen.findByRole('dialog')
    const body = view.container.querySelector('.pw-frame-body')!
    expect(body).toContainElement(dialog)
    expect(body).toContainElement(view.container.querySelector('.pw-frame-backdrop') as HTMLElement)
    expect(body).not.toContainElement(screen.getByText('Service notice'))
  })
  it('preserves mobile navigation scroll until its section changes', async () => {
    mobile = true
    const view = render(
      <AppFrame {...props} navigationKey="projects/one" navigationResetKey="projects" />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    await screen.findByRole('dialog')
    const scroll = view.container.querySelector('.pw-frame-links')!
    scroll.scrollTop = 480
    fireEvent.scroll(scroll)
    view.rerender(
      <AppFrame {...props} navigationKey="projects/two" navigationResetKey="projects" />,
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    await screen.findByRole('dialog')
    expect(view.container.querySelector('.pw-frame-links')!.scrollTop).toBe(480)
    view.rerender(<AppFrame {...props} navigationKey="settings" navigationResetKey="settings" />)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    await screen.findByRole('dialog')
    expect(view.container.querySelector('.pw-frame-links')!.scrollTop).toBe(0)
  })
  it('dismisses a nested menu when a route change closes mobile navigation', async () => {
    mobile = true
    const footer = <ActionMenu label="Account" items={[{ label: 'Settings', onClick: () => {} }]} />
    const view = render(<AppFrame {...props} footer={footer} navigationKey="projects" />)
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
    await screen.findByRole('dialog')
    fireEvent.click(screen.getByRole('button', { name: 'Account' }))
    await screen.findByRole('menu')
    view.rerender(<AppFrame {...props} footer={footer} navigationKey="settings" />)
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument())
  })
  it.each([true, false])('announces new-tab links when expanded is %s', (expanded) => {
    render(
      <AppFrame
        {...props}
        defaultExpanded={expanded}
        navigation={
          <AppFrameNavItem
            label="Documentation"
            icon={<span>D</span>}
            href="https://example.com/docs"
            target="_blank"
          />
        }
      />,
    )
    expect(
      screen.getByRole('link', { name: /Documentation.*opens in (a )?new tab/i }),
    ).toBeInTheDocument()
  })
  it('keeps navigation scroll within a section and resets it when sections change', () => {
    const view = render(
      <AppFrame {...props} navigationKey="/projects/one" navigationResetKey="projects" />,
    )
    const scroll = view.container.querySelector('.pw-frame-links')!
    const scrollTo = vi.fn()
    Object.defineProperty(scroll, 'scrollTo', { value: scrollTo })
    view.rerender(
      <AppFrame {...props} navigationKey="/projects/two" navigationResetKey="projects" />,
    )
    expect(scrollTo).not.toHaveBeenCalled()
    view.rerender(<AppFrame {...props} navigationKey="/settings" navigationResetKey="settings" />)
    expect(scrollTo).toHaveBeenCalledWith({ top: 0 })
  })
  it.each([false, true])(
    'passes host attributes and events to navigation (mobile: %s)',
    async (isMobile) => {
      mobile = isMobile
      const onContextMenu = vi.fn()
      render(
        <AppFrame
          {...props}
          sidebarProps={{
            'aria-label': 'Workspace navigation',
            onContextMenu,
            className: 'host-navigation',
          }}
        />,
      )
      if (isMobile) fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
      const navigation = isMobile
        ? await screen.findByRole('dialog')
        : screen.getByRole('complementary')
      expect(navigation).toHaveClass('host-navigation')
      fireEvent.contextMenu(navigation)
      expect(onContextMenu).toHaveBeenCalledOnce()
    },
  )
})
