// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { Checkbox } from './Checkbox'
import { ErrorText, Field, FieldOption, FieldRowContext, FieldValue, RevealToggle } from './Field'
import { fieldBox } from './fieldBox'
import { Radio, RadioGroup } from './Radio'
import { Slider } from './Slider'

describe('Field', () => {
  it('in a row of fields, puts its label and control on the row’s two tracks', () => {
    render(
      <FieldRowContext value>
        <Field label="Maximum number of concurrent workers" required>
          {(control) => <input {...control} />}
        </Field>
      </FieldRowContext>,
    )
    const box = screen.getByRole('textbox', { name: /Maximum number of concurrent workers/ })
    const label = document.querySelector(`label[for="${box.id}"]`)
    // The required mark follows the label's last word, inside the label itself.
    expect(label?.lastElementChild).toHaveTextContent('*')
    expect(label?.parentElement).toHaveClass('row-start-1')
    expect(box.closest('.row-start-2')).not.toBeNull()
    // Its own box steps aside, so its label and control sit in the row's grid.
    expect(label?.closest('[data-field-row]')).toHaveClass('contents')
  })

  it('puts actions on the label row, out of the control’s name', () => {
    render(
      <Field label="Needs" actions={<button type="button">Use an expression</button>}>
        {(control) => <input {...control} />}
      </Field>,
    )
    expect(screen.getByRole('textbox', { name: 'Needs' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Use an expression' })).toBeInTheDocument()
  })

  it('names the control by its label and describes it by its description and error', () => {
    render(
      <Field label="Cluster" description="Where it runs." error="Pick a cluster.">
        {(control) => <input {...control} />}
      </Field>,
    )
    const box = screen.getByRole('textbox', { name: 'Cluster' })
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(box).toHaveAccessibleDescription('Where it runs. Pick a cluster.')
    expect(screen.getByRole('alert')).toHaveTextContent('Pick a cluster.')
  })

  it('marks a required control without the native check, and leaves a valid one unflagged', () => {
    render(
      <Field label="Cluster" required>
        {(control) => <input {...control} />}
      </Field>,
    )
    const box = screen.getByRole('textbox', { name: /Cluster/ })
    expect(box).toHaveAttribute('aria-required', 'true')
    expect(box).not.toHaveAttribute('required')
    expect(box).not.toHaveAttribute('aria-invalid')
  })

  it('keeps a hint out of the control’s name', () => {
    render(
      <Field label="Cluster" hint={<button type="button">Help</button>}>
        {(control) => <input {...control} />}
      </Field>,
    )
    expect(screen.getByRole('textbox', { name: 'Cluster' })).toBeInTheDocument()
  })

  it('names a group by its label and each option by its own', () => {
    render(
      <Field label="Precision" group invalid>
        {(control) => (
          <RadioGroup {...control}>
            <FieldOption>
              <Radio value="half" />
              Half
            </FieldOption>
            <FieldOption>
              <Radio value="single" />
              Single
            </FieldOption>
          </RadioGroup>
        )}
      </Field>,
    )
    expect(screen.getByRole('group', { name: 'Precision' })).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByRole('radiogroup', { name: 'Precision' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('radio', { name: 'Single' }))
    expect(screen.getByRole('radio', { name: 'Single' })).toBeChecked()
    expect(screen.getByRole('radio', { name: 'Half' })).not.toBeChecked()
  })
})

describe('RevealToggle', () => {
  function Secret() {
    const [revealed, setRevealed] = useState(false)
    return (
      <>
        <input aria-label="Token" type={revealed ? 'text' : 'password'} className={fieldBox()} />
        <RevealToggle revealed={revealed} onRevealedChange={setRevealed} />
      </>
    )
  }

  it('shows the value while pressed', () => {
    render(<Secret />)
    const box = screen.getByLabelText('Token')
    expect(box).toHaveAttribute('type', 'password')
    fireEvent.click(screen.getByRole('button', { name: 'Show value' }))
    expect(box).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide value' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})

describe('fieldBox', () => {
  it('sizes a box and follows aria-invalid and disabled rather than classes of its own', () => {
    expect(fieldBox({ size: 'sm' })).toContain('h-7')
    expect(fieldBox()).toContain('h-9')
    expect(fieldBox()).toContain('aria-invalid:border-(--theme-error)')
    expect(fieldBox({ within: true })).toContain('has-[[aria-invalid=true]]:border-(--theme-error)')
    expect(fieldBox({ multiline: true })).toContain('min-h-9')
  })
})

describe('Checkbox', () => {
  it('reports a mixed state and a change', () => {
    const onCheckedChange = vi.fn()
    render(<Checkbox aria-label="All" indeterminate onCheckedChange={onCheckedChange} />)
    const box = screen.getByRole('checkbox', { name: 'All' })
    expect(box).toHaveAttribute('aria-checked', 'mixed')
    fireEvent.click(box)
    expect(onCheckedChange).toHaveBeenCalledWith(true, expect.anything())
  })

  it('takes its name from a wrapping label', () => {
    render(
      <label>
        <Checkbox defaultChecked />
        Public
      </label>,
    )
    expect(screen.getByRole('checkbox', { name: 'Public' })).toBeChecked()
  })
})

describe('Slider', () => {
  it('moves by its step with the arrow keys, within its range', () => {
    const onValueChange = vi.fn()
    render(<Slider aria-label="Workers" value={4} min={1} max={5} onValueChange={onValueChange} />)
    const thumb = screen.getByRole('slider', { name: 'Workers' })
    expect(thumb).toHaveAttribute('aria-valuenow', '4')
    fireEvent.keyDown(thumb, { key: 'ArrowRight' })
    expect(onValueChange).toHaveBeenLastCalledWith(5)
  })
})

describe('FieldValue', () => {
  it('is an output the Field’s label names and its help describes', () => {
    render(
      <Field label="Allocation" description="Workers times GPUs per worker.">
        <FieldValue htmlFor="workers">8 GPUs</FieldValue>
      </Field>,
    )
    const value = screen.getByRole('status', { name: 'Allocation' })
    expect(value.tagName).toBe('OUTPUT')
    expect(value).toHaveTextContent('8 GPUs')
    expect(value).toHaveAccessibleDescription('Workers times GPUs per worker.')
    expect(value).toHaveAttribute('for', 'workers')
  })
})

describe('ErrorText', () => {
  it('describes a control outside a Field by its id, and is nothing when empty', () => {
    const { rerender } = render(
      <>
        <input aria-label="Name" aria-describedby="name-error" />
        <ErrorText id="name-error">Taken</ErrorText>
      </>,
    )
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAccessibleDescription('Taken')
    rerender(<ErrorText id="name-error">{null}</ErrorText>)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
