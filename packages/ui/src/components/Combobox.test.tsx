// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'
import { Autocomplete, Combobox, type ComboboxItems } from './Combobox'
import { UIProvider } from './Provider'

// jsdom has no layout, so the virtual list would measure its scroller as empty and draw no rows.
beforeAll(() => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(240)
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(240)
})

const sizes = [
  { label: 'Small', value: 'small' },
  { label: 'Medium', value: 'medium' },
  { label: 'Large', value: 'large', disabled: true },
]

function Single({
  items = sizes,
  initial = null,
  onValueChange,
}: {
  items?: ComboboxItems<unknown>
  initial?: unknown
  onValueChange?: (value: unknown) => void
}) {
  const [value, setValue] = useState<unknown>(initial)
  return (
    <Combobox<unknown>
      aria-label="Size"
      items={items}
      value={value}
      onValueChange={(next) => {
        setValue(next)
        onValueChange?.(next)
      }}
    />
  )
}

const open = () => {
  fireEvent.click(screen.getByTestId('combobox-button'))
  return screen.findByRole('listbox')
}

describe('Combobox', () => {
  it('shows the selected item label in the field', () => {
    render(<Single initial="medium" />)
    expect(screen.getByRole('combobox', { name: 'Size' })).toHaveValue('Medium')
  })

  it('selects the value of the clicked item', async () => {
    const onValueChange = vi.fn()
    render(<Single onValueChange={onValueChange} />)
    fireEvent.click(within(await open()).getByRole('option', { name: 'Small' }))
    expect(onValueChange).toHaveBeenLastCalledWith('small')
    expect(screen.getByRole('combobox')).toHaveValue('Small')
  })

  it('does not select a disabled item', async () => {
    const onValueChange = vi.fn()
    render(<Single onValueChange={onValueChange} />)
    fireEvent.click(within(await open()).getByRole('option', { name: 'Large' }))
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('filters by label and by the heading an item sits under', async () => {
    render(
      <Single
        items={[
          { label: 'alpha', items: [{ label: 'Login node', value: 'login:alpha' }] },
          { label: 'beta', items: [{ label: 'Login node', value: 'login:beta' }] },
        ]}
      />,
    )
    const list = await open()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'bet' } })
    expect(within(list).getAllByRole('option')).toHaveLength(1)
    expect(within(list).getByText('beta')).toBeInTheDocument()
  })

  it('ignores hyphens when matching', async () => {
    render(<Single items={[{ label: 'us-east', value: 'us-east' }, 'eu-west']} />)
    const list = await open()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'useast' } })
    expect(
      within(list)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['us-east'])
  })

  it('matches recreated object values by content', () => {
    render(
      <Single
        items={[{ label: 'einstein', value: { id: 'cluster-1' } }]}
        initial={{ id: 'cluster-1' }}
      />,
    )
    expect(screen.getByRole('combobox')).toHaveValue('einstein')
  })

  it('labels a value no item has with itemToStringLabel', () => {
    render(
      <Combobox<{ name: string }>
        aria-label="Cluster"
        items={[]}
        value={{ name: 'retired' }}
        itemToStringLabel={(value) => value.name}
      />,
    )
    expect(screen.getByRole('combobox')).toHaveValue('retired')
  })

  it("shows the selection's icon until the text no longer names it", async () => {
    render(
      <Single
        items={[{ label: 'einstein', value: 'einstein', icon: <span data-testid="icon" /> }]}
        initial="einstein"
      />,
    )
    expect(screen.getByTestId('icon')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'ei' } })
    expect(screen.queryByTestId('icon')).not.toBeInTheDocument()
  })

  it('passes the field props to the input', () => {
    render(<p id="hint">Where the job runs.</p>)
    render(
      <Combobox
        id="cluster"
        aria-label="Cluster"
        aria-describedby="hint"
        aria-invalid
        placeholder="Pick one"
        disabled
        items={sizes}
      />,
    )
    const input = screen.getByRole('combobox', { name: 'Cluster' })
    expect(input).toHaveAttribute('id', 'cluster')
    expect(input).toHaveAttribute('placeholder', 'Pick one')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Where the job runs.')
    expect(input).toBeDisabled()
  })

  it('reports that nothing matches', async () => {
    render(<Single />)
    await open()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'zzz' } })
    expect(await screen.findByText('No options found')).toBeInTheDocument()
  })

  describe('multiple', () => {
    function Multiple({ onValueChange }: { onValueChange?: (value: string[]) => void }) {
      const [value, setValue] = useState<string[]>(['small'])
      return (
        <Combobox
          multiple
          aria-label="Sizes"
          items={sizes}
          value={value}
          onValueChange={(next) => {
            setValue(next)
            onValueChange?.(next)
          }}
        />
      )
    }

    it('adds the clicked item to the values', async () => {
      const onValueChange = vi.fn()
      render(<Multiple onValueChange={onValueChange} />)
      fireEvent.click(within(await open()).getByRole('option', { name: 'Medium' }))
      expect(onValueChange).toHaveBeenLastCalledWith(['small', 'medium'])
    })

    it('removes a value with its chip', async () => {
      const onValueChange = vi.fn()
      render(<Multiple onValueChange={onValueChange} />)
      fireEvent.click(screen.getByRole('button', { name: 'Remove Small' }))
      expect(onValueChange).toHaveBeenLastCalledWith([])
    })

    it('keeps its values on Escape with the list closed, and lets the key through', () => {
      const onValueChange = vi.fn()
      const onKeyDown = vi.fn()
      render(
        // biome-ignore lint/a11y/noStaticElementInteractions: listens for the key the field lets through
        <div onKeyDown={(e) => onKeyDown(e.key)}>
          <Multiple onValueChange={onValueChange} />
        </div>,
      )
      fireEvent.keyDown(screen.getByRole('combobox', { name: 'Sizes' }), { key: 'Escape' })
      expect(onValueChange).not.toHaveBeenCalled()
      expect(screen.getByRole('button', { name: 'Remove Small' })).toBeInTheDocument()
      expect(onKeyDown).toHaveBeenCalledWith('Escape')
    })

    it('shows a chip for each of two values that share a label, and removes the one pressed', () => {
      const onValueChange = vi.fn()
      render(
        <Combobox
          multiple
          aria-label="Owners"
          items={[
            { value: 'u1', label: 'Sam Lee' },
            { value: 'u2', label: 'Sam Lee' },
          ]}
          defaultValue={['u1', 'u2']}
          onValueChange={onValueChange}
        />,
      )
      const removes = screen.getAllByRole('button', { name: 'Remove Sam Lee' })
      expect(removes).toHaveLength(2)
      fireEvent.click(removes[1] as HTMLElement)
      expect(onValueChange).toHaveBeenLastCalledWith(['u1'])
    })

    it('names an option by its label and describes it by its description', async () => {
      render(
        <Combobox
          aria-label="Size"
          items={[{ value: 's', label: 'Small', description: '2 vCPU' }]}
        />,
      )
      const list = await open()
      expect(within(list).getByRole('option', { name: 'Small' })).toHaveAccessibleDescription(
        '2 vCPU',
      )
    })

    it('names the remove button from the Provider, so a language can order the words', () => {
      render(
        <UIProvider strings={{ dropdown: { removeValue: (label) => `${label} entfernen` } }}>
          <Multiple />
        </UIProvider>,
      )
      expect(screen.getByRole('button', { name: 'Small entfernen' })).toBeInTheDocument()
    })
  })

  describe('creatable', () => {
    function Tags({
      initial = [],
      maxItems,
      onValueChange,
    }: {
      initial?: string[]
      maxItems?: number
      onValueChange?: (value: string[]) => void
    }) {
      const [value, setValue] = useState<string[]>(initial)
      return (
        <Combobox
          multiple
          creatable
          maxItems={maxItems}
          maxLength={12}
          aria-label="Tags"
          placeholder="Add a tag"
          items={['python', 'gpu']}
          value={value}
          onValueChange={(next) => {
            setValue(next)
            onValueChange?.(next)
          }}
        />
      )
    }

    // Typed, as a keyboard does it: Base UI highlights the leading row only for typed input.
    const type = (input: HTMLElement, value: string) => {
      input.focus()
      fireEvent.input(input, { target: { value }, inputType: 'insertText' })
    }

    it('adds typed text the list lacks as a value with Enter', async () => {
      const onValueChange = vi.fn()
      render(<Tags onValueChange={onValueChange} />)
      const input = screen.getByRole('combobox', { name: 'Tags' })
      await open()
      type(input, 'py')
      // The add row leads, ahead of the suggestion the text also matches.
      const options = await screen.findAllByRole('option')
      expect(options.map((option) => option.textContent)).toEqual(['Add “py”', 'python'])
      fireEvent.keyDown(input, { key: 'Enter' })
      await waitFor(() => expect(onValueChange).toHaveBeenLastCalledWith(['py']))
      expect(screen.getByRole('button', { name: 'Remove py' })).toBeInTheDocument()
    })

    it('offers no add row for text already listed or chosen, in any case', async () => {
      render(<Tags initial={['gpu']} />)
      const input = screen.getByRole('combobox', { name: 'Tags' })
      await open()
      type(input, 'PYTHON')
      expect(await screen.findByRole('option', { name: 'python' })).toBeInTheDocument()
      expect(screen.queryByRole('option', { name: /^Add/ })).not.toBeInTheDocument()
      type(input, 'Gpu')
      await waitFor(() =>
        expect(screen.queryByRole('option', { name: /^Add/ })).not.toBeInTheDocument(),
      )
    })

    it('takes no more than maxItems values, and limits typed length', async () => {
      render(<Tags initial={['gpu', 'cpu']} maxItems={2} />)
      const input = screen.getByRole('combobox', { name: 'Tags' })
      expect(input).toHaveAttribute('maxLength', '12')
      expect(input).toHaveAttribute('placeholder', 'Up to 2')
      type(input, 'py')
      const python = await screen.findByRole('option', { name: 'python' })
      expect(python).toHaveAttribute('aria-disabled', 'true')
      expect(screen.queryByRole('option', { name: /^Add/ })).not.toBeInTheDocument()
    })
  })
})

describe('Autocomplete', () => {
  function Field({ onValueChange }: { onValueChange: (value: string) => void }) {
    const [value, setValue] = useState('')
    return (
      <Autocomplete
        aria-label="When to run"
        items={[{ label: 'Always, even after a failure', value: 'always' }, 'never']}
        value={value}
        onValueChange={(next) => {
          setValue(next)
          onValueChange(next)
        }}
      />
    )
  }

  it('takes any typed text as the value', async () => {
    const onValueChange = vi.fn()
    render(<Field onValueChange={onValueChange} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'When to run' }), {
      target: { value: 'failure()' },
    })
    expect(onValueChange).toHaveBeenLastCalledWith('failure()')
  })

  it('hides the suggestions while none match the typed text', async () => {
    render(<Field onValueChange={() => {}} />)
    await open()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'a new value' } })
    const popup = screen.getByRole('listbox').closest('[data-side]')
    await waitFor(() => expect(popup).toHaveAttribute('data-empty'))
    expect(popup).toHaveClass('data-empty:hidden')
  })

  it('fills the field with a suggestion value, found by its label', async () => {
    const onValueChange = vi.fn()
    render(<Field onValueChange={onValueChange} />)
    await open()
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'even after' } })
    fireEvent.click(await screen.findByRole('option', { name: /Always/ }))
    expect(onValueChange).toHaveBeenLastCalledWith('always')
  })
})

describe('Combobox with a button trigger', () => {
  function Pill({ onValueChange }: { onValueChange?: (value: string | null) => void }) {
    const [value, setValue] = useState<string | null>(null)
    return (
      <Combobox
        aria-label="Size"
        placeholder="Search"
        items={sizes}
        value={value}
        onValueChange={(next) => {
          setValue(next)
          onValueChange?.(next)
        }}
        trigger={<button type="button">{value ?? 'Pick a size'}</button>}
      />
    )
  }

  it('opens from the button with the search input inside the popup', async () => {
    render(<Pill />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Size' }))
    const list = await screen.findByRole('listbox')
    fireEvent.change(screen.getByPlaceholderText('Search'), { target: { value: 'med' } })
    expect(within(list).getByRole('option', { name: 'Medium' })).toBeInTheDocument()
    expect(within(list).queryByRole('option', { name: 'Small' })).not.toBeInTheDocument()
  })

  it('selects into the value the button shows', async () => {
    const onValueChange = vi.fn()
    render(<Pill onValueChange={onValueChange} />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Size' }))
    fireEvent.click(
      within(await screen.findByRole('listbox')).getByRole('option', { name: 'Small' }),
    )
    expect(onValueChange).toHaveBeenLastCalledWith('small')
    await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument())
    expect(screen.getByRole('combobox', { name: 'Size' })).toHaveTextContent('small')
  })
})

describe('Combobox group headings', () => {
  const providers: ComboboxItems<string> = [
    {
      label: 'Gateway',
      icon: <svg data-testid="gateway-logo" />,
      description: 'Shared by bob',
      items: [{ label: 'Large', value: 'gateway/large' }],
    },
    { label: 'gpu-session', description: 'Not responding', items: [] },
    { label: 'Pool', items: [{ label: 'Small', value: 'pool/small' }] },
  ]

  function Picker() {
    const [value, setValue] = useState<string | null>(null)
    return (
      <Combobox
        aria-label="Model"
        placeholder="Search models"
        items={providers}
        value={value}
        onValueChange={setValue}
        trigger={<button type="button">{value ?? 'Pick a model'}</button>}
      />
    )
  }

  const headings = (list: HTMLElement) =>
    [...list.querySelectorAll('[role="presentation"][data-index]')].map((h) => h.textContent)

  it('shows each heading with its icon and description, status groups in place', async () => {
    render(<Picker />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Model' }))
    const list = await screen.findByRole('listbox')
    expect(headings(list)).toEqual([
      'Gateway· Shared by bob',
      'gpu-session· Not responding',
      'Pool',
    ])
    expect(within(list).getByTestId('gateway-logo')).toBeInTheDocument()
    expect(within(list).getAllByRole('option')).toHaveLength(2)
  })

  it('lists items between groups where they sit, without a heading', async () => {
    render(
      <Combobox
        aria-label="Zone"
        items={[
          { label: 'None', value: '' },
          { label: 'Americas', items: [{ label: 'East', value: 'east' }] },
          'other',
        ]}
        value={null}
        onValueChange={() => {}}
      />,
    )
    const list = await open()
    expect(headings(list)).toEqual(['Americas'])
    expect(
      within(list)
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['None', 'East', 'other'])
  })

  it('searches headings, keeping a status group only while it matches', async () => {
    render(<Picker />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Model' }))
    const list = await screen.findByRole('listbox')
    const search = screen.getByPlaceholderText('Search models')

    fireEvent.change(search, { target: { value: 'gateway' } })
    await waitFor(() => expect(headings(list)).toEqual(['Gateway· Shared by bob']))
    expect(within(list).getByRole('option', { name: 'Large' })).toBeInTheDocument()

    fireEvent.change(search, { target: { value: 'gpu' } })
    await waitFor(() => expect(headings(list)).toEqual(['gpu-session· Not responding']))
    expect(within(list).queryAllByRole('option')).toHaveLength(0)
  })

  it('shows a pane for the highlighted item, hidden from assistive technology', async () => {
    const onItemHighlighted = vi.fn()
    render(
      <Combobox
        multiple
        aria-label="Size"
        items={sizes.map((size) => ({ ...size, accessibleDescription: `${size.label}, in stock` }))}
        details={(value) => <p>Details of {value ?? 'nothing'}</p>}
        onItemHighlighted={onItemHighlighted}
      />,
    )
    const field = screen.getByRole('combobox', { name: 'Size' })
    fireEvent.keyDown(field, { key: 'ArrowDown' })
    await screen.findByRole('listbox')
    fireEvent.keyDown(field, { key: 'ArrowDown' })
    await waitFor(() => expect(onItemHighlighted).toHaveBeenCalledWith(expect.any(String)))
    const highlighted = onItemHighlighted.mock.lastCall?.[0]
    expect(screen.getByTestId('combobox-details')).toHaveAttribute('aria-hidden', 'true')
    // The pane follows the highlight.
    expect(screen.getByTestId('combobox-details')).toHaveTextContent(`Details of ${highlighted}`)
    expect(screen.getByRole('option', { name: 'Small' })).toHaveAccessibleDescription(
      'Small, in stock',
    )
  })

  it('leaves filtering to a host that searches for itself', async () => {
    const onQueryChange = vi.fn()
    render(<Combobox aria-label="Size" items={sizes} onQueryChange={onQueryChange} loading />)
    const list = await open()
    const field = screen.getByRole('combobox', { name: 'Size' })
    fireEvent.change(field, { target: { value: 'zzz' } })
    expect(onQueryChange).toHaveBeenLastCalledWith('zzz')
    // Nothing matches "zzz", but the host's items show as given.
    expect(within(list).getAllByRole('option')).toHaveLength(3)
    expect(screen.getByRole('status')).toHaveTextContent('Searching…')
  })
})

describe('Combobox as a picker', () => {
  const teams = [
    { label: 'Platform', value: 'plat', hint: 'PLT' },
    { label: 'Design', value: 'des', hint: 'DES' },
    { label: 'Docs', value: 'doc', hint: 'DOC' },
  ]
  function Picker({
    initial = null,
    onValueChange,
    onCreate,
    controlled = false,
  }: {
    initial?: string | null
    onValueChange?: (value: string | null) => void
    onCreate?: (text: string) => void
    controlled?: boolean
  }) {
    const [value, setValue] = useState<string | null>(initial)
    const [open, setOpen] = useState(false)
    return (
      <>
        {controlled && (
          <button type="button" onClick={() => setOpen(true)}>
            Shortcut
          </button>
        )}
        <Combobox
          aria-label="Team"
          placeholder="Search"
          items={teams}
          value={value}
          onValueChange={(next) => {
            setValue(next)
            onValueChange?.(next)
          }}
          onCreate={onCreate}
          {...(controlled && { open, onOpenChange: setOpen })}
          trigger={<button type="button">{value ?? 'No team'}</button>}
        />
      </>
    )
  }
  const typeIn = (value: string) => {
    const input = screen.getByPlaceholderText('Search')
    input.focus()
    fireEvent.input(input, { target: { value }, inputType: 'insertText' })
    return input
  }

  it('reads a row by its label and then its hint', async () => {
    render(<Picker />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Team' }))
    expect(await screen.findByRole('option', { name: 'Design DES' })).toBeInTheDocument()
  })

  it('opens on a row, so Enter picks at once', async () => {
    const onValueChange = vi.fn()
    render(<Picker onValueChange={onValueChange} />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Team' }))
    await screen.findByRole('listbox')
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Platform/ })).toHaveAttribute('data-highlighted'),
    )
    fireEvent.keyDown(screen.getByPlaceholderText('Search'), { key: 'Enter' })
    await waitFor(() => expect(onValueChange).toHaveBeenLastCalledWith('plat'))
  })

  it('opens on the chosen row, with the whole list to search', async () => {
    render(<Picker initial="des" />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Team' }))
    await screen.findByRole('listbox')
    expect(screen.getByPlaceholderText('Search')).toHaveValue('')
    expect(screen.getAllByRole('option')).toHaveLength(3)
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Design/ })).toHaveAttribute('data-highlighted'),
    )
  })

  it('keeps the first match highlighted while typing', async () => {
    const onValueChange = vi.fn()
    render(<Picker onValueChange={onValueChange} />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Team' }))
    await screen.findByRole('listbox')
    const input = typeIn('do')
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Docs/ })).toHaveAttribute('data-highlighted'),
    )
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(onValueChange).toHaveBeenLastCalledWith('doc'))
  })

  it('opens on the chosen row when its host opens it', async () => {
    render(<Picker controlled initial="doc" />)
    fireEvent.click(screen.getByRole('button', { name: 'Shortcut' }))
    await screen.findByRole('listbox')
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /Docs/ })).toHaveAttribute('data-highlighted'),
    )
  })

  it('opens and closes as its host says', async () => {
    render(<Picker controlled />)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Shortcut' }))
    expect(await screen.findByRole('listbox')).toBeInTheDocument()
  })

  it('hands typed text no item has to onCreate, picking nothing itself', async () => {
    const onCreate = vi.fn()
    const onValueChange = vi.fn()
    render(<Picker onCreate={onCreate} onValueChange={onValueChange} />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Team' }))
    await screen.findByRole('listbox')
    typeIn('Research')
    fireEvent.click(await screen.findByRole('option', { name: 'Create “Research”' }))
    expect(onCreate).toHaveBeenCalledWith('Research')
    expect(onValueChange).not.toHaveBeenCalled()
  })

  it('offers no create row for text an item has', async () => {
    render(<Picker onCreate={vi.fn()} />)
    fireEvent.click(screen.getByRole('combobox', { name: 'Team' }))
    await screen.findByRole('listbox')
    typeIn('docs')
    expect(await screen.findByRole('option', { name: /Docs/ })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /^Create/ })).not.toBeInTheDocument()
  })
})

describe('Combobox tag entry', () => {
  function TagField({
    onValueChange,
    items = [],
    suggested,
    addOnBlur = false,
  }: {
    onValueChange?: (value: string[]) => void
    items?: string[]
    suggested?: string[]
    addOnBlur?: boolean
  }) {
    const [value, setValue] = useState<string[]>([])
    return (
      <Combobox
        multiple
        creatable
        aria-label="Tags"
        items={items}
        value={value}
        maxItems={3}
        separators={[',']}
        addOnBlur={addOnBlur}
        suggested={suggested}
        createValue={(typed) => typed.trim().toLowerCase().slice(0, 30) || undefined}
        onValueChange={(next) => {
          setValue(next)
          onValueChange?.(next)
        }}
      />
    )
  }
  const typeIn = (input: HTMLElement, value: string) => {
    input.focus()
    fireEvent.input(input, { target: { value }, inputType: 'insertText' })
  }

  it('shows no button and no empty list with nothing to pick from', () => {
    render(<TagField />)
    expect(screen.queryByTestId('combobox-button')).not.toBeInTheDocument()
  })

  it('adds what is typed on a separator, through createValue', async () => {
    const onValueChange = vi.fn()
    render(<TagField onValueChange={onValueChange} />)
    const input = screen.getByRole('combobox', { name: 'Tags' })
    typeIn(input, 'Climate ')
    fireEvent.keyDown(input, { key: ',' })
    expect(onValueChange).toHaveBeenLastCalledWith(['climate'])
    expect(screen.getByRole('button', { name: 'Remove climate' })).toBeInTheDocument()
    expect(input).toHaveValue('')
  })

  it('splits pasted text on the separators, up to maxItems and without repeats', () => {
    const onValueChange = vi.fn()
    render(<TagField onValueChange={onValueChange} />)
    const input = screen.getByRole('combobox', { name: 'Tags' })
    fireEvent.paste(input, { clipboardData: { getData: () => 'a, B,b, c, d' } })
    expect(onValueChange).toHaveBeenLastCalledWith(['a', 'b', 'c'])
  })

  it('adds what is half typed on leaving the field, with addOnBlur', () => {
    const onValueChange = vi.fn()
    render(<TagField onValueChange={onValueChange} addOnBlur />)
    const input = screen.getByRole('combobox', { name: 'Tags' })
    typeIn(input, 'Ocean')
    fireEvent.blur(input)
    expect(onValueChange).toHaveBeenLastCalledWith(['ocean'])
  })

  it('offers suggested values as chips under the field, which leave once chosen', () => {
    render(<TagField suggested={['wind', 'solar']} />)
    const group = screen.getByRole('group', { name: 'Suggested' })
    fireEvent.click(within(group).getByRole('button', { name: 'Add “wind”' }))
    expect(screen.getByRole('button', { name: 'Remove wind' })).toBeInTheDocument()
    expect(within(group).queryByRole('button', { name: 'Add “wind”' })).not.toBeInTheDocument()
    expect(within(group).getByRole('button', { name: 'Add “solar”' })).toBeInTheDocument()
  })

  it('removes the last value with Backspace in an empty field', async () => {
    render(<TagField />)
    const input = screen.getByRole('combobox', { name: 'Tags' })
    typeIn(input, 'ocean')
    fireEvent.keyDown(input, { key: ',' })
    expect(screen.getByRole('button', { name: 'Remove ocean' })).toBeInTheDocument()
    fireEvent.keyDown(input, { key: 'Backspace' })
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Remove ocean' })).not.toBeInTheDocument(),
    )
  })
})
