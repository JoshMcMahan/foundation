// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ImageStage, ZOOM_FIT } from './ImageStage'

// jsdom has no layout: each stage reports a 400x300 view onto content as wide as its zoom.
function layout(zoomOf: () => number) {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(400)
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(300)
  vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(
    () => (400 * zoomOf()) / ZOOM_FIT,
  )
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(
    () => (300 * zoomOf()) / ZOOM_FIT,
  )
}

describe('ImageStage', () => {
  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('zooming in from fit opens on the middle of the picture', () => {
    let zoom = ZOOM_FIT
    layout(() => zoom)
    const { rerender, getByRole } = render(<ImageStage src="a.png" alt="a" zoom={zoom} />)
    zoom = 200
    rerender(<ImageStage src="a.png" alt="a" zoom={zoom} />)
    const stage = getByRole('img').parentElement as HTMLElement
    expect(stage.scrollLeft).toBe(200)
    expect(stage.scrollTop).toBe(150)
  })

  it('a further zoom keeps the spot the reader scrolled to in the middle', () => {
    let zoom = 200
    layout(() => zoom)
    const { rerender, getByRole } = render(<ImageStage src="a.png" alt="a" zoom={zoom} />)
    const stage = getByRole('img').parentElement as HTMLElement
    // View 400 wide over 800: the middle of the view sits at 3/4 of the picture.
    stage.scrollLeft = 400
    stage.scrollTop = 0
    fireEvent.scroll(stage)
    zoom = 400
    rerender(<ImageStage src="a.png" alt="a" zoom={zoom} />)
    expect(stage.scrollLeft).toBe(0.75 * 1600 - 200)
    expect(stage.scrollTop).toBe(0.25 * 1200 - 150)
  })

  it('back at fit, the next zoom starts from the middle again', () => {
    let zoom = 200
    layout(() => zoom)
    const { rerender, getByRole } = render(<ImageStage src="a.png" alt="a" zoom={zoom} />)
    const stage = getByRole('img').parentElement as HTMLElement
    stage.scrollLeft = 0
    stage.scrollTop = 0
    fireEvent.scroll(stage)
    zoom = ZOOM_FIT
    rerender(<ImageStage src="a.png" alt="a" zoom={zoom} />)
    zoom = 200
    rerender(<ImageStage src="a.png" alt="a" zoom={zoom} />)
    expect(stage.scrollLeft).toBe(200)
    expect(stage.scrollTop).toBe(150)
  })
})
