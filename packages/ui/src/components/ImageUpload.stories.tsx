import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { expect, userEvent, within } from 'storybook/test'
import { ImageUpload } from './ImageUpload'

const meta: Meta = {
  title: 'UI/Image upload',
}
export default meta

// A square mark drawn as SVG, so the stories need no image files.
const mark = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#3b82f6"/><path d="M18 44 32 18l14 26z" fill="#fff"/></svg>',
)}`

// A wide picture with transparent margins, as a logo export often has.
const wide = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="500"><rect x="150" y="80" width="600" height="340" rx="40" fill="#16a34a"/><circle cx="450" cy="250" r="110" fill="#fff"/></svg>',
)}`

interface UploadArgs {
  name: string
  withImage: boolean
  removable: boolean
  disabled: boolean
  size: number
}

/** A tile with a menu to upload, replace or remove the image. Saving keeps the cropped
 *  square in the story, as a host would after its upload succeeds. */
export const Upload: StoryObj<UploadArgs> = {
  args: { name: 'Platform', withImage: true, removable: true, disabled: false, size: 64 },
  argTypes: {
    name: {
      control: 'text',
      description: 'What the image stands for; its letter shows without one.',
    },
    withImage: { control: 'boolean', description: 'Starts with an image.' },
    removable: { control: 'boolean', description: 'Passes onRemove, which adds Remove.' },
    disabled: { control: 'boolean', description: 'Shows the tile without its menu.' },
    size: { control: { type: 'range', min: 24, max: 128, step: 4 } },
  },
  render: function Render({ name, withImage, removable, disabled, size }) {
    const [src, setSrc] = useState<string | undefined>(withImage ? mark : undefined)
    return (
      <div className="p-8 text-sm text-(--theme-app)">
        <ImageUpload
          src={src}
          name={name}
          size={size}
          disabled={disabled}
          onUpload={async (blob) => setSrc(URL.createObjectURL(blob))}
          onRemove={removable ? () => setSrc(undefined) : undefined}
        />
      </div>
    )
  },
}

/** Without an image the tile shows the first letter of the name. */
export const Letter: StoryObj = {
  render: () => (
    <div className="flex gap-4 p-8">
      <ImageUpload name="Operations" onUpload={async () => {}} />
      <ImageUpload name="web app" size={40} onUpload={async () => {}} />
    </div>
  ),
}

/** Chooses the wide picture in the story's file input, which opens the crop dialog. */
async function chooseWide(canvasElement: HTMLElement) {
  const file = new File([await (await fetch(wide)).blob()], 'logo.svg', { type: 'image/svg+xml' })
  const input = canvasElement.querySelector('input[type=file]')
  if (!(input instanceof HTMLInputElement)) return
  await userEvent.upload(input, file)
  const body = within(canvasElement.ownerDocument.body)
  await expect(await body.findByRole('dialog')).toBeInTheDocument()
}

/** The crop dialog, opened by choosing a file: drag the picture, zoom, then save. */
export const Cropping: StoryObj = {
  render: () => (
    <div className="p-8">
      <ImageUpload name="Platform" onUpload={async () => {}} />
    </div>
  ),
  play: ({ canvasElement }) => chooseWide(canvasElement),
}

/** Saving fails: the dialog stays open and says why. */
export const SaveFails: StoryObj = {
  render: () => (
    <div className="p-8">
      <ImageUpload
        name="Platform"
        onUpload={async () => {
          throw new Error('The image is larger than 2 MB.')
        }}
      />
    </div>
  ),
  play: ({ canvasElement }) => chooseWide(canvasElement),
}
