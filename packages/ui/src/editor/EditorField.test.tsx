// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, screen } from '@testing-library/react'
import type { FieldComponentProps } from '../form/types/fieldComponentTypes'
import { renderInForm } from '../test/form'
import type { IEditorField } from './EditorField'
import EditorField from './EditorField'
import type { IEditorProps } from './Monaco'

// Mock the Editor as a textarea — also forwards `data-editor-key` so we can
// assert the React key (via DOM remount) and `data-value-passed` to assert
// what `value` prop EditorField actually passes through (undefined vs string).
vi.mock('./Editor', () => ({
  __esModule: true,
  default: ({ value, onChange }: IEditorProps) => (
    <textarea
      data-testid="mock-editor"
      data-value-passed={value === undefined ? 'undefined' : String(value)}
      defaultValue={value ?? ''}
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

    expect(screen.getByTestId('mock-editor')).toHaveAttribute('data-value-passed', 'my-script')
  })

  it('stops passing value to the editor once the user has edited it', () => {
    const { form } = renderInForm(<EditorField {...props} />, {
      testEditorField: 'initial',
      editorKeyPostfix: '',
    })

    const editor = screen.getByTestId('mock-editor')
    expect(editor).toHaveAttribute('data-value-passed', 'initial')

    act(() => {
      fireEvent.change(editor, { target: { value: 'user-typed' } })
    })
    expect(form.getValues('testEditorField')).toBe('user-typed')

    // A change from outside should NOT reset the editor's value prop: EditorField passes `undefined`
    // once the user has typed, so Monaco's model.setValue() never fires and the cursor stays put.
    act(() => {
      form.setValue('testEditorField', 'externally-set')
    })
    expect(editor).toHaveAttribute('data-value-passed', 'undefined')
  })

  it('forces editor remount when editorKeyPostfix changes', () => {
    const { form } = renderInForm(<EditorField {...props} />, {
      testEditorField: 'v1',
      editorKeyPostfix: 'k1',
    })

    const before = screen.getByTestId('mock-editor')
    act(() => {
      form.setValue('editorKeyPostfix', 'k2')
    })
    const after = screen.getByTestId('mock-editor')
    // React keying causes a fresh DOM node when the key changes.
    expect(after).not.toBe(before)
    // The new mount should re-show the current form value (touchedRef
    // resets because the component is a fresh instance).
    expect(after).toHaveAttribute('data-value-passed', 'v1')
  })
})
