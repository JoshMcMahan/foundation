// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useState } from 'react'
import { Checkbox, CheckboxGroup } from './Checkbox'
import { Combobox } from './Combobox'
import { DatePicker } from './DatePicker'
import { ErrorText, Field, FieldOption, FieldRowContext, FieldValue, RevealToggle } from './Field'
import { fieldBox } from './fieldBox'
import { Input, Textarea } from './Input'
import { Modal } from './Modal'
import { NumberInput } from './NumberInput'
import { OneTimeCodeInput } from './OneTimeCodeInput'
import { Radio, RadioGroup } from './Radio'
import { Select } from './Select'
import { Slider } from './Slider'
import { Switch } from './Switch'

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
    // The label sits in the row's text, with any ? or hint after it.
    expect(label?.parentElement?.parentElement).toHaveClass('row-start-1')
    expect(box.closest('.row-start-2')).not.toBeNull()
    // Its own box steps aside, so its label and control sit in the row's grid.
    expect(label?.closest('[data-field-row]')).toHaveClass('contents')
  })

  it('sizes an inline label to a control of its size', () => {
    render(
      <>
        <Field label="Allocation" layout="inline" compact size="sm">
          {(control) => <input {...control} />}
        </Field>
        <Field label="Zone" layout="inline">
          {(control) => <input {...control} />}
        </Field>
      </>,
    )
    const labelRow = (name: string) =>
      document.querySelector(`label[for="${screen.getByRole('textbox', { name }).id}"]`)
        ?.parentElement?.parentElement
    expect(labelRow('Allocation')).toHaveClass('min-h-7', 'text-xs')
    expect(labelRow('Zone')).toHaveClass('min-h-8', 'text-sm')
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

  it('gives its id to the control placed in it, which its label names', () => {
    render(
      <>
        <Field label="Region" id="region">
          <Input />
        </Field>
        <Field label="Notes" id="notes">
          <Textarea />
        </Field>
        <Field label="Country" id="country">
          <Select items={[{ value: 'us', label: 'United States' }]} />
        </Field>
        <Field label="Owner" id="owner">
          <Combobox items={['Ada', 'Lin']} />
        </Field>
        <Field label="Nodes" id="nodes">
          <NumberInput />
        </Field>
        <Field label="Code" id="code">
          <OneTimeCodeInput length={4} />
        </Field>
        <Field label="Notify" id="notify">
          <Checkbox />
        </Field>
        <Field label="Enabled" id="enabled">
          <Switch />
        </Field>
      </>,
    )
    const named = [
      ['region', screen.getByRole('textbox', { name: 'Region' })],
      ['notes', screen.getByRole('textbox', { name: 'Notes' })],
      ['country', screen.getByRole('combobox', { name: 'Country' })],
      ['owner', screen.getByRole('combobox', { name: 'Owner' })],
      ['nodes', screen.getByRole('textbox', { name: 'Nodes' })],
      ['code', screen.getByRole('textbox', { name: 'Code' })],
    ] as const
    for (const [id, control] of named) {
      expect(control).toHaveAttribute('id', id)
      expect(document.querySelector(`label[for="${id}"]`)).not.toBeNull()
    }
    // A checkbox and a switch keep the id on their native input, which the label points at.
    for (const [id, name, role] of [
      ['notify', 'Notify', 'checkbox'],
      ['enabled', 'Enabled', 'switch'],
    ] as const) {
      expect(screen.getByRole(role, { name })).toBeInTheDocument()
      expect(document.getElementById(id)).toBeInstanceOf(HTMLInputElement)
      expect(document.querySelector(`label[for="${id}"]`)).toHaveTextContent(name)
    }
  })

  it('keeps its id from a group’s options, which each keep their own', () => {
    render(
      <Field label="Zones" group id="zones">
        <CheckboxGroup>
          <FieldOption>
            <Checkbox value="east" />
            East
          </FieldOption>
          <FieldOption>
            <Checkbox value="west" />
            West
          </FieldOption>
        </CheckboxGroup>
      </Field>,
    )
    const ids = screen.getAllByRole('checkbox').map((box) => box.id)
    expect(new Set(ids).size).toBe(2)
    expect(document.getElementById('zones')).toBeNull()
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
    expect(fieldBox()).toContain('h-8')
    expect(fieldBox()).toContain('aria-invalid:border-(--theme-error)')
    expect(fieldBox({ within: true })).toContain('has-[[aria-invalid=true]]:border-(--theme-error)')
    expect(fieldBox({ multiline: true })).toContain('min-h-8')
  })

  it("rests on the field edge and takes a control's edge on hover, unless disabled", () => {
    for (const within of [false, true]) {
      const box = fieldBox({ within }).split(' ')
      expect(box).toContain('border-(--theme-border-field)')
      expect(box).toContain('hover:border-(--theme-border-strong)')
      expect(box).toContain('data-disabled:hover:border-(--theme-border-field)')
    }
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

describe('a label’s for', () => {
  // Every label `for` names an element that is there.
  const dangling = () =>
    [...document.querySelectorAll('label[for]')].filter(
      (label) => !document.getElementById(label.getAttribute('for') ?? ''),
    )

  it('names a Base UI control by for, and points at nothing for a control named by its id', () => {
    render(
      <>
        <Field label="Name">
          <Input />
        </Field>
        <Field label="Allocation">
          <FieldValue>8 GPUs</FieldValue>
        </Field>
        <Field label="Start" help="The first day the reservation holds.">
          <DatePicker value="" onValueChange={() => {}} />
        </Field>
      </>,
    )
    expect(dangling()).toEqual([])
    expect(screen.getByRole('textbox', { name: 'Name' })).toBeInTheDocument()
    const start = screen.getByRole('button', { name: /Start/ })
    expect(start).toHaveAccessibleDescription('The first day the reservation holds.')
    // With no `for`, a click on the label still reaches the control.
    fireEvent.click(screen.getByText('Start'))
    expect(start).toHaveFocus()
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

describe('a control placed in a Field', () => {
  const cases: [string, (props: object) => React.ReactElement, string][] = [
    ['Input', () => <Input />, 'textbox'],
    ['Textarea', () => <Textarea />, 'textbox'],
    ['NumberInput', () => <NumberInput />, 'textbox'],
    ['Select', () => <Select items={[{ value: 'a', label: 'A' }]} />, 'combobox'],
    ['Combobox', () => <Combobox items={['a']} />, 'combobox'],
    ['Switch', () => <Switch />, 'switch'],
    ['Checkbox', () => <Checkbox />, 'checkbox'],
    ['DatePicker', () => <DatePicker value="" onValueChange={() => {}} />, 'button'],
  ]
  it.each(cases)(
    '%s takes the label, description, help and error without a render function',
    (name, control, role) => {
      render(
        <Field label={name} description="Where it runs" help="Nearest is fastest" error="Pick one">
          {control({})}
        </Field>,
      )
      const element = screen.getByRole(role, { name })
      expect(element).toHaveAccessibleDescription('Where it runs Nearest is fastest Pick one')
      expect(element).toHaveAttribute('aria-invalid', 'true')
    },
  )

  it('still names a native element through the render function', () => {
    render(<Field label="Zone">{(control) => <select {...control} />}</Field>)
    expect(screen.getByRole('combobox', { name: 'Zone' })).toBeInTheDocument()
  })
})

describe('Field help', () => {
  // The tip's popup, as opposed to the hidden description the control reads.
  const tip = () => screen.queryByRole('dialog')
  // Focus as Tab moves it: the key goes down, then focus lands.
  const tabTo = (element: HTMLElement) => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab' })
    act(() => element.focus())
  }

  it('describes the control, and hides its ? from assistive technology and Tab', () => {
    render(
      <>
        <Field label="Name" description="Shown on the card." help="Lowercase letters.">
          <Input />
        </Field>
        <Field label="Zone" group help="Nearest is fastest.">
          {(control) => (
            <RadioGroup {...control}>
              <FieldOption>
                <Radio value="a" />A
              </FieldOption>
            </RadioGroup>
          )}
        </Field>
      </>,
    )
    const input = screen.getByRole('textbox', { name: 'Name' })
    expect(input).toHaveAccessibleDescription('Shown on the card. Lowercase letters.')
    expect(screen.getByRole('group', { name: 'Zone' })).toHaveAccessibleDescription(
      'Nearest is fastest.',
    )
    expect(screen.queryByRole('button', { name: /More info/ })).toBeNull()
    for (const help of screen.getAllByRole('button', { hidden: true })) {
      expect(help).toHaveAttribute('aria-hidden', 'true')
      expect(help).toHaveAttribute('tabindex', '-1')
    }
  })

  it('opens beside the control while it has keyboard focus, until Escape or blur', async () => {
    render(
      <>
        <Field label="Name" help="Lowercase letters.">
          <Input />
        </Field>
        <Field label="Size">
          <Input />
        </Field>
      </>,
    )
    const name = screen.getByRole('textbox', { name: 'Name' })
    tabTo(name)
    await waitFor(() => expect(tip()).toHaveTextContent('Lowercase letters.'))
    // Beside the control rather than over the label, so it covers nothing above the field.
    expect(tip()).toHaveAttribute('data-side', 'right')
    fireEvent.keyDown(name, { key: 'Escape' })
    await waitFor(() => expect(tip()).toBeNull())
    expect(name).toHaveFocus()

    act(() => name.blur())
    tabTo(name)
    await waitFor(() => expect(tip()).not.toBeNull())
    tabTo(screen.getByRole('textbox', { name: 'Size' }))
    await waitFor(() => expect(tip()).toBeNull())
  })

  it('takes the first Escape in a dialog, leaving the dialog open', async () => {
    const onClose = vi.fn()
    render(
      <Modal open onClose={onClose} title="Create">
        <Field label="Name" help="Lowercase letters.">
          <Input />
        </Field>
      </Modal>,
    )
    const name = await screen.findByRole('textbox', { name: 'Name' })
    act(() => name.blur())
    tabTo(name)
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(2))
    fireEvent.keyDown(name, { key: 'Escape' })
    await waitFor(() => expect(screen.getAllByRole('dialog')).toHaveLength(1))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('stays shut when the control is clicked, though a text box then matches :focus-visible', async () => {
    render(
      <Field label="Name" help="Lowercase letters.">
        <Input />
      </Field>,
    )
    const name = screen.getByRole('textbox', { name: 'Name' })
    tabTo(name)
    await waitFor(() => expect(tip()).not.toBeNull())
    fireEvent.pointerDown(document.body)
    act(() => name.blur())
    await waitFor(() => expect(tip()).toBeNull())
    fireEvent.pointerDown(name)
    act(() => name.focus())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(tip()).toBeNull()
  })

  it('keeps the ? in the Tab order when the help has a link to reach', () => {
    render(
      <Field label="Name" help="See [the guide](https://example.com).">
        <Input />
      </Field>,
    )
    const help = screen.getByRole('button', { name: /More info/ })
    expect(help).not.toHaveAttribute('tabindex', '-1')
    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveAccessibleDescription(
      /^See the guide/,
    )
  })

  it('sizes its label to match a small input given a label', () => {
    render(<Input label="Filter" size="sm" />)
    expect(screen.getByText('Filter').parentElement?.parentElement).toHaveClass('text-xs')
  })
})

describe('Field controlFirst', () => {
  const tip = () => screen.queryByRole('dialog')
  const tabTo = (element: HTMLElement) => {
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Tab' })
    act(() => element.focus())
  }

  it.each([
    ['Checkbox', () => <Checkbox />, 'checkbox'],
    ['Switch', () => <Switch />, 'switch'],
  ] as const)('puts a %s before its label, which names and toggles it', (name, make, role) => {
    render(
      <Field label={name} controlFirst description="Applies to new runs." help="Off by default.">
        {make()}
      </Field>,
    )
    const control = screen.getByRole(role, { name })
    const label = screen.getByText(name)
    expect(control.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(control).toHaveAccessibleDescription('Applies to new runs. Off by default.')
    expect(control).toHaveAttribute('aria-checked', 'false')
    fireEvent.click(label)
    expect(control).toHaveAttribute('aria-checked', 'true')
  })

  it('names a native checkbox through the render function, which a label click toggles', () => {
    render(
      <Field label="Notify me" controlFirst>
        {(control) => <input type="checkbox" {...control} />}
      </Field>,
    )
    const box = screen.getByRole('checkbox', { name: 'Notify me' })
    fireEvent.click(screen.getByText('Notify me'))
    expect(box).toBeChecked()
  })

  it('opens its help beside the control on keyboard focus, and keeps the ? out of Tab', async () => {
    render(
      <Field label="Archive" controlFirst help="Moves it out of the list.">
        <Checkbox />
      </Field>,
    )
    const box = screen.getByRole('checkbox', { name: 'Archive' })
    const help = screen.getByRole('button', { hidden: true })
    expect(help).toHaveAttribute('tabindex', '-1')
    tabTo(box)
    await waitFor(() => expect(tip()).toHaveTextContent('Moves it out of the list.'))
    expect(tip()).toHaveAttribute('data-side', 'right')
    fireEvent.keyDown(box, { key: 'Escape' })
    await waitFor(() => expect(tip()).toBeNull())
    expect(box).toHaveFocus()
  })

  it('marks the control invalid and reads its error', () => {
    render(
      <Field label="Accept the terms" controlFirst error="Accept to continue.">
        <Checkbox />
      </Field>,
    )
    const box = screen.getByRole('checkbox', { name: 'Accept the terms' })
    expect(box).toHaveAttribute('aria-invalid', 'true')
    expect(box).toHaveAccessibleDescription('Accept to continue.')
    expect(screen.getByRole('alert')).toHaveTextContent('Accept to continue.')
  })

  it('leaves a disabled control as it is when its label is clicked', () => {
    render(
      <Field label="Archive" controlFirst disabled>
        <Checkbox disabled />
      </Field>,
    )
    const box = screen.getByRole('checkbox', { name: 'Archive' })
    expect(box).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(screen.getByText('Archive'))
    expect(box).toHaveAttribute('aria-checked', 'false')
  })

  it('sits in the control column, under an empty label column, inline and in a row of fields', () => {
    const { container, rerender } = render(
      <Field label="Archive" controlFirst layout="inline">
        <Checkbox />
      </Field>,
    )
    const root = container.firstElementChild
    expect(root?.firstElementChild).toHaveAttribute('aria-hidden', 'true')
    expect(root?.firstElementChild).toHaveClass('w-52')
    rerender(
      <FieldRowContext value>
        <Field label="Archive" controlFirst>
          <Checkbox />
        </Field>
      </FieldRowContext>,
    )
    const box = screen.getByRole('checkbox', { name: 'Archive' })
    expect(box.closest('.row-start-2')).not.toBeNull()
  })
})
