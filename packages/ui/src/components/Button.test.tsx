// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Button } from './Button'
import { buttonClasses } from './buttonClasses'
import { FileButton } from './FileButton'
import { IconButton } from './IconButton'
import { TooltipProvider } from './Tooltip'

describe('Button', () => {
  it('is busy, and can’t be pressed again, while loading', () => {
    const onClick = vi.fn()
    render(
      <Button variant="primary" loading onClick={onClick}>
        Save
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Save' })
    expect(button).toHaveAttribute('aria-busy', 'true')
    expect(button).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(button)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('keeps the busy state its caller sets without loading', () => {
    render(
      <Button aria-busy aria-disabled>
        Sending
      </Button>,
    )
    expect(screen.getByRole('button', { name: 'Sending' })).toHaveAttribute('aria-busy', 'true')
  })

  it('keeps focus when it turns busy', () => {
    const { rerender } = render(<Button onClick={() => {}}>Save</Button>)
    const button = screen.getByRole('button', { name: 'Save' })
    button.focus()
    rerender(
      <Button loading onClick={() => {}}>
        Save
      </Button>,
    )
    expect(button).toHaveFocus()
    expect(button).not.toHaveAttribute('disabled')
  })

  it('stays focusable while disabled when asked, for its tooltip', () => {
    render(
      <Button disabled focusableWhenDisabled>
        Delete
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Delete' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    act(() => button.focus())
    expect(button).toHaveFocus()
  })
})

describe('Button while loading without an icon', () => {
  it('keeps its label, unseen, as its name and width, with the spinner over it', () => {
    render(
      <Button variant="primary" loading>
        Save
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Save' })
    const label = screen.getByText('Save')
    expect(label).toHaveClass('opacity-0')
    expect(button.querySelector('.absolute svg')).toBeInTheDocument()
  })

  it('swaps the icon for the spinner when it has one', () => {
    render(
      <Button loading icon={<svg data-testid="icon" />}>
        Save
      </Button>,
    )
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument()
    expect(screen.getByText('Save')).not.toHaveClass('opacity-0')
  })
})

describe('buttonClasses', () => {
  it('sizes icons by default only, so a size class on the icon wins', () => {
    expect(buttonClasses({ size: 'md' })).toContain('[:where(&)_svg]:size-4')
    expect(buttonClasses({ size: 'md' })).not.toContain('[&_svg]')
  })

  it('has a quieter destructive look for actions that aren’t the confirmation', () => {
    expect(buttonClasses({ variant: 'danger-outline' })).toContain('text-(--theme-error-text)')
  })

  it('grows with a label that wraps, instead of fixing its height', () => {
    const classes = buttonClasses({ size: 'md' }).split(' ')
    expect(classes).toContain('min-h-8')
    expect(classes).not.toContain('h-8')
    expect(classes).not.toContain('whitespace-nowrap')
  })
})

describe('FileButton', () => {
  function pick(input: HTMLInputElement, files: File[]) {
    Object.defineProperty(input, 'files', { value: files, configurable: true })
    fireEvent.change(input)
  }

  it('is a real button that opens the file picker', () => {
    const { container } = render(
      <FileButton accept="image/*" onFiles={() => {}}>
        Upload logo
      </FileButton>,
    )
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    expect(input).toHaveAttribute('accept', 'image/*')
    expect(input).toHaveAttribute('tabindex', '-1')
    const click = vi.spyOn(input, 'click')
    const button = screen.getByRole('button', { name: 'Upload logo' })
    button.focus()
    expect(button).toHaveFocus()
    fireEvent.click(button)
    expect(click).toHaveBeenCalledOnce()
  })

  it('hands over the files picked, and takes the same file again', () => {
    const onFiles = vi.fn()
    const { container } = render(
      <FileButton multiple onFiles={onFiles}>
        Add files
      </FileButton>,
    )
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    expect(input).toHaveAttribute('multiple')
    const file = new File(['a'], 'a.txt', { type: 'text/plain' })
    pick(input, [file])
    expect(onFiles).toHaveBeenCalledWith([file])
    expect(input.value).toBe('')
    pick(input, [])
    expect(onFiles).toHaveBeenCalledOnce()
  })

  it('doesn’t open the picker while busy or disabled', () => {
    const { container } = render(
      <FileButton loading onFiles={() => {}}>
        Upload
      </FileButton>,
    )
    const input = container.querySelector('input[type=file]') as HTMLInputElement
    const click = vi.spyOn(input, 'click')
    fireEvent.click(screen.getByRole('button', { name: 'Upload' }))
    expect(click).not.toHaveBeenCalled()
  })
})

describe('IconButton', () => {
  it('is named by its label and reports a toggle’s state', () => {
    render(<IconButton label="Pin" icon="📌" pressed />)
    expect(screen.getByRole('button', { name: 'Pin' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('shows a dot as an indicator, not as pressed', () => {
    render(<IconButton label="Filter" icon="⏷" dot />)
    const button = screen.getByRole('button', { name: 'Filter' })
    expect(button).not.toHaveAttribute('aria-pressed')
    expect(button.querySelector('span')).toBeInTheDocument()
  })

  it('keeps its tooltip as an expanded disclosure, but not as an open popup’s trigger', async () => {
    render(
      <TooltipProvider>
        <IconButton label="Collapse sidebar" icon="◧" aria-expanded />
        <IconButton label="More actions" icon="…" aria-expanded aria-haspopup="menu" />
      </TooltipProvider>,
    )
    act(() => screen.getByRole('button', { name: 'Collapse sidebar' }).focus())
    expect(await screen.findByText('Collapse sidebar')).toBeInTheDocument()
    act(() => screen.getByRole('button', { name: 'More actions' }).focus())
    await new Promise((resolve) => setTimeout(resolve, 50))
    await waitFor(() => expect(screen.queryByText('More actions')).not.toBeInTheDocument())
  })
})
