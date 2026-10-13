// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { createWorkflowEngine } from '@parallelworks/workflow-parser'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { testEngine } from '../test/engine'
import { renderDynamicForm } from '../test/form'
import { DynamicForm } from './Form'
import type { FormLayoutNode } from './layout'

vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)

global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

afterEach(() => {
  cleanup()
  testEngine.convertInputs.mockImplementation((inputs) => inputs)
})

const layout: FormLayoutNode = {
  type: 'grid',
  columns: { base: 1, md: [2, 1] },
  children: [
    { type: 'field', field: 'name' },
    {
      type: 'section',
      label: 'Location',
      description: 'Choose where the job runs.',
      children: [
        { type: 'field', field: 'region' },
        { type: 'field', field: 'account' },
      ],
    },
  ],
}

const schema = {
  $meta: { layout },
  name: { type: 'string', label: 'Name' },
  region: { type: 'string', label: 'Region' },
  account: { type: 'string', label: 'Account' },
  note: { type: 'string', label: 'Note' },
}

describe('explicit form layouts', () => {
  it('binds actual controls to the original input names and appends unplaced fields', async () => {
    const { form } = renderDynamicForm(
      <DynamicForm
        formJSONs={schema}
        initialValues={{ name: 'job', region: 'west', account: 'research', note: '' }}
      />,
    )
    const name = await screen.findByRole('textbox', { name: /^Name/ })
    const section = screen.getByRole('group', { name: 'Location' })
    expect(section).toHaveAccessibleDescription('Choose where the job runs.')
    expect(section).toContainElement(screen.getByRole('textbox', { name: /^Account/ }))
    expect(screen.getAllByRole('textbox').map((input) => input.getAttribute('name'))).toEqual([
      'name',
      'region',
      'account',
      'note',
    ])
    fireEvent.change(name, { target: { value: 'new job' } })
    await waitFor(() =>
      expect(form.getValues()).toEqual({
        name: 'new job',
        region: 'west',
        account: 'research',
        note: '',
      }),
    )
  })

  it('keeps the section and saved values when a preceding field hides and the layout changes', async () => {
    const initialValues = { name: 'job', region: 'west', account: 'research' }
    const { form, rerender } = renderDynamicForm(
      <DynamicForm formJSONs={schema} initialValues={initialValues} workflowForm />,
    )
    fireEvent.change(await screen.findByRole('textbox', { name: /^Account/ }), {
      target: { value: 'edited' },
    })
    const reordered: FormLayoutNode = { ...layout, children: [...layout.children].reverse() }
    rerender(
      <DynamicForm
        formJSONs={{
          ...schema,
          $meta: { layout: reordered },
          region: { ...schema.region, hidden: true },
        }}
        initialValues={initialValues}
        workflowForm
      />,
    )
    await waitFor(() => expect(screen.queryByRole('textbox', { name: /^Region/ })).toBeNull())
    expect(screen.getByRole('group', { name: 'Location' })).toContainElement(
      screen.getByRole('textbox', { name: /^Account/ }),
    )
    expect(screen.getByRole('textbox', { name: /^Account/ })).toHaveValue('edited')
    expect(form.getValues()['region']).toBe('west')
    act(() => form.reset(initialValues))
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /^Account/ })).toHaveValue('research'),
    )
  })

  it.each([
    { type: 'field', field: 'unknown' },
    {
      type: 'stack',
      children: [
        { type: 'field', field: 'name' },
        { type: 'field', field: 'name' },
      ],
    },
  ])('shows every input once if authored layout references are invalid', async (invalid) => {
    render(<DynamicForm formJSONs={{ ...schema, $meta: { layout: invalid } }} initialValues={{}} />)
    await screen.findByRole('textbox', { name: /^Name/ })
    expect(screen.getAllByRole('textbox')).toHaveLength(4)
  })

  it('requires host opt-in for CSS and rejects unsupported declarations without hiding inputs', async () => {
    const styledSchema = {
      ...schema,
      $meta: {
        allowLayoutCSS: true,
        layout: { type: 'field', field: 'name', css: 'padding: 1rem;' },
      },
    }
    const { rerender } = render(
      <DynamicForm formJSONs={styledSchema} initialValues={{ name: 'job' }} />,
    )
    const field = (await screen.findByRole('textbox', { name: /^Name/ })).closest(
      '[data-layout-field]',
    )
    expect(field).not.toHaveAttribute('style')
    rerender(
      <DynamicForm formJSONs={styledSchema} initialValues={{ name: 'job' }} allowLayoutCSS />,
    )
    expect(field).toHaveAttribute('style', 'padding: 1rem;')
    rerender(
      <DynamicForm
        formJSONs={{
          ...styledSchema,
          $meta: {
            layout: { ...styledSchema.$meta.layout, css: 'padding: 1rem; position: fixed;' },
          },
        }}
        initialValues={{ name: 'job' }}
        allowLayoutCSS
      />,
    )
    expect(field?.getAttribute('style')).toBe('')
    expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveValue('job')
    expect(screen.getAllByRole('textbox')).toHaveLength(4)
  })

  it('keeps aligned sections named, described, and grouped in document order', async () => {
    render(
      <DynamicForm
        initialValues={{}}
        formJSONs={{
          ...schema,
          $meta: {
            layout: {
              type: 'grid',
              columns: { base: 1, md: 2 },
              align: 'rows',
              children: [
                {
                  type: 'section',
                  label: 'Identity',
                  description: 'Name this run.',
                  children: [{ type: 'field', field: 'name' }],
                },
                {
                  type: 'section',
                  label: 'Location',
                  children: [
                    { type: 'field', field: 'region' },
                    { type: 'field', field: 'account' },
                  ],
                },
              ],
            },
          },
        }}
      />,
    )
    await screen.findByRole('textbox', { name: /^Name/ })
    expect(screen.getByRole('group', { name: 'Identity' })).toHaveAccessibleDescription(
      'Name this run.',
    )
    expect(screen.getByRole('group', { name: 'Location' })).toContainElement(
      screen.getByRole('textbox', { name: /^Region/ }),
    )
    expect(screen.getAllByRole('textbox').map((input) => input.getAttribute('name'))).toEqual([
      'name',
      'region',
      'account',
      'note',
    ])
  })

  it('puts appearance on the complete section and keeps generated themes inside that section', async () => {
    const appearance =
      '--form-surface: #102030; --form-accent: #d4ed7a; padding: 1rem; font-size: 2rem;'
    const { rerender } = render(
      <DynamicForm
        formJSONs={{
          ...schema,
          $meta: {
            layout: {
              type: 'section',
              label: 'Styled section',
              css: appearance,
              children: [{ type: 'field', field: 'name' }],
            },
          },
        }}
        initialValues={{ name: 'job' }}
        allowLayoutCSS
      />,
    )
    await screen.findByRole('textbox', { name: /^Name/ })
    const section = screen.getByRole('group', { name: 'Styled section' })
    expect(section.style.getPropertyValue('--theme-app-bg')).toBe('#102030')
    expect(section.style.padding).toBe('1rem')
    expect(section.style.backgroundColor).toBe('rgb(16, 32, 48)')
    expect(section.querySelector('legend')?.style.fontSize).toBe('2rem')
    expect(document.documentElement.style.getPropertyValue('--theme-app-bg')).toBe('')
    expect(
      screen.getByRole('textbox', { name: /^Region/ }).closest('[data-layout-section]'),
    ).toBeNull()
    rerender(
      <DynamicForm
        formJSONs={{
          ...schema,
          $meta: {
            layout: {
              type: 'section',
              label: 'Styled section',
              css: appearance,
              children: [{ type: 'field', field: 'name' }],
            },
          },
        }}
        initialValues={{ name: 'job' }}
      />,
    )
    expect(section.style.getPropertyValue('--theme-app-bg')).toBe('')
    expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveValue('job')
  })

  it('renders authored section text literally and rejects CSS markup without affecting bindings', async () => {
    const title = '<img src=x onerror=alert(1)>'
    const description = '</style><script>alert(1)</script>'
    const { container } = render(
      <DynamicForm
        formJSONs={{
          ...schema,
          $meta: {
            layout: {
              type: 'section',
              label: title,
              description,
              css: 'padding: 1rem; </style><script>alert(1)</script>',
              children: [{ type: 'field', field: 'name' }],
            },
          },
        }}
        initialValues={{ name: 'original' }}
        allowLayoutCSS
      />,
    )
    await screen.findByRole('textbox', { name: /^Name/ })
    const section = screen.getByRole('group', { name: title })
    expect(section).toHaveAccessibleDescription(description)
    expect(section.style.length).toBe(0)
    expect(container.querySelector('script, img, style')).toBeNull()
    expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveValue('original')
  })

  it('uses local field references inside a converted group and a wizard page', async () => {
    testEngine.convertInputs.mockImplementation(createWorkflowEngine().convertInputs)
    const { form } = renderDynamicForm(
      <DynamicForm
        initialValues={{ settings: { name: 'nested' } }}
        formJSONs={{
          $meta: { wizard: { mode: 'wizard' } },
          setup: {
            type: 'step',
            title: 'Setup',
            options: {
              $meta: { layout: { type: 'field', field: 'settings' } },
              settings: {
                type: 'group',
                label: 'Settings',
                items: {
                  $meta: {
                    layout: {
                      type: 'section',
                      label: 'Identity',
                      children: [{ type: 'field', field: 'name' }],
                    },
                  },
                  name: { type: 'string', label: 'Name' },
                },
              },
            },
          },
        }}
      />,
    )
    const name = await screen.findByRole('textbox', { name: /^Name/ })
    expect(name).toHaveAttribute('name', 'settings.name')
    expect(name).toHaveValue('nested')
    fireEvent.change(name, { target: { value: 'changed' } })
    await waitFor(() => expect(form.getValues()).toEqual({ settings: { name: 'changed' } }))
  })
})
