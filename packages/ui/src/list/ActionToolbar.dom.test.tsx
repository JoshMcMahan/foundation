// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { ActionToolbar } from './ActionToolbar'

// jsdom measures nothing, so two or more items on the right all move into the `…` menu.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const Icon = () => null

describe('ActionToolbar toggles', () => {
  it('say whether they are on, disabled ones and ones moved into the menu too', () => {
    render(
      <ActionToolbar
        groups={[
          [
            { key: 'refresh', label: 'Auto refresh', icon: Icon, onClick: () => {}, active: true },
            {
              key: 'follow',
              label: 'Follow',
              icon: Icon,
              onClick: () => {},
              active: false,
              disabled: true,
            },
          ],
        ]}
        right={[
          { key: 'graph', label: 'Graph', icon: Icon, onClick: () => {}, active: true },
          { key: 'editor', label: 'Editor', icon: Icon, onClick: () => {}, active: false },
        ]}
      />,
    )
    expect(screen.getByRole('button', { name: 'Auto refresh' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: 'Follow' })).toHaveAttribute('aria-pressed', 'false')
    // The menu keeps its rows mounted while closed.
    expect(screen.getByRole('menuitem', { name: 'Graph, on', hidden: true })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Editor, off', hidden: true })).toBeInTheDocument()
  })
})
