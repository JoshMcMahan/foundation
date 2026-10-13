// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, waitFor } from '@testing-library/react'
import type { ComboboxItems } from '../components/Combobox'
import { renderInForm } from '../test/form'
import { useChoiceField } from './useChoiceField'

const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)))

let choose: (value: unknown) => void = () => {}

function Choice({
  items,
  ...props
}: Omit<Parameters<typeof useChoiceField>[0], 'name' | 'items'> & {
  items: ComboboxItems<unknown>
}) {
  const [, pick] = useChoiceField({ name: 'pick', items, ...props })
  choose = pick
  return null
}

describe('useChoiceField', () => {
  it('autoselects from a later group when the first group is empty', async () => {
    const onChange = vi.fn()
    const cluster = { id: 'managed-1', type: 'managed-cluster' }
    const { form } = renderInForm(
      <Choice
        onChange={onChange}
        items={[
          { label: 'My Clusters', items: [] },
          { label: 'Shared Clusters', items: [{ label: 'Managed Cluster', value: cluster }] },
        ]}
      />,
    )
    await waitFor(() => expect(form.getValues('pick')).toEqual(cluster))
    expect(onChange).toHaveBeenCalledWith(cluster)
  })

  it('autoselects the first enabled item, not a leading disabled one', async () => {
    const { form } = renderInForm(
      <Choice
        autoselect
        items={[
          { label: 'V100', value: 'v100', disabled: true },
          { label: 'T4', value: 't4' },
        ]}
      />,
    )
    await waitFor(() => expect(form.getValues('pick')).toBe('t4'))
  })

  it('keeps a choice when the items are rebuilt unchanged, and re-picks when they change', async () => {
    const sizes = (prefix: string) => [
      { label: 'A', value: `${prefix}a` },
      { label: 'B', value: `${prefix}b` },
    ]
    // A fresh array on every render, as a field that builds its items inline makes.
    const { form, rerender } = renderInForm(<Choice autoselect items={sizes('')} />)
    await waitFor(() => expect(form.getValues('pick')).toBe('a'))

    act(() => choose('b'))
    rerender(<Choice autoselect items={sizes('')} />)
    await settle()
    expect(form.getValues('pick')).toBe('b')

    rerender(<Choice autoselect items={sizes('next-')} />)
    await waitFor(() => expect(form.getValues('pick')).toBe('next-a'))
  })

  it('selects nothing when the only item is disabled', async () => {
    const onChange = vi.fn()
    renderInForm(
      <Choice onChange={onChange} items={[{ label: 'V100', value: 'v100', disabled: true }]} />,
    )
    await settle()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps a value the form already holds, matched by content', async () => {
    const onChange = vi.fn()
    const { form } = renderInForm(
      <Choice onChange={onChange} items={[{ label: 'Only', value: { id: 'a' } }]} />,
      { pick: { id: 'a' } },
    )
    await settle()
    expect(onChange).not.toHaveBeenCalled()
    expect(form.getValues('pick')).toEqual({ id: 'a' })
  })

  it('sets the secondary field from the chosen item, and marks the choice touched', async () => {
    const { form } = renderInForm(
      <Choice
        autoselect={false}
        secondaryField="zone"
        items={[{ label: 'East', value: 'east', secondaryValue: 'east-1' } as never]}
      />,
    )
    act(() => choose('east'))
    expect(form.getValues()).toMatchObject({ pick: 'east', zone: 'east-1' })
    expect(form.getFieldState('pick').isTouched).toBe(true)
  })
})
