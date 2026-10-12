// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { createRef } from 'react'
import { ToolbarPopover } from './ToolbarPopover'

// jsdom's window is 1024px wide, and the panel 384px before it is laid out.
function panelBeside(left: number, right: number) {
  vi.spyOn(HTMLButtonElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left,
    right,
    top: 500,
    bottom: 530,
  } as DOMRect)
  const anchor = createRef<HTMLButtonElement>()
  render(
    <>
      <button type="button" ref={anchor}>
        Problems
      </button>
      <ToolbarPopover anchor={anchor} label="Problems" onClose={() => {}}>
        listed
      </ToolbarPopover>
    </>,
  )
  return screen.getByRole('dialog', { name: 'Problems' })
}

describe('ToolbarPopover', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lines up with its button’s right edge', () => {
    expect(panelBeside(900, 1000)).toHaveStyle({ right: '24px' })
  })

  it('keeps its left edge in the window when its button sits at the left', () => {
    expect(panelBeside(8, 40)).toHaveStyle({ right: `${1024 - 8 - 384}px` })
  })
})
