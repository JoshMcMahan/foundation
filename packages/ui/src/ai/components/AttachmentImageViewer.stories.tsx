import type { Meta, StoryObj } from '@storybook/react-vite'
import { useMemo, useState } from 'react'
import { makeImageAttachments, makeStaticAdapter, StoryChat } from '../stories/harness'
import AttachmentImageViewer from './AttachmentImageViewer'

const meta: Meta = {
  title: 'Chat/Image viewer',
  component: AttachmentImageViewer,
  parameters: { layout: 'fullscreen' },
}

export default meta

const SERIES = [620, 540, 580, 430, 470, 320, 360, 240, 280, 170, 210, 130]

/** A chart at any size, so the preview and the full image are one picture. */
function chart(width: number, height: number): string {
  const line = SERIES.map((y, i) => `${i ? 'L' : 'M'}${(i * 1600) / 11} ${y}`).join(' ')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 1600 800">
<rect width="1600" height="800" fill="#10151c"/>
<path d="M0 200H1600M0 400H1600M0 600H1600" stroke="#2a3340" stroke-width="2"/>
<path d="${line} L1600 800 L0 800 Z" fill="#3b82f6" fill-opacity=".18"/>
<path d="${line}" fill="none" stroke="#3b82f6" stroke-width="6"/></svg>`
  return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

/** Holds back what `new Image()` loads, the way a slow network does: for `delay` milliseconds,
 *  or for good without one. */
function holdImages(delay?: number) {
  const Original = window.Image
  window.Image = class extends Original {
    override set src(url: string) {
      if (delay !== undefined) {
        setTimeout(() => {
          super.src = url
        }, delay)
      }
    }
  }
  return () => {
    window.Image = Original
  }
}

function Viewer({ fullUrl }: { fullUrl: string }) {
  const adapter = useMemo(() => makeStaticAdapter({ attachments: true }), [])
  const [index, setIndex] = useState<number | null>(0)
  const [attachment] = makeImageAttachments()
  if (!attachment) {
    return null
  }
  return (
    <StoryChat adapter={adapter}>
      <button type="button" className="m-4" onClick={() => setIndex(0)}>
        Open the image
      </button>
      <AttachmentImageViewer
        images={[{ attachment, name: 'queue-depth.png', src: chart(640, 320), fullUrl }]}
        index={index}
        onIndexChange={setIndex}
        onClose={() => setIndex(null)}
        returnFocusTo={() => null}
      />
    </StoryChat>
  )
}

// The full image is on its way: its preview fills the room the image will, blurred so
// it reads as a stand-in, under a spinner.
export const Loading: StoryObj = {
  beforeEach: () => holdImages(),
  render: () => <Viewer fullUrl={chart(3200, 1600)} />,
}

// The full image arrives three seconds in and the blur clears from it.
export const Arrives: StoryObj = {
  beforeEach: () => holdImages(3000),
  render: () => <Viewer fullUrl={chart(3200, 1600)} />,
}

// The full image never comes, so the preview goes back to its own size and says so.
export const Failed: StoryObj = {
  render: () => <Viewer fullUrl="data:image/png;base64,unreadable" />,
}
