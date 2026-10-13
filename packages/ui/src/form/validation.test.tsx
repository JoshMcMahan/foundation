// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DynamicForm, type DynamicFormProps } from './Form'

vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)

// A class, as the step row constructs one.
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

const textbox = (name: string) => screen.findByRole('textbox', { name: new RegExp(name) })
const type = async (name: string, value: string) =>
  fireEvent.change(await textbox(name), { target: { value } })
const next = () => fireEvent.click(screen.getByRole('button', { name: 'Go to next step' }))
const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Submit' }))

function renderForm(props: Partial<DynamicFormProps> & Pick<DynamicFormProps, 'formJSONs'>) {
  return render(<DynamicForm initialValues={{}} {...props} />)
}

describe('a field that needs a value', () => {
  const formJSONs = {
    name: { type: 'string', label: 'Name' },
    note: { type: 'string', label: 'Note', optional: true },
    region: { type: 'string', label: 'Region', default: 'east' },
    notify: { type: 'boolean', label: 'Notify' },
  }

  it('holds the submit while empty, says so under the field, and lets it go once filled', async () => {
    const onSubmit = vi.fn()
    renderForm({ formJSONs, onSubmit })
    await textbox('Name')
    submit()

    const name = await textbox('Name')
    await waitFor(() => expect(name).toHaveAttribute('aria-invalid', 'true'))
    expect(name).toHaveAccessibleDescription('Enter a value.')
    expect(onSubmit).not.toHaveBeenCalled()
    // Only the field with neither `optional` nor a default holds the form.
    expect(await textbox('Note')).not.toHaveAttribute('aria-invalid')
    expect(await textbox('Region')).not.toHaveAttribute('aria-invalid')

    await type('Name', 'demo')
    await waitFor(() => expect(name).not.toHaveAttribute('aria-invalid'))
    submit()
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ name: 'demo' })),
    )
  })

  it('says nothing before the first submit', async () => {
    renderForm({ formJSONs, onSubmit: vi.fn() })
    await type('Name', 'a')
    await type('Name', '')
    expect(await textbox('Name')).not.toHaveAttribute('aria-invalid')
  })

  it('holds nothing back while hidden', async () => {
    const onSubmit = vi.fn()
    renderForm({
      formJSONs: {
        advanced: { type: 'boolean', label: 'Advanced', default: false },
        secret: { type: 'string', label: 'Secret', show_if: 'advanced' },
      },
      onSubmit,
    })
    await screen.findByRole('switch', { name: 'Advanced' })
    submit()
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())

    fireEvent.click(screen.getByRole('switch', { name: 'Advanced' }))
    submit()
    const secret = await textbox('Secret')
    await waitFor(() => expect(secret).toHaveAttribute('aria-invalid', 'true'))
    expect(onSubmit).toHaveBeenCalledTimes(1)
  })
})

describe('a wizard page with a field that needs a value', () => {
  const formJSONs = {
    $meta: { wizard: { mode: 'wizard' } },
    first: { type: 'step', title: 'First', options: { name: { type: 'string', label: 'Name' } } },
    second: {
      type: 'step',
      title: 'Second',
      options: { size: { type: 'string', label: 'Size', default: 'small' } },
    },
  }

  it('holds Next until the field is filled', async () => {
    renderForm({ formJSONs })
    await textbox('Name')
    next()
    await waitFor(() =>
      expect(screen.getByText('Please fix errors before proceeding')).toBeVisible(),
    )
    expect(await textbox('Name')).toHaveAccessibleDescription('Enter a value.')
    expect(screen.queryByRole('textbox', { name: /Size/ })).toBeNull()

    await type('Name', 'demo')
    await waitFor(async () => expect(await textbox('Name')).not.toHaveAttribute('aria-invalid'))
    next()
    expect(await textbox('Size')).toBeInTheDocument()
  })

  it("holds a repeated page's copy, as a row of a list", async () => {
    renderForm({
      formJSONs: {
        $meta: { wizard: { mode: 'wizard' } },
        hosts: {
          type: 'step',
          title: 'Host',
          multi: true,
          options: { host: { type: 'string', label: 'Host name' } },
        },
        review: { type: 'step', title: 'Review', options: {} },
      },
      initialValues: { hosts: [{ host: 'a' }, {}] },
    })
    await textbox('Host name')
    next()
    await waitFor(async () => expect(await textbox('Host name')).toHaveValue(''))
    next()
    await waitFor(async () =>
      expect(await textbox('Host name')).toHaveAttribute('aria-invalid', 'true'),
    )
  })
})

describe("the server's errors", () => {
  const formJSONs = {
    name: { type: 'string', label: 'Name', default: 'demo' },
    size: { type: 'string', label: 'Size', default: 'small' },
  }

  it("shows each message under its field, or asks to check it, and clears one when it's changed", async () => {
    renderForm({
      formJSONs,
      serverErrors: [{ path: 'name', message: 'That name is taken.' }, { path: '#/size' }],
    })
    const name = await textbox('Name')
    await waitFor(() => expect(name).toHaveAccessibleDescription('That name is taken.'))
    expect(await textbox('Size')).toHaveAccessibleDescription('Check this value.')

    await type('Name', 'other')
    await waitFor(() => expect(name).not.toHaveAttribute('aria-invalid'))
    expect(await textbox('Size')).toHaveAttribute('aria-invalid', 'true')
  })

  it('never hold back a submit, and stay through it', async () => {
    const onSubmit = vi.fn()
    renderForm({ formJSONs, onSubmit, serverErrors: [{ path: 'name', message: 'Taken.' }] })
    await waitFor(async () => expect(await textbox('Name')).toHaveAccessibleDescription('Taken.'))
    submit()
    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(await textbox('Name')).toHaveAccessibleDescription('Taken.')
  })

  const wizard = {
    $meta: { wizard: { mode: 'wizard' } },
    hosts: {
      type: 'step',
      title: 'Host',
      multi: true,
      options: { host: { type: 'string', label: 'Host name' } },
    },
    review: {
      type: 'step',
      title: 'Review',
      options: { note: { type: 'string', label: 'Note', optional: true } },
    },
  }
  const initialValues = { hosts: [{ host: 'a' }, { host: 'b' }] }

  it.each([
    ['a workflow path', 'hosts[1].host'],
    ['a JSON Pointer', '#/hosts/1/host'],
    ["the store's path", 'hosts.1.host'],
  ])('turn a wizard to the first page holding one, given %s', async (_, path) => {
    renderForm({
      formJSONs: wizard,
      initialValues,
      serverErrors: [{ path, message: 'Unreachable.' }],
    })
    await waitFor(async () => expect(await textbox('Host name')).toHaveValue('b'))
    expect(await textbox('Host name')).toHaveAccessibleDescription('Unreachable.')
  })

  it('never hold back Next', async () => {
    renderForm({
      formJSONs: wizard,
      initialValues,
      serverErrors: [{ path: 'hosts[0].host', message: 'Unreachable.' }],
    })
    await waitFor(async () =>
      expect(await textbox('Host name')).toHaveAccessibleDescription('Unreachable.'),
    )
    next()
    await waitFor(async () => expect(await textbox('Host name')).toHaveValue('b'))
  })
})
