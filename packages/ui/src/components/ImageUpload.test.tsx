// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { ImageUpload } from './ImageUpload'

describe('ImageUpload', () => {
  it('shows the first letter of the name without an image', () => {
    const { container } = render(<ImageUpload name="operations" onUpload={async () => {}} />)
    expect(container).toHaveTextContent('o')
    expect(container.querySelector('img')).toBeNull()
  })

  it('shows the image, and the letter again when it fails to load', () => {
    const { container } = render(
      <ImageUpload name="Platform" src="/icon.png" onUpload={async () => {}} />,
    )
    const img = container.querySelector('img')
    expect(img).toHaveAttribute('src', '/icon.png')
    fireEvent.error(img as HTMLImageElement)
    expect(container.querySelector('img')).toBeNull()
    expect(container).toHaveTextContent('P')
  })

  it('names its menu after what the image stands for, and hides it when disabled', () => {
    const { rerender } = render(<ImageUpload name="Platform" onUpload={async () => {}} />)
    expect(
      screen.getByRole('button', { name: 'Change the image for Platform' }),
    ).toBeInTheDocument()
    rerender(<ImageUpload name="Platform" disabled onUpload={async () => {}} />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('opens the crop dialog only for an image file', async () => {
    const { container } = render(<ImageUpload name="Platform" onUpload={async () => {}} />)
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.change(input, {
      target: { files: [new File(['x'], 'logo.png', { type: 'image/png' })] },
    })
    expect(await screen.findByRole('dialog', { name: 'Image for Platform' })).toBeInTheDocument()
  })
})
