// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, onTestFinished, vi } from 'vitest'
import { GrowingTextarea, StringListEditor, SuggestedInput } from './editorFields'
import { ValueOrInputField } from './inputRefs'

vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)

afterEach(cleanup)

describe('GrowingTextarea', () => {
  it('grows with each new value, not only the first', () => {
    // jsdom lays nothing out, so each line stands in as 20px of text.
    const scrollHeight = vi
      .spyOn(HTMLTextAreaElement.prototype, 'scrollHeight', 'get')
      .mockImplementation(function (this: HTMLTextAreaElement) {
        return this.value.split('\n').length * 20
      })
    onTestFinished(() => scrollHeight.mockRestore())
    const { rerender } = render(
      <GrowingTextarea aria-label="Notes" value="one" onChange={() => {}} />,
    )
    const area = screen.getByLabelText('Notes')
    expect(area.style.height).toBe('20px')
    rerender(<GrowingTextarea aria-label="Notes" value={'one\ntwo\nthree'} onChange={() => {}} />)
    expect(area.style.height).toBe('60px')
  })
})

describe('list and suggestion fields', () => {
  it('names each row of a list by the list and its place', () => {
    render(
      <StringListEditor
        label="Permissions"
        values={['read', 'write']}
        onChange={() => {}}
        addLabel="Add permission"
      />,
    )
    expect(screen.getByRole('combobox', { name: 'Permissions, item 1' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Permissions, item 2' })).toBeInTheDocument()
  })

  it('describes a field that suggests values with its help text', () => {
    render(
      <SuggestedInput
        label="Shell"
        description="The shell each step runs in."
        value=""
        onChange={() => {}}
        suggestions={['bash']}
      />,
    )
    expect(screen.getByRole('combobox', { name: 'Shell' })).toHaveAccessibleDescription(
      'The shell each step runs in.',
    )
  })

  it('describes a value-or-input field and says when it is required', () => {
    render(
      <ValueOrInputField
        label="Cluster"
        description="Where the job runs."
        value=""
        onChange={() => {}}
        source={{ refs: [] }}
        types={['compute-clusters']}
        required
      />,
    )
    const field = screen.getByRole('combobox', { name: 'Cluster' })
    expect(field).toHaveAccessibleDescription('Where the job runs.')
    expect(field).toHaveAttribute('aria-required', 'true')
  })
})
