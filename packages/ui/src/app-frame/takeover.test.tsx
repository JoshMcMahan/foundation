// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AppFrame,
  AppFrameListTakeover,
  AppFrameNavItem,
  AppFrameTakeover,
  AppFrameTakeoverBack,
  AppFrameToggle,
  useAppFrameTakeover,
} from './index'

let mobile = true
beforeEach(() => {
  mobile = true
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({ matches: mobile, addEventListener() {}, removeEventListener() {} })),
  )
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const openMenu = vi.fn()
const onOpen = vi.fn()
const onNew = vi.fn()

function Host({ enabled = true, rows = true }: { enabled?: boolean; rows?: boolean }) {
  const takeover = useAppFrameTakeover(enabled)
  return (
    <AppFrameTakeover value={takeover.takeover}>
      <AppFrame
        brand={
          takeover.active ? <AppFrameTakeoverBack onBack={takeover.showNavigation} /> : 'Workspace'
        }
        navigation={
          takeover.active ? takeover.navigation : <AppFrameNavItem label="Projects" href="#p" />
        }
        header={<AppFrameToggle />}
      >
        <AppFrameListTakeover
          newItem={{ label: 'New session', selected: false, onClick: onNew }}
          groups={
            rows
              ? [
                  {
                    key: 'recent',
                    label: 'Recent',
                    rows: [
                      {
                        key: 'a',
                        label: 'Flaky sign-in test',
                        time: '3h',
                        detail: 'Working',
                        selected: true,
                        onClick: onOpen,
                        menuItems: [{ label: 'Archive', onClick: () => {} }],
                      },
                      {
                        key: 'b',
                        label: 'Queue time report',
                        href: '#b',
                        selected: false,
                        menuItems: [],
                      },
                    ],
                  },
                ]
              : []
          }
          empty={<p>No sessions yet</p>}
          openMenu={openMenu}
        >
          <p>Dialogs</p>
        </AppFrameListTakeover>
      </AppFrame>
    </AppFrameTakeover>
  )
}

function openDrawer() {
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }))
  return within(screen.getByRole('dialog'))
}

describe('AppFrame list takeover', () => {
  it("shows the page's list in place of the app's navigation", () => {
    render(<Host />)
    const drawer = openDrawer()
    expect(drawer.getByText('New session')).toBeInTheDocument()
    expect(drawer.getByText('Recent')).toBeInTheDocument()
    expect(drawer.getByText('Flaky sign-in test')).toBeInTheDocument()
    expect(drawer.getByText('Working')).toBeInTheDocument()
    expect(drawer.getByText('3h')).toBeInTheDocument()
    expect(drawer.getByRole('link', { name: 'Queue time report' })).toHaveAttribute('href', '#b')
    expect(drawer.queryByText('Projects')).not.toBeInTheDocument()
  })

  it('opens a row that is not a link by its click, and starts a new one', () => {
    render(<Host />)
    const drawer = openDrawer()
    fireEvent.click(drawer.getByText('Flaky sign-in test'))
    expect(onOpen).toHaveBeenCalledTimes(1)
    fireEvent.click(drawer.getByText('New session'))
    expect(onNew).toHaveBeenCalledTimes(1)
  })

  it("keeps each row's menu behind a button that is always there", () => {
    render(<Host />)
    const drawer = openDrawer()
    const buttons = drawer.getAllByRole('button', { name: 'More actions' })
    expect(buttons).toHaveLength(2)
    fireEvent.click(buttons[0] as HTMLElement)
    expect(openMenu).toHaveBeenCalledWith(buttons[0], [
      expect.objectContaining({ label: 'Archive' }),
    ])
  })

  it("goes back to the app's navigation, staying on the page", () => {
    render(<Host />)
    const drawer = openDrawer()
    fireEvent.click(drawer.getByRole('button', { name: 'Main menu' }))
    expect(drawer.getByText('Projects')).toBeInTheDocument()
    expect(drawer.queryByText('Flaky sign-in test')).not.toBeInTheDocument()
    expect(drawer.queryByRole('button', { name: 'Main menu' })).not.toBeInTheDocument()
  })

  it('says so in place of the groups when there are none', () => {
    render(<Host rows={false} />)
    const drawer = openDrawer()
    expect(drawer.getByText('No sessions yet')).toBeInTheDocument()
    expect(drawer.getByText('New session')).toBeInTheDocument()
  })

  it("leaves the app's navigation alone when the host has not asked for the takeover", () => {
    render(<Host enabled={false} />)
    const drawer = openDrawer()
    expect(drawer.getByText('Projects')).toBeInTheDocument()
    expect(drawer.queryByText('Flaky sign-in test')).not.toBeInTheDocument()
  })

  it("renders the list's own menus and dialogs outside the navigation", () => {
    render(<Host />)
    expect(screen.getByText('Dialogs')).toBeInTheDocument()
  })
})
