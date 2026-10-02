// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { Form, Formik, type FormikValues, useFormikContext } from 'formik'
import { useEffect } from 'react'
import type { FieldComponentProps } from '../form/types/fieldComponentTypes'
import type { IEditorField } from './EditorField'
import EditorField from './EditorField'
import type { IEditorProps } from './Monaco'

global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

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

// Test helper that lets us mutate Formik state from outside the form.
function StateController({
  onReady,
}: {
  onReady: (api: { setValue: (v: string) => void; setPostfix: (p: string) => void }) => void
}) {
  const { setFieldValue } = useFormikContext<FormikValues>()
  useEffect(() => {
    onReady({
      setValue: (v) => setFieldValue('testEditorField', v),
      setPostfix: (p) => setFieldValue('editorKeyPostfix', p),
    })
  }, [onReady, setFieldValue])
  return null
}

describe('EditorField', () => {
  const createProps = (
    fieldOverrides: Partial<IEditorField> = {},
    propsOverrides: Partial<FieldComponentProps<IEditorField>> = {},
  ): FieldComponentProps<IEditorField> => ({
    field: {
      type: 'editor',
      name: 'testEditorField',
      ...fieldOverrides,
    },
    label: 'Test Editor Label',
    labelPosition: 'top',
    missing: false,
    missingFields: [],
    values: {},
    setFormDirty: vi.fn(),
    disabled: false,
    currentValue: undefined,
    ...propsOverrides,
  })

  it('passes the current Formik value through to the editor', () => {
    const props = createProps({ default: 'default-script' })
    render(
      <Formik initialValues={{ testEditorField: 'my-script' }} onSubmit={vi.fn()}>
        <Form>
          <EditorField {...props} />
        </Form>
      </Formik>,
    )

    expect(screen.getByTestId('mock-editor')).toHaveAttribute('data-value-passed', 'my-script')
  })

  it('stops passing value to the editor once the user has edited it', async () => {
    vi.useFakeTimers()
    const props = createProps()
    let api: {
      setValue: (v: string) => void
      setPostfix: (p: string) => void
    } = { setValue: () => {}, setPostfix: () => {} }
    render(
      <Formik
        initialValues={{ testEditorField: 'initial', editorKeyPostfix: '' }}
        onSubmit={vi.fn()}
      >
        <Form>
          <StateController onReady={(a) => (api = a)} />
          <EditorField {...props} />
        </Form>
      </Formik>,
    )

    const editor = screen.getByTestId('mock-editor')
    expect(editor).toHaveAttribute('data-value-passed', 'initial')

    // Simulate the user typing into Monaco — EditorField's handleChange flips
    // touchedRef synchronously even though the Formik write is debounced.
    act(() => {
      fireEvent.change(editor, { target: { value: 'user-typed' } })
    })

    // External Formik state change should NOT reset the editor's value prop —
    // EditorField passes `undefined` once touchedRef flips, so Monaco's
    // model.setValue() never fires and the cursor stays put.
    act(() => {
      api.setValue('externally-set')
    })
    expect(editor).toHaveAttribute('data-value-passed', 'undefined')

    // Flush the 500ms debounce so the test cleans up the pending timer.
    act(() => {
      vi.runAllTimers()
    })
    vi.useRealTimers()
  })

  it('debounces handleChange before writing to Formik', async () => {
    vi.useFakeTimers()
    const props = createProps()
    const captured: string[] = []
    render(
      <Formik initialValues={{ testEditorField: '' }} onSubmit={vi.fn()}>
        {({ values }) => {
          captured.push(values.testEditorField ?? '')
          return (
            <Form>
              <EditorField {...props} />
            </Form>
          )
        }}
      </Formik>,
    )

    const editor = screen.getByTestId('mock-editor')
    act(() => {
      fireEvent.change(editor, { target: { value: 'a' } })
      fireEvent.change(editor, { target: { value: 'ab' } })
    })
    // No write yet — debounce hasn't fired.
    expect(captured.at(-1)).toBe('')

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(captured.at(-1)).toBe('ab')
    vi.useRealTimers()
  })

  it('forces editor remount when editorKeyPostfix changes', () => {
    const props = createProps()
    let api: {
      setValue: (v: string) => void
      setPostfix: (p: string) => void
    } = { setValue: () => {}, setPostfix: () => {} }
    render(
      <Formik initialValues={{ testEditorField: 'v1', editorKeyPostfix: 'k1' }} onSubmit={vi.fn()}>
        <Form>
          <StateController onReady={(a) => (api = a)} />
          <EditorField {...props} />
        </Form>
      </Formik>,
    )

    const before = screen.getByTestId('mock-editor')
    act(() => {
      api.setPostfix('k2')
    })
    const after = screen.getByTestId('mock-editor')
    // React keying causes a fresh DOM node when the key changes.
    expect(after).not.toBe(before)
    // The new mount should re-show the current Formik value (touchedRef
    // resets because the component is a fresh instance).
    expect(after).toHaveAttribute('data-value-passed', 'v1')
  })
})
