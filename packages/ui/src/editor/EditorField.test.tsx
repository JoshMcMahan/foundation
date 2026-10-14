// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import type { FieldComponentProps } from '../form/types/fieldComponentTypes'
import { renderInForm } from '../test/form'
import type { IEditorField } from './EditorField'
import { EditorField } from './EditorField'
import type { EditorProps } from './Monaco'

// The editor as a textarea that shows the value it was last handed, as Monaco's sync does.
vi.mock('./Editor', () => ({
  Editor: ({ value, onChange, disabled }: EditorProps) => (
    <textarea
      data-testid="mock-editor"
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onChange?.(e.target.value)}
    />
  ),
}))

describe('EditorField', () => {
  const props: FieldComponentProps<IEditorField> = {
    field: { type: 'editor', name: 'testEditorField' },
    label: 'Test Editor Label',
    labelPosition: 'top',
    disabled: false,
  }

  it('passes the current form value through to the editor', () => {
    renderInForm(<EditorField {...props} />, { testEditorField: 'my-script' })

    expect(screen.getByTestId('mock-editor')).toHaveValue('my-script')
  })

  it('writes edits to the form and takes a value set from outside after them', () => {
    const { form } = renderInForm(<EditorField {...props} />, { testEditorField: 'initial' })
    const editor = screen.getByTestId('mock-editor')

    act(() => {
      fireEvent.change(editor, { target: { value: 'user-typed' } })
    })
    expect(form.getValues('testEditorField')).toBe('user-typed')
    expect(editor).toHaveValue('user-typed')

    // A reset reaches the editor without remounting it.
    act(() => {
      form.setValue('testEditorField', 'externally-set')
    })
    expect(screen.getByTestId('mock-editor')).toBe(editor)
    expect(editor).toHaveValue('externally-set')
  })

  it('disables the editor with the field', () => {
    renderInForm(<EditorField {...props} disabled />, { testEditorField: 'x' })

    expect(screen.getByTestId('mock-editor')).toBeDisabled()
  })
})
