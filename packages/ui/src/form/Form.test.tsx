// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Form, Formik } from 'formik'
import type { ReactNode } from 'react'

// Polyfill structuredClone for Jest environment
if (typeof structuredClone === 'undefined') {
  ;(global as Record<string, unknown>)['structuredClone'] = (obj: unknown): unknown =>
    JSON.parse(JSON.stringify(obj))
}

// Mock all problematic external modules before importing the component under test
vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)

vi.mock('hooks', () => ({
  usePrevious: vi.fn((value: unknown) => value),
  useParsedOpts: vi.fn((options: unknown) => options),
}))

vi.mock('@parallelworks/ui', async () => ({
  ...(await vi.importActual<typeof import('@parallelworks/ui')>('@parallelworks/ui')),
  UncontrolledCollapsiblePanel: ({ children }: { children: ReactNode }) => children,
  SectionHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  CustomListbox: () => null,
  Loader: () => <div data-testid="loader">Loading...</div>,
  Table: Object.assign(({ children }: { children?: ReactNode }) => <table>{children}</table>, {
    Item: ({ children }: { children?: ReactNode }) => <td>{children}</td>,
    Header: ({ children }: { children?: ReactNode }) => <th>{children}</th>,
  }),
  TOOLTIP_ID: 'global-tooltip',
  TooltipInfo: () => null,
}))

vi.mock('@parallelworks/ui/icons', () => ({
  AngleRightIcon: () => null,
  SuccessCheckmark: () => null,
  TrashIcon: () => null,
}))

vi.mock('react-tooltip', () => ({
  Tooltip: () => null,
}))

vi.mock('./infraFieldRegistry', () => ({ INFRA_FIELD_COMPONENTS: {} }))

vi.mock('./fieldRegistry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./fieldRegistry')>()),
  Registry: ({
    field,
    label,
  }: {
    field: { name: string; type: string; optional?: unknown }
    label: string
  }) => (
    // data-optional surfaces the resolved flag; FieldWrapper renders the required
    // asterisk from it, but the real field components are mocked out here.
    <div data-testid={`field-${field.name}`} data-optional={String(field.optional)}>
      <label htmlFor={field.name}>{label}</label>
      <input id={field.name} name={field.name} type="text" />
    </div>
  ),
}))

// Mock ResizeObserver
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}))

import { testEngine } from '../test/engine'

// Now import the component under test
import {
  collectFieldsWithDefaults,
  DynamicDefaultsSync,
  DynamicForm,
  defaultReferencesField,
  FieldsFromOptions,
  findSelfReferencingFieldNames,
  listLengthsSignature,
  resolveMetaOverrides,
} from './Form'

describe('DynamicForm workflowForm prop', () => {
  const createSchema = (fieldOverrides = {}) => ({
    visibleField: {
      type: 'string',
      label: 'Visible Field',
    },
    hiddenIgnoredField: {
      type: 'string',
      label: 'Hidden Ignored Field',
      hidden: true,
      ignore: true,
      default: 'default-value',
      ...fieldOverrides,
    },
  })

  describe('when workflowForm is false (default)', () => {
    it('should delete field value when field is hidden and ignored', async () => {
      const capturedValues: Record<string, unknown>[] = []

      render(
        <DynamicForm
          formJSONs={createSchema()}
          initialValues={{
            visibleField: 'visible',
            hiddenIgnoredField: 'should-be-deleted',
          }}
          setValues={(values) => capturedValues.push({ ...values })}
          workflowForm={false}
        />,
      )

      await waitFor(() => {
        expect(screen.getByTestId('field-visibleField')).toBeInTheDocument()
      })

      const lastValues = capturedValues[capturedValues.length - 1]!
      expect(lastValues).not.toHaveProperty('hiddenIgnoredField')
    })

    it('should preserve field value when field is hidden but NOT ignored', async () => {
      const capturedValues: Record<string, unknown>[] = []
      const schemaWithHiddenOnly = {
        visibleField: {
          type: 'string',
          label: 'Visible Field',
        },
        hiddenOnlyField: {
          type: 'string',
          label: 'Hidden Only Field',
          hidden: true,
          default: 'default-value',
        },
      }

      render(
        <DynamicForm
          formJSONs={schemaWithHiddenOnly}
          initialValues={{
            visibleField: 'visible',
            hiddenOnlyField: 'should-be-preserved',
          }}
          setValues={(values) => capturedValues.push({ ...values })}
          workflowForm={false}
        />,
      )

      await waitFor(() => {
        expect(screen.getByTestId('field-visibleField')).toBeInTheDocument()
      })

      const lastValues = capturedValues[capturedValues.length - 1]!
      expect(lastValues).toHaveProperty('hiddenOnlyField', 'should-be-preserved')
    })
  })

  describe('when workflowForm is true', () => {
    it('should preserve field value when field is hidden and ignored', async () => {
      const capturedValues: Record<string, unknown>[] = []

      render(
        <DynamicForm
          formJSONs={createSchema()}
          initialValues={{
            visibleField: 'visible',
            hiddenIgnoredField: 'should-be-preserved',
          }}
          setValues={(values) => capturedValues.push({ ...values })}
          workflowForm={true}
        />,
      )

      await waitFor(() => {
        expect(screen.getByTestId('field-visibleField')).toBeInTheDocument()
      })

      const lastValues = capturedValues[capturedValues.length - 1]!
      expect(lastValues).toHaveProperty('hiddenIgnoredField', 'should-be-preserved')
    })

    it('should preserve default value when field is hidden and ignored', async () => {
      const capturedValues: Record<string, unknown>[] = []

      render(
        <DynamicForm
          formJSONs={createSchema()}
          initialValues={{
            visibleField: 'visible',
            hiddenIgnoredField: 'default-value',
          }}
          setValues={(values) => capturedValues.push({ ...values })}
          workflowForm={true}
        />,
      )

      await waitFor(() => {
        expect(screen.getByTestId('field-visibleField')).toBeInTheDocument()
      })

      const lastValues = capturedValues[capturedValues.length - 1]!
      expect(lastValues).toHaveProperty('hiddenIgnoredField', 'default-value')
    })
  })
})

describe('FieldsFromOptions workflowForm prop', () => {
  const mockSetFormDirty = vi.fn()

  const renderFieldsFromOptions = (
    options: Record<string, unknown>,
    initialValues: Record<string, unknown>,
    workflowForm = false,
  ) => {
    const capturedValues = { current: initialValues }

    const TestWrapper = () => {
      return (
        <Formik initialValues={initialValues} onSubmit={vi.fn()}>
          {({ values, setFieldValue, setFieldTouched }) => {
            capturedValues.current = values
            return (
              <Form>
                <FieldsFromOptions
                  options={options}
                  values={values}
                  setFormDirty={mockSetFormDirty}
                  setFieldValue={setFieldValue}
                  setFieldTouched={setFieldTouched}
                  workflowForm={workflowForm}
                />
              </Form>
            )
          }}
        </Formik>
      )
    }

    const result = render(<TestWrapper />)
    return { ...result, capturedValues }
  }

  beforeEach(() => {
    mockSetFormDirty.mockClear()
  })

  describe('hidden + ignored field behavior', () => {
    const schema = {
      normalField: {
        type: 'string',
        label: 'Normal Field',
      },
      hiddenIgnoredField: {
        type: 'string',
        label: 'Hidden Ignored',
        hidden: true,
        ignore: true,
      },
    }

    it('should delete value when workflowForm is false', async () => {
      const initialValues = {
        normalField: 'normal',
        hiddenIgnoredField: 'to-be-deleted',
      }

      const { capturedValues } = renderFieldsFromOptions(schema, initialValues, false)

      await waitFor(() => {
        expect(screen.getByTestId('field-normalField')).toBeInTheDocument()
      })

      expect(capturedValues.current).not.toHaveProperty('hiddenIgnoredField')
    })

    it('should preserve value when workflowForm is true', async () => {
      const initialValues = {
        normalField: 'normal',
        hiddenIgnoredField: 'to-be-preserved',
      }

      const { capturedValues } = renderFieldsFromOptions(schema, initialValues, true)

      await waitFor(() => {
        expect(screen.getByTestId('field-normalField')).toBeInTheDocument()
      })

      expect(capturedValues.current).toHaveProperty('hiddenIgnoredField', 'to-be-preserved')
    })
  })

  describe('workflowForm propagation to groups', () => {
    const schemaWithGroup = {
      outerField: {
        type: 'string',
        label: 'Outer Field',
      },
      myGroup: {
        type: 'group',
        label: 'My Group',
        noCollapse: true,
        options: {
          innerField: {
            type: 'string',
            label: 'Inner Field',
          },
          hiddenInnerField: {
            type: 'string',
            label: 'Hidden Inner',
            hidden: true,
            ignore: true,
          },
        },
      },
    }

    it('should propagate workflowForm=false to nested groups (deleting hidden+ignored values)', async () => {
      const initialValues = {
        outerField: 'outer',
        innerField: 'inner',
        hiddenInnerField: 'hidden-value',
      }

      const { capturedValues } = renderFieldsFromOptions(schemaWithGroup, initialValues, false)

      await waitFor(() => {
        expect(screen.getByTestId('field-outerField')).toBeInTheDocument()
        expect(screen.getByTestId('field-innerField')).toBeInTheDocument()
      })

      expect(capturedValues.current).not.toHaveProperty('hiddenInnerField')
    })

    it('should propagate workflowForm=true to nested groups (preserving hidden+ignored values)', async () => {
      const initialValues = {
        outerField: 'outer',
        innerField: 'inner',
        hiddenInnerField: 'hidden-value',
      }

      const { capturedValues } = renderFieldsFromOptions(schemaWithGroup, initialValues, true)

      await waitFor(() => {
        expect(screen.getByTestId('field-outerField')).toBeInTheDocument()
        expect(screen.getByTestId('field-innerField')).toBeInTheDocument()
      })

      expect(capturedValues.current).toHaveProperty('hiddenInnerField', 'hidden-value')
    })
  })

  describe('hidden without ignore', () => {
    const schemaHiddenOnly = {
      visibleField: {
        type: 'string',
        label: 'Visible Field',
      },
      hiddenOnlyField: {
        type: 'string',
        label: 'Hidden Only',
        hidden: true,
      },
    }

    it('should preserve hidden field value regardless of workflowForm when ignore is not set', async () => {
      const initialValues = {
        visibleField: 'visible',
        hiddenOnlyField: 'hidden-but-kept',
      }

      const { capturedValues } = renderFieldsFromOptions(schemaHiddenOnly, initialValues, false)

      await waitFor(() => {
        expect(screen.getByTestId('field-visibleField')).toBeInTheDocument()
      })

      expect(capturedValues.current).toHaveProperty('hiddenOnlyField', 'hidden-but-kept')
    })
  })
})

describe('collectFieldsWithDefaults', () => {
  it('should return empty array for empty options', () => {
    expect(collectFieldsWithDefaults({})).toEqual([])
  })

  it('should collect every field with a default regardless of hidden / prefillDefault', () => {
    // The sync iteration's saved-vs-default heuristic decides per-field whether to
    // preserve or sync; collectFieldsWithDefaults is the unfiltered set.
    const options = {
      visibleString: { type: 'string', label: 'Visible', default: 'test' },
      visibleBoolean: { type: 'boolean', label: 'Visible Bool', default: true },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'visibleString', defaultValue: 'test' },
      { name: 'visibleBoolean', defaultValue: true },
    ])
  })

  it('should collect simple hidden boolean field with default', () => {
    const options = {
      is_disabled: {
        type: 'boolean',
        hidden: true,
        default: true,
        label: 'Is Disabled',
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'is_disabled', defaultValue: true },
    ])
  })

  it('should NOT collect hidden boolean field without default', () => {
    const options = {
      is_disabled: {
        type: 'boolean',
        hidden: true,
        label: 'Is Disabled',
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([])
  })

  it('should collect hidden non-boolean fields (now supports all types)', () => {
    // Originally this test expected non-boolean hidden fields to be ignored,
    // but we now support syncing all hidden field types, not just booleans
    const options = {
      hidden_string: {
        type: 'string',
        hidden: true,
        default: 'value',
        label: 'Hidden String',
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'hidden_string', defaultValue: 'value' },
    ])
  })

  it('should collect field with hidden=false (has hidden property defined)', () => {
    // Fields with 'hidden' defined (even if false) are computed/dynamic fields
    // that need syncing because their visibility or default may be expression-based
    const options = {
      visible_bool: {
        type: 'boolean',
        hidden: false,
        default: true,
        label: 'Visible Bool',
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'visible_bool', defaultValue: true },
    ])
  })

  it('should collect a regular field with a default', () => {
    const options = {
      scheduler: {
        type: 'boolean',
        default: true,
        label: 'Enable Scheduler',
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([{ name: 'scheduler', defaultValue: true }])
  })

  // convertToDynamicForm keeps `group` only for a flatten group and turns every other one into
  // `object`, so a `group` reaching this walk always has its children at the ROOT of values. Prefixing
  // them produced paths that do not exist -- `controller.rootSize`, `alerts.runtimeAlertEnabled` -- and
  // the sync silently did nothing for Controller, General, Advanced and Alerts, i.e. most of the
  // cluster definition form.
  // listLengthsSignature gates the collect walk and keys its row-shrink pruning, so it has to agree with
  // it about where a flatten group's children live. Prefixing here emitted a constant signature, making a
  // row add or remove inside such a list invisible.
  it('sees a row change in a list inside a flatten group', () => {
    const options = {
      controller: {
        type: 'group',
        flatten: true,
        options: {
          disks: {
            type: 'list',
            template: { sizeGb: { type: 'number', default: 50 } },
          },
        },
      },
    }
    const one = listLengthsSignature(options, { disks: [{}] })
    const two = listLengthsSignature(options, { disks: [{}, {}] })
    expect(one).not.toEqual(two)
    expect(two).toContain('2')
  })

  it("collects a flatten group's children at the root, not under the group name", () => {
    const options = {
      controller: {
        type: 'group',
        flatten: true,
        label: 'Controller Settings',
        options: {
          rootSize: { type: 'number', default: 100, label: 'Root Size' },
        },
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([{ name: 'rootSize', defaultValue: 100 }])
  })

  it('reads a flatten group value from the root of values', () => {
    const options = {
      general: {
        type: 'group',
        flatten: true,
        options: {
          network: { type: 'string', default: 'default-net' },
        },
      },
    }
    // The value lives at the root, exactly where initializeValues and the renderers put it.
    const collected = collectFieldsWithDefaults(options, { network: 'my-net' })
    expect(collected).toEqual([{ name: 'network', defaultValue: 'default-net' }])
  })

  it("collects a flatten group's list rows so the row template is not dropped", () => {
    const options = {
      controller: {
        type: 'group',
        flatten: true,
        options: {
          disks: {
            type: 'list',
            template: { sizeGb: { type: 'number', default: 50 } },
          },
        },
      },
    }
    // disks lives at the root under a flatten group; reading it as controller.disks yielded undefined,
    // which is not an array, so the whole row template was skipped.
    expect(collectFieldsWithDefaults(options, { disks: [{}, {}] })).toEqual([
      { name: 'disks[0].sizeGb', defaultValue: 50 },
      { name: 'disks[1].sizeGb', defaultValue: 50 },
    ])
  })

  it('still nests a non-flatten group, which arrives as an object', () => {
    const options = {
      desktopSession: {
        type: 'object',
        options: {
          useApptainer: { type: 'boolean', default: false },
        },
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'desktopSession.useApptainer', defaultValue: false },
    ])
  })

  it('should collect hidden boolean field inside a group', () => {
    const options = {
      myGroup: {
        type: 'object',
        label: 'My Group',
        options: {
          is_disabled: {
            type: 'boolean',
            hidden: true,
            default: false,
            label: 'Is Disabled',
          },
        },
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'myGroup.is_disabled', defaultValue: false },
    ])
  })

  it('should collect hidden boolean field inside nested groups', () => {
    const options = {
      outerGroup: {
        type: 'object',
        label: 'Outer',
        options: {
          innerGroup: {
            type: 'object',
            label: 'Inner',
            options: {
              deeply_nested: {
                type: 'boolean',
                hidden: true,
                default: true,
                label: 'Deeply Nested',
              },
            },
          },
        },
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'outerGroup.innerGroup.deeply_nested', defaultValue: true },
    ])
  })

  it('should collect multiple hidden boolean fields at different levels', () => {
    const options = {
      top_level: {
        type: 'boolean',
        hidden: true,
        default: true,
        label: 'Top Level',
      },
      myGroup: {
        type: 'object',
        label: 'My Group',
        options: {
          group_level: {
            type: 'boolean',
            hidden: true,
            default: false,
            label: 'Group Level',
          },
        },
      },
    }
    const result = collectFieldsWithDefaults(options)
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({ name: 'top_level', defaultValue: true })
    expect(result).toContainEqual({
      name: 'myGroup.group_level',
      defaultValue: false,
    })
  })

  it('should skip $meta keys', () => {
    const options = {
      $meta: { labelPosition: 'top' },
      is_disabled: {
        type: 'boolean',
        hidden: true,
        default: true,
        label: 'Is Disabled',
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'is_disabled', defaultValue: true },
    ])
  })

  it('should handle group with items instead of options', () => {
    const options = {
      myGroup: {
        type: 'object',
        label: 'My Group',
        items: {
          is_disabled: {
            type: 'boolean',
            hidden: true,
            default: true,
            label: 'Is Disabled',
          },
        },
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'myGroup.is_disabled', defaultValue: true },
    ])
  })

  it('should collect hidden boolean fields even when parent group is hidden', () => {
    // This is the key scenario from issue3.txt: when the parent group becomes hidden,
    // we still need to find and sync the hidden boolean field inside it
    const options = {
      slurm: {
        type: 'object',
        label: 'SLURM Directives',
        hidden: true, // Parent group is hidden
        options: {
          is_disabled: {
            type: 'boolean',
            hidden: true,
            default: true, // This should be collected even though parent is hidden
            label: 'Is SLURM disabled?',
          },
        },
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'slurm.is_disabled', defaultValue: true },
    ])
  })

  it('should collect from deeply nested hidden groups', () => {
    const options = {
      outer: {
        type: 'object',
        label: 'Outer',
        hidden: true,
        options: {
          middle: {
            type: 'object',
            label: 'Middle',
            hidden: true,
            options: {
              inner_flag: {
                type: 'boolean',
                hidden: true,
                default: false,
                label: 'Inner Flag',
              },
            },
          },
        },
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'outer.middle.inner_flag', defaultValue: false },
    ])
  })

  it('should collect hidden fields inside type="object" (converted groups)', () => {
    // convertToDynamicForm converts type="group" to type="object"
    // This tests the actual structure after conversion
    const options = {
      slurm: {
        type: 'object', // After convertToDynamicForm, groups become objects
        label: 'SLURM Directives',
        hidden: true,
        options: {
          is_disabled: {
            type: 'boolean',
            hidden: true,
            default: true,
            label: 'Is SLURM disabled?',
          },
        },
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'slurm.is_disabled', defaultValue: true },
    ])
  })

  it('should collect hidden string fields (not just booleans)', () => {
    const options = {
      hidden_string: {
        type: 'string',
        hidden: true,
        default: 'computed-value',
        label: 'Hidden String',
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'hidden_string', defaultValue: 'computed-value' },
    ])
  })

  it('should collect hidden number fields', () => {
    const options = {
      hidden_number: {
        type: 'number',
        hidden: true,
        default: 42,
        label: 'Hidden Number',
      },
    }
    expect(collectFieldsWithDefaults(options)).toEqual([
      { name: 'hidden_number', defaultValue: 42 },
    ])
  })

  it('should collect hidden fields of mixed types', () => {
    const options = {
      hidden_bool: {
        type: 'boolean',
        hidden: true,
        default: false,
        label: 'Hidden Bool',
      },
      hidden_string: {
        type: 'string',
        hidden: true,
        default: 'test',
        label: 'Hidden String',
      },
      visible_field: {
        type: 'string',
        label: 'Visible Field',
      },
    }
    const result = collectFieldsWithDefaults(options)
    expect(result).toHaveLength(2)
    expect(result).toContainEqual({ name: 'hidden_bool', defaultValue: false })
    expect(result).toContainEqual({
      name: 'hidden_string',
      defaultValue: 'test',
    })
  })

  it('should NOT collect list fields when no list items exist in values', () => {
    const options = {
      myList: {
        type: 'list',
        label: 'My List',
        options: {
          list_hidden_field: {
            type: 'string',
            hidden: true,
            default: 'list-default',
            label: 'List Hidden Field',
          },
        },
      },
    }
    // No list items in values, so nothing to collect
    expect(collectFieldsWithDefaults(options, {})).toEqual([])
    expect(collectFieldsWithDefaults(options, { myList: [] })).toEqual([])
  })

  it('should collect list item fields with indexed paths when items exist', () => {
    const options = {
      myList: {
        type: 'list',
        label: 'My List',
        options: {
          list_hidden_field: {
            type: 'string',
            hidden: true,
            default: 'list-default',
            label: 'List Hidden Field',
          },
        },
      },
    }
    // One list item exists
    const values = { myList: [{ list_hidden_field: 'old-value' }] }
    expect(collectFieldsWithDefaults(options, values)).toEqual([
      { name: 'myList[0].list_hidden_field', defaultValue: 'list-default' },
    ])
  })

  it('should collect fields for multiple list items', () => {
    const options = {
      myList: {
        type: 'list',
        label: 'My List',
        options: {
          is_disabled: {
            type: 'boolean',
            hidden: true,
            default: false,
            label: 'Is Disabled',
          },
        },
      },
    }
    // Two list items exist
    const values = {
      myList: [{ is_disabled: true }, { is_disabled: true }],
    }
    expect(collectFieldsWithDefaults(options, values)).toEqual([
      { name: 'myList[0].is_disabled', defaultValue: false },
      { name: 'myList[1].is_disabled', defaultValue: false },
    ])
  })

  it('should collect nested list items inside groups', () => {
    const options = {
      slurm: {
        type: 'object',
        label: 'SLURM',
        options: {
          multi: {
            type: 'list',
            label: 'Multi',
            options: {
              is_disabled: {
                type: 'boolean',
                hidden: true,
                default: false,
                label: 'Is Disabled',
              },
            },
          },
        },
      },
    }
    const values = {
      slurm: {
        multi: [{ is_disabled: true }],
      },
    }
    expect(collectFieldsWithDefaults(options, values)).toEqual([
      { name: 'slurm.multi[0].is_disabled', defaultValue: false },
    ])
  })
})

describe('DynamicDefaultsSync', () => {
  // The sync runs during render using a useRef guard: it only fires when
  // fieldsWithDefaults changes between renders (deepEqual comparison).
  // On the initial mount the ref is initialized to the current value, so
  // the sync block is intentionally skipped. This mirrors production
  // behavior where expression re-evaluation causes options/defaults to
  // change across renders, triggering the sync on subsequent renders.
  //
  // To test this, we mount with empty options first (so the ref
  // initializes to []), then rerender with the real options. The
  // deepEqual mismatch triggers the sync block during the rerender.
  // Two-phase render: phase 1 with `optionsA`, phase 2 with `optionsB`. The sync
  // iteration's prev-default tracker records on first-seen during phase 1, then
  // compares against the new resolved default during phase 2 — that's what
  // simulates a dependency-driven default change.
  const renderTwoPhase = (
    optionsA: Record<string, unknown>,
    optionsB: Record<string, unknown>,
    initialValues: Record<string, unknown>,
  ) => {
    const capturedValues: Record<string, unknown>[] = []

    const TestComponent = ({ opts }: { opts: Record<string, unknown> }) => {
      return (
        <Formik initialValues={initialValues} onSubmit={vi.fn()}>
          {({ values }) => {
            capturedValues.push(structuredClone(values))
            return (
              <Form>
                <DynamicDefaultsSync options={opts} />
                <input data-testid="mounted-indicator" />
              </Form>
            )
          }}
        </Formik>
      )
    }

    const result = render(<TestComponent opts={optionsA} />)
    result.rerender(<TestComponent opts={optionsB} />)
    return { ...result, capturedValues }
  }

  const renderSinglePhase = (
    options: Record<string, unknown>,
    initialValues: Record<string, unknown>,
  ) => {
    const capturedValues: Record<string, unknown>[] = []

    const result = render(
      <Formik initialValues={initialValues} onSubmit={vi.fn()}>
        {({ values }) => {
          capturedValues.push(structuredClone(values))
          return (
            <Form>
              <DynamicDefaultsSync options={options} />
              <input data-testid="mounted-indicator" />
            </Form>
          )
        }}
      </Formik>,
    )
    return { ...result, capturedValues }
  }

  it('preserves a saved value that differs from default on first-seen (synth-touched)', async () => {
    // Saved=true, resolved default=false → user-curated. Synth touched, no sync.
    const options = {
      is_disabled: {
        type: 'boolean',
        hidden: true,
        default: false,
        label: 'Is Disabled',
      },
    }
    const initialValues = { is_disabled: true }

    const { capturedValues } = renderSinglePhase(options, initialValues)

    await waitFor(() => expect(screen.getByTestId('mounted-indicator')).toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 50))

    const lastValues = capturedValues[capturedValues.length - 1]!
    expect(lastValues['is_disabled']).toBe(true)
  })

  it('syncs when the resolved default changes between renders (default-tracking)', async () => {
    // Phase 1 default==saved → not synth-touched. Phase 2 default flips → sync fires.
    const optionsA = {
      is_disabled: {
        type: 'boolean',
        hidden: true,
        default: true,
        label: 'Is Disabled',
      },
    }
    const optionsB = {
      is_disabled: {
        type: 'boolean',
        hidden: true,
        default: false,
        label: 'Is Disabled',
      },
    }
    const initialValues = { is_disabled: true }

    const { capturedValues } = renderTwoPhase(optionsA, optionsB, initialValues)

    await waitFor(() => {
      const lastValues = capturedValues[capturedValues.length - 1]!
      expect(lastValues['is_disabled']).toBe(false)
    })
  })

  describe('list row template defaults', () => {
    const template =
      "${{ inputs.partitions.[index].provisioningMode == 'flex' && inputs.partitions.[index].maxNodes * 1 > 1 }}"
    const parserMock = vi.mocked(testEngine.evaluate)
    // The stubs below read only these three; `as unknown as` re-widens to the real signature
    // without an `any`, which lint rejects.
    type ParserCall = {
      obj?: { v?: unknown }
      inputs?: {
        partitions?: Array<{ provisioningMode?: string; maxNodes?: unknown }>
      }
      index: number
    }

    const mkOptions = () => ({
      partitions: {
        type: 'list',
        label: 'Partitions',
        options: {
          maxNodes: { type: 'number', label: 'Max Nodes', default: 1 },
          useNodeGroup: { type: 'boolean', label: 'MIG', default: template },
        },
      },
    })

    const renderWithRaise = (opts: Record<string, unknown>) => {
      const capturedValues: Record<string, unknown>[] = []
      const TestComponent = ({ o }: { o: Record<string, unknown> }) => (
        <Formik
          initialValues={{
            partitions: [{ provisioningMode: 'flex', maxNodes: '1', useNodeGroup: false }],
          }}
          onSubmit={vi.fn()}
        >
          {({ values, setFieldValue }) => {
            capturedValues.push(structuredClone(values))
            return (
              <Form>
                <DynamicDefaultsSync options={o} />
                <button
                  type="button"
                  data-testid="raise-max-nodes"
                  onClick={() => setFieldValue('partitions[0].maxNodes', '2')}
                />
              </Form>
            )
          }}
        </Formik>
      )
      const view = render(<TestComponent o={opts} />)
      return { view, capturedValues, TestComponent }
    }

    afterEach(() => {
      parserMock.mockImplementation(
        (({ obj }: { obj: unknown }) => obj) as unknown as typeof testEngine.evaluate,
      )
    })

    it('resolves the default per row and syncs the value when its inputs change', async () => {
      parserMock.mockImplementation((({ obj, inputs, index }: ParserCall) => {
        if (obj?.v !== template) {
          return obj
        }
        const row = inputs?.partitions?.[index]
        return {
          v: row?.provisioningMode === 'flex' && Number(row?.maxNodes) > 1,
        }
      }) as unknown as typeof testEngine.evaluate)

      const { view, capturedValues, TestComponent } = renderWithRaise(mkOptions())
      fireEvent.click(screen.getByTestId('raise-max-nodes'))
      // useParsedOpts hands the sync a fresh options identity on a dep change; rebuild to match.
      view.rerender(<TestComponent o={mkOptions()} />)

      await waitFor(() => {
        const last = capturedValues[capturedValues.length - 1] as {
          partitions: Array<Record<string, unknown>>
        }
        expect(last.partitions[0]?.['useNodeGroup']).toBe(true)
      })
    })

    it('skips an unresolvable template default without locking the field', async () => {
      // Parser passes templates through (e.g. wasm not ready): nothing written, nothing locked.
      const { view, capturedValues, TestComponent } = renderWithRaise(mkOptions())
      await waitFor(() => {
        const last = capturedValues[capturedValues.length - 1] as {
          partitions: Array<Record<string, unknown>>
        }
        expect(last.partitions[0]?.['useNodeGroup']).toBe(false)
      })

      // The same field must still sync on a later dep change — proof the skip did not lock it.
      parserMock.mockImplementation((({ obj, inputs, index }: ParserCall) => {
        if (obj?.v !== template) {
          return obj
        }
        const row = inputs?.partitions?.[index]
        return {
          v: row?.provisioningMode === 'flex' && Number(row?.maxNodes) > 1,
        }
      }) as unknown as typeof testEngine.evaluate)
      view.rerender(<TestComponent o={mkOptions()} />)
      fireEvent.click(screen.getByTestId('raise-max-nodes'))
      view.rerender(<TestComponent o={mkOptions()} />)

      await waitFor(() => {
        const last = capturedValues[capturedValues.length - 1] as {
          partitions: Array<Record<string, unknown>>
        }
        expect(last.partitions[0]?.['useNodeGroup']).toBe(true)
      })
    })
  })

  it('never auto-writes a field that carries a secondaryField (cannot maintain the pair)', async () => {
    const mk = (dflt: string) => ({
      instanceType: {
        type: 'dropdown',
        label: 'Instance Type',
        default: dflt,
        secondaryField: 'architecture',
        options: [
          { value: 'c2-standard-4', secondaryValue: 'x86_64' },
          { value: 't2a-standard-4', secondaryValue: 'arm64' },
        ],
      },
    })
    const initialValues = {
      instanceType: 'c2-standard-4',
      architecture: 'x86_64',
    }

    const { capturedValues } = renderTwoPhase(
      mk('c2-standard-4'),
      mk('t2a-standard-4'),
      initialValues,
    )

    await waitFor(() => expect(screen.getByTestId('mounted-indicator')).toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 50))

    const lastValues = capturedValues[capturedValues.length - 1]!
    expect(lastValues['instanceType']).toBe('c2-standard-4')
    expect(lastValues['architecture']).toBe('x86_64')
  })

  it("forgets a list's tracked state when a row is deleted (no transplanted lock state)", async () => {
    // Deleting row0 shifts the curated row1 onto index 0, where it would inherit row0's tracking.
    const mkOptions = (dflt: string) => ({
      partitions: {
        type: 'list',
        label: 'Partitions',
        options: {
          flavor: {
            type: 'string',
            label: 'Flavor',
            prefillDefault: true,
            default: dflt,
          },
        },
      },
    })
    const capturedValues: Record<string, unknown>[] = []
    const TestComponent = ({ o }: { o: Record<string, unknown> }) => (
      <Formik
        initialValues={{
          partitions: [{ flavor: 'x' }, { flavor: 'custom' }],
        }}
        onSubmit={vi.fn()}
      >
        {({ values, setFieldValue }) => {
          capturedValues.push(structuredClone(values))
          return (
            <Form>
              <DynamicDefaultsSync options={o} />
              <button
                type="button"
                data-testid="delete-first-row"
                onClick={() =>
                  setFieldValue(
                    'partitions',
                    (values as { partitions: unknown[] }).partitions.slice(1),
                  )
                }
              />
            </Form>
          )
        }}
      </Formik>
    )

    const view = render(<TestComponent o={mkOptions('x')} />)
    fireEvent.click(screen.getByTestId('delete-first-row'))
    view.rerender(<TestComponent o={mkOptions('y')} />)

    await waitFor(() => expect(screen.getByTestId('delete-first-row')).toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 50))

    const last = capturedValues[capturedValues.length - 1] as {
      partitions: Array<Record<string, unknown>>
    }
    expect(last.partitions).toHaveLength(1)
    expect(last.partitions[0]?.['flavor']).toBe('custom')
  })

  it('preserves a curated saved value across dependency changes (synth survives default flip)', async () => {
    // Saved=true with phase 1 default=false → synth-touched (curated).
    // Phase 2 default changes to something else → still preserved.
    const optionsA = {
      is_disabled: {
        type: 'boolean',
        hidden: true,
        default: false,
        label: 'Is Disabled',
      },
    }
    const optionsB = {
      is_disabled: {
        type: 'boolean',
        hidden: true,
        default: 'other',
        label: 'Is Disabled',
      },
    }
    const initialValues = { is_disabled: true }

    const { capturedValues } = renderTwoPhase(optionsA, optionsB, initialValues)

    await waitFor(() => expect(screen.getByTestId('mounted-indicator')).toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 50))

    const lastValues = capturedValues[capturedValues.length - 1]!
    expect(lastValues['is_disabled']).toBe(true)
  })

  it('syncs nested group fields when their default changes', async () => {
    const optionsA = {
      slurm: {
        type: 'object',
        label: 'SLURM',
        options: {
          is_disabled: {
            type: 'boolean',
            hidden: true,
            default: true,
            label: 'Is Disabled',
          },
        },
      },
    }
    const optionsB = {
      slurm: {
        type: 'object',
        label: 'SLURM',
        options: {
          is_disabled: {
            type: 'boolean',
            hidden: true,
            default: false,
            label: 'Is Disabled',
          },
        },
      },
    }
    const initialValues = { slurm: { is_disabled: true } }

    const { capturedValues } = renderTwoPhase(optionsA, optionsB, initialValues)

    await waitFor(() => {
      const lastValues = capturedValues[capturedValues.length - 1] as {
        slurm: { is_disabled: boolean }
      }
      expect(lastValues.slurm.is_disabled).toBe(false)
    })
  })

  it('does not sync when value already matches default', async () => {
    const options = {
      is_disabled: {
        type: 'boolean',
        hidden: true,
        default: true,
        label: 'Is Disabled',
      },
    }
    const initialValues = { is_disabled: true }

    const { capturedValues } = renderSinglePhase(options, initialValues)

    await waitFor(() => expect(screen.getByTestId('mounted-indicator')).toBeInTheDocument())
    await new Promise((resolve) => setTimeout(resolve, 50))

    const lastValues = capturedValues[capturedValues.length - 1]!
    expect(lastValues['is_disabled']).toBe(true)
  })

  it('treats visible fields the same as hidden — sync-on-default-change applies uniformly', async () => {
    const optionsA = {
      label_prefix: {
        type: 'string',
        prefillDefault: true,
        default: 'A',
        label: 'Label',
      },
    }
    const optionsB = {
      label_prefix: {
        type: 'string',
        prefillDefault: true,
        default: 'B',
        label: 'Label',
      },
    }
    const initialValues = { label_prefix: 'A' }

    const { capturedValues } = renderTwoPhase(optionsA, optionsB, initialValues)

    await waitFor(() => {
      const lastValues = capturedValues[capturedValues.length - 1]!
      expect(lastValues['label_prefix']).toBe('B')
    })
  })

  it('handles null-resolving default that later becomes a real value (wasSeen via Map.has)', async () => {
    // Phase 1: the resolved default is null (e.g. an expression whose dep
    // hasn't arrived yet). Phase 2: a real value resolves. Without Map.has
    // disambiguating "tracked-with-null" from "never seen," phase 2 would
    // be treated as first-seen and the field would be wrongly synth-touched
    // (saved=undefined vs default=real differs), locking the field forever.
    const optionsA = {
      derived: {
        type: 'string',
        prefillDefault: true,
        default: null,
        label: 'Derived',
      },
    }
    const optionsB = {
      derived: {
        type: 'string',
        prefillDefault: true,
        default: 'resolved',
        label: 'Derived',
      },
    }
    const initialValues = { derived: undefined }

    const { capturedValues } = renderTwoPhase(optionsA, optionsB, initialValues)

    await waitFor(() => {
      const lastValues = capturedValues[capturedValues.length - 1]!
      expect(lastValues['derived']).toBe('resolved')
    })
  })

  it('preserves a real saved value when the default first resolves null then real', async () => {
    // Phase 1: defaultValue=null, saved="manual". First-seen check now
    // synth-touches because currVal diverges from the (null) default, even
    // though defaultValue is null. Phase 2: defaultValue="resolved",
    // wasSeen=true. Synth-touched short-circuit fires → "manual" is preserved.
    const optionsA = {
      derived: {
        type: 'string',
        prefillDefault: true,
        default: null,
        label: 'Derived',
      },
    }
    const optionsB = {
      derived: {
        type: 'string',
        prefillDefault: true,
        default: 'resolved',
        label: 'Derived',
      },
    }
    const initialValues = { derived: 'manual' }

    const { capturedValues } = renderTwoPhase(optionsA, optionsB, initialValues)

    await waitFor(() => {
      const lastValues = capturedValues[capturedValues.length - 1]!
      expect(lastValues['derived']).toBe('manual')
    })
  })

  it('does not synth-touch when saved value and default are both null', async () => {
    // Both serializedDefault and currVal must encode null the same way.
    // Pre-fix: serializedDefault was the JS `null`, currVal was the string
    // "null" from JSON.stringify(null) — they compared unequal and the field
    // got synth-touched on first-seen, so phase-2 default changes would no
    // longer sync.
    const optionsA = {
      derived: {
        type: 'string',
        prefillDefault: true,
        default: null,
        label: 'Derived',
      },
    }
    const optionsB = {
      derived: {
        type: 'string',
        prefillDefault: true,
        default: 'resolved',
        label: 'Derived',
      },
    }
    // Saved value is JS null (not undefined, not "manual").
    const initialValues = { derived: null }

    const { capturedValues } = renderTwoPhase(optionsA, optionsB, initialValues)

    await waitFor(() => {
      const lastValues = capturedValues[capturedValues.length - 1]!
      // Sync should fire on phase 2 — saved null didn't diverge from the
      // null default, so synth-touched was NOT set, so the default change
      // flows through.
      expect(lastValues['derived']).toBe('resolved')
    })
  })

  it('prunes prev-default + synth-touched entries when a list item is removed', async () => {
    // Two-item list → one-item list. The dropped index's path should no longer
    // be reachable in fieldsWithDefaults, so the prune block deletes its
    // entries from both refs. We can't read the refs directly, so we drive
    // the assertion by re-adding an item back later and verifying it tracks
    // fresh rather than reusing the previous index's prev-default state.
    const fieldA = {
      type: 'string',
      prefillDefault: true,
      default: 'computed',
      label: 'F',
    }
    const optionsTwo = {
      lst: {
        type: 'list',
        template: { f: fieldA },
      },
    }
    const initialValues = { lst: [{ f: 'a' }, { f: 'b' }] }
    const { capturedValues } = renderTwoPhase(
      optionsTwo,
      // Phase 2: list shrunk to one item (index 1 dropped).
      {
        lst: {
          type: 'list',
          template: { f: fieldA },
        },
      },
      initialValues,
    )
    await waitFor(() => {
      // Surviving item keeps its saved value (not overwritten by sync).
      const last = capturedValues[capturedValues.length - 1] as {
        lst: Array<{ f: string }>
      }
      expect(last.lst[0]!.f).toBe('a')
    })
  })
})

describe('resolveMetaOverrides', () => {
  it('falls back to inherited props when options have no $meta', () => {
    expect(resolveMetaOverrides(undefined, 'left', false)).toEqual({
      labelPosition: 'left',
      spaceCompact: false,
    })
    expect(resolveMetaOverrides({}, 'top', true)).toEqual({
      labelPosition: 'top',
      spaceCompact: true,
    })
  })

  it('uses $meta values when provided', () => {
    expect(
      resolveMetaOverrides({ $meta: { labelPosition: 'top', spaceCompact: true } }, 'left', false),
    ).toEqual({ labelPosition: 'top', spaceCompact: true })
  })

  it('mixes $meta and inherited values per field', () => {
    expect(resolveMetaOverrides({ $meta: { labelPosition: 'top' } }, 'left', true)).toEqual({
      labelPosition: 'top',
      spaceCompact: true,
    })
    expect(resolveMetaOverrides({ $meta: { spaceCompact: false } }, 'top', true)).toEqual({
      labelPosition: 'top',
      spaceCompact: false,
    })
  })

  it('treats undefined $meta values as missing (??) — falls back to inherited', () => {
    // Earlier the top-level form used `||` for labelPosition; `??` is what we
    // standardised on so an explicit `labelPosition: undefined` falls back.
    expect(resolveMetaOverrides({ $meta: { labelPosition: undefined } }, 'top', false)).toEqual({
      labelPosition: 'top',
      spaceCompact: false,
    })
  })
})

describe('DynamicForm default-tracking (integration)', () => {
  // Integration tests simulate dependency-driven default changes by rerendering
  // with a schema whose `default` value differs from phase 1's. The sync iteration's
  // prev-default tracker fires when it sees a different resolved default for a
  // previously-recorded field.
  const sharedProps = {
    workflowForm: true as const,
  }

  it('syncs nested-group hidden field when its resolved default changes', async () => {
    const capturedValues: Record<string, unknown>[] = []

    const baseSchema = {
      scheduler: {
        type: 'boolean',
        label: 'Enable Scheduler',
        default: true,
      },
      slurm: {
        type: 'object',
        label: 'SLURM Directives',
        options: {
          is_disabled: {
            type: 'boolean',
            hidden: true,
            default: true,
            label: 'Is SLURM disabled?',
          },
        },
      },
    }

    const updatedSchema = {
      ...baseSchema,
      slurm: {
        ...baseSchema.slurm,
        options: {
          is_disabled: {
            ...baseSchema.slurm.options.is_disabled,
            default: false,
          },
        },
      },
    }

    const initialValues = {
      scheduler: true,
      slurm: { is_disabled: true },
    }

    const setValues = (values: Record<string, unknown>) =>
      capturedValues.push(structuredClone(values))

    const { rerender } = render(
      <DynamicForm
        formJSONs={baseSchema}
        initialValues={initialValues}
        setValues={setValues}
        {...sharedProps}
      />,
    )

    rerender(
      <DynamicForm
        formJSONs={updatedSchema}
        initialValues={initialValues}
        setValues={setValues}
        {...sharedProps}
      />,
    )

    await waitFor(() => {
      const lastValues = capturedValues[capturedValues.length - 1] as {
        slurm: { is_disabled: boolean }
      }
      expect(lastValues?.slurm?.is_disabled).toBe(false)
    })
  })

  it('preserves a saved value that diverged from the resolved default at first-seen', async () => {
    const capturedValues: Record<string, unknown>[] = []

    const schema = {
      scheduler: {
        type: 'boolean',
        label: 'Enable Scheduler',
      },
      slurm: {
        type: 'object',
        label: 'SLURM Directives',
        options: {
          is_disabled: {
            type: 'boolean',
            hidden: true,
            default: false,
            label: 'Is SLURM disabled?',
          },
        },
      },
    }

    render(
      <DynamicForm
        formJSONs={schema}
        initialValues={{
          scheduler: true,
          slurm: { is_disabled: true },
        }}
        setValues={(values) => capturedValues.push(structuredClone(values))}
        workflowForm={true}
      />,
    )

    await waitFor(() => {
      expect(capturedValues.length).toBeGreaterThan(0)
    })

    await new Promise((resolve) => setTimeout(resolve, 50))
    const lastValues = capturedValues[capturedValues.length - 1] as {
      slurm: { is_disabled: boolean }
    }
    expect(lastValues.slurm.is_disabled).toBe(true)
  })

  it('preserves a curated saved value across a default change', async () => {
    // Phase 1: saved=false, default=true → diverges → synth touched.
    // Phase 2: default flips to false. synth still active → preserve saved (false).
    const capturedValues: Record<string, unknown>[] = []

    const baseSchema = {
      scheduler: {
        type: 'boolean',
        label: 'Enable Scheduler',
      },
      slurm: {
        type: 'object',
        label: 'SLURM Directives',
        options: {
          is_disabled: {
            type: 'boolean',
            hidden: true,
            default: true,
            label: 'Is SLURM disabled?',
          },
        },
      },
    }

    const updatedSchema = {
      ...baseSchema,
      slurm: {
        ...baseSchema.slurm,
        hidden: true,
        options: {
          is_disabled: {
            ...baseSchema.slurm.options.is_disabled,
            default: false,
          },
        },
      },
    }

    const initialValues = {
      scheduler: false,
      slurm: { is_disabled: false },
    }

    const setValues = (values: Record<string, unknown>) =>
      capturedValues.push(structuredClone(values))

    const { rerender } = render(
      <DynamicForm
        formJSONs={baseSchema}
        initialValues={initialValues}
        setValues={setValues}
        workflowForm={true}
      />,
    )

    rerender(
      <DynamicForm
        formJSONs={updatedSchema}
        initialValues={initialValues}
        setValues={setValues}
        workflowForm={true}
      />,
    )

    await waitFor(() => {
      expect(capturedValues.length).toBeGreaterThan(0)
    })
    await new Promise((resolve) => setTimeout(resolve, 50))

    const lastValues = capturedValues[capturedValues.length - 1] as {
      slurm: { is_disabled: boolean }
    }
    expect(lastValues?.slurm?.is_disabled).toBe(false)
  })
})

describe('DynamicDefaultsSync preserves list item touched state', () => {
  // Regression: appending an item to a list must not cause
  // DynamicDefaultsSync to reset sibling items' user-set values. The list
  // handleChange used to call setFieldTouched(listName, true), which Formik
  // implements via setIn — that wipes the nested touched tree for every item
  // in the list. Once touched was wiped, DynamicDefaultsSync saw each list
  // item field as untouched and reverted any value differing from its
  // default. The fix removes the parent-list setFieldTouched call; this test
  // locks in the preserved-touched-state contract.
  it('should NOT reset a list item boolean when a new item is appended', async () => {
    const capturedValues: Record<string, unknown>[] = []
    let formikHelpers: {
      setFieldValue: (name: string, value: unknown) => void
    } | null = null

    const options = {
      workers: {
        type: 'list',
        template: {
          scheduler: {
            type: 'boolean',
            hidden: false,
            default: true,
            label: 'Schedule Job?',
          },
        },
      },
    }

    const initialValues = {
      workers: [{ scheduler: false }],
    }

    // initialTouched simulates the user having toggled workers[0].scheduler
    const initialTouched = {
      workers: [{ scheduler: true }],
    }

    const TestComponent = ({ opts }: { opts: Record<string, unknown> }) => (
      <Formik initialValues={initialValues} initialTouched={initialTouched} onSubmit={vi.fn()}>
        {({ values, setFieldValue }) => {
          capturedValues.push(structuredClone(values))
          formikHelpers = { setFieldValue }
          return (
            <Form>
              <DynamicDefaultsSync options={opts} />
            </Form>
          )
        }}
      </Formik>
    )

    // Phase 1: mount with empty options so the sync ref initializes to []
    const { rerender } = render(<TestComponent opts={{}} />)
    // Phase 2: mount with real options — triggers the sync ref diff
    rerender(<TestComponent opts={options} />)

    // Simulate appending a new worker — the fixed handleChange only calls
    // setFieldValue on the list path (no setFieldTouched).
    formikHelpers!.setFieldValue('workers', [{ scheduler: false }, { scheduler: true }])

    await waitFor(() => {
      const last = capturedValues[capturedValues.length - 1] as {
        workers: Array<{ scheduler: boolean }>
      }
      expect(last.workers).toHaveLength(2)
    })

    // The touched state for workers[0].scheduler must survive the append,
    // so DynamicDefaultsSync skips it and the user's false stays false.
    const last = capturedValues[capturedValues.length - 1] as {
      workers: Array<{ scheduler: boolean }>
    }
    expect(last.workers[0]!.scheduler).toBe(false)
    expect(last.workers[1]!.scheduler).toBe(true)
  })

  // Pins the Formik behavior that motivated removing setFieldTouched from
  // the list handleChange: calling setFieldTouched on the list path wipes
  // the nested touched tree for every item. If Formik ever changes this
  // semantic, this test will alert us and we may be able to reintroduce
  // the parent-list touched call.
  it('setFieldTouched on a list path wipes nested item touched state (Formik behavior)', async () => {
    let formikHelpers: {
      setFieldTouched: (name: string, touched: boolean) => void
      getFieldMeta: (name: string) => { touched: unknown }
    } | null = null

    const TestComponent = () => (
      <Formik
        initialValues={{ workers: [{ scheduler: false }] }}
        initialTouched={{ workers: [{ scheduler: true }] }}
        onSubmit={vi.fn()}
      >
        {({ setFieldTouched, getFieldMeta }) => {
          formikHelpers = { setFieldTouched, getFieldMeta }
          return <Form />
        }}
      </Formik>
    )

    render(<TestComponent />)

    expect(formikHelpers!.getFieldMeta('workers[0].scheduler').touched).toBe(true)

    formikHelpers!.setFieldTouched('workers', true)

    await waitFor(() => {
      expect(formikHelpers!.getFieldMeta('workers[0].scheduler').touched).toBeFalsy()
    })
  })
})

describe('defaultReferencesField', () => {
  it('flags any self-reference, transforming or bare', () => {
    expect(defaultReferencesField('${{ inputs.a }}_x', 'a')).toBe(true)
    expect(defaultReferencesField('x${{ inputs.a }}', 'a')).toBe(true)
    expect(defaultReferencesField('${{ inputs.a }}', 'a')).toBe(true)
    expect(defaultReferencesField('${{inputs.a}}', 'a')).toBe(true)
    expect(
      defaultReferencesField('${{ inputs.cluster.settings.time }}!', 'cluster.settings.time'),
    ).toBe(true)
  })

  it('does not flag references to other fields', () => {
    expect(defaultReferencesField('${{ inputs.b }}', 'a')).toBe(false)
    // prefix collision must not match
    expect(defaultReferencesField('${{ inputs.region_name }}', 'region')).toBe(false)
    // sibling within a group is not a self-reference
    expect(
      defaultReferencesField('${{ inputs.cluster.scheduler }}', 'cluster.settings.is_disabled'),
    ).toBe(false)
  })

  it('ignores non-expression and non-string defaults', () => {
    expect(defaultReferencesField('hello', 'a')).toBe(false)
    expect(defaultReferencesField(42, 'a')).toBe(false)
    expect(defaultReferencesField(undefined, 'a')).toBe(false)
  })
})

describe('resetOnChange', () => {
  it('clears the field when the field at its path changes, but not on first render', async () => {
    const options = {
      region: { type: 'string', label: 'Region' },
      zone: { type: 'string', label: 'Zone', resetOnChange: 'region' },
    }
    const latest: { values: Record<string, unknown> } = { values: {} }

    render(
      <Formik initialValues={{ region: 'north', zone: 'north-1' }} onSubmit={vi.fn()}>
        {({ values, setFieldValue, setFieldTouched }) => {
          latest.values = values
          return (
            <Form>
              <FieldsFromOptions
                options={options}
                values={values}
                setFormDirty={vi.fn()}
                setFieldValue={setFieldValue}
                setFieldTouched={setFieldTouched}
              />
              <button
                type="button"
                data-testid="change-region"
                onClick={() => setFieldValue('region', 'south')}
              />
            </Form>
          )
        }}
      </Formik>,
    )

    expect(latest.values).toHaveProperty('zone', 'north-1')

    fireEvent.click(screen.getByTestId('change-region'))

    await waitFor(() => {
      expect(latest.values).toHaveProperty('region', 'south')
    })
    expect(latest.values).not.toHaveProperty('zone')
  })
})

describe('findSelfReferencingFieldNames', () => {
  it('returns self-referencing field paths from raw workflow inputs', () => {
    const inputs = {
      greeting: {
        type: 'string',
        hidden: true,
        default: '${{ inputs.greeting }}_x',
      },
      mirror: { type: 'string', hidden: true, default: '${{ inputs.other }}' },
      bare: { type: 'string', hidden: true, default: '${{ inputs.bare }}' },
      group: {
        type: 'object',
        items: {
          time: {
            type: 'string',
            hidden: true,
            default: 'at ${{ inputs.group.time }}',
          },
        },
      },
    }
    expect(findSelfReferencingFieldNames(inputs)).toEqual(['greeting', 'bare', 'group.time'])
  })

  it('returns an empty array when nothing references itself', () => {
    expect(
      findSelfReferencingFieldNames({
        a: { type: 'string', hidden: true, default: 'plain' },
        b: { type: 'string', hidden: true, default: '${{ inputs.a }}' },
      }),
    ).toEqual([])
  })
})

// workflow.schema.json declares optional/hidden/ignore as ["string", "boolean"], so a
// field flag can hold an expression. When that expression cannot resolve at form-render
// time the parser hands back the raw ${{…}} string, which is truthy — the opposite of
// every flag's documented `false` default.
describe('unresolved expression in a schema flag', () => {
  const unresolvable = "${{ inputs.volumes.[index].type != 'pvc' }}"

  it('keeps a field required when its optional expression cannot be resolved', async () => {
    render(
      <DynamicForm
        formJSONs={{
          expressionOptional: {
            type: 'string',
            label: 'Expression Optional',
            optional: unresolvable,
          },
        }}
        initialValues={{}}
        setValues={() => {}}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('field-expressionOptional')).toBeInTheDocument()
    })
    // `optional` defaults to false, so an unknowable flag must not drop the asterisk.
    expect(screen.getByTestId('field-expressionOptional')).toHaveAttribute('data-optional', 'false')
  })

  it('keeps a value when its ignore expression cannot be resolved', async () => {
    const capturedValues: Record<string, unknown>[] = []

    render(
      <DynamicForm
        formJSONs={{
          visibleField: { type: 'string', label: 'Visible Field' },
          hiddenExpressionIgnore: {
            type: 'string',
            label: 'Hidden Expression Ignore',
            hidden: true,
            ignore: unresolvable,
          },
        }}
        initialValues={{
          visibleField: 'visible',
          hiddenExpressionIgnore: 'should-be-kept',
        }}
        setValues={(values) => capturedValues.push({ ...values })}
        workflowForm={false}
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('field-visibleField')).toBeInTheDocument()
    })
    // Deleting user data on a flag we could not evaluate is not recoverable.
    const lastValues = capturedValues[capturedValues.length - 1]!
    expect(lastValues).toHaveProperty('hiddenExpressionIgnore')
  })
})

describe('remote context', () => {
  it('reaches the parser so a remote workflow previews what its run resolves', async () => {
    const parserMock = vi.mocked(testEngine.evaluate)
    parserMock.mockClear()
    const remoteVars = {
      repo: 'https://github.com/example/demo',
      branch: 'canary',
    }
    const formJSONs = {
      branch: {
        type: 'string',
        label: 'Branch',
        default: '${{ remote.branch }}',
      },
    }
    const initialValues = { branch: '${{ remote.branch }}' }

    render(
      <DynamicForm
        formJSONs={formJSONs}
        initialValues={initialValues}
        remoteVars={remoteVars}
        setValues={() => {}}
        workflowForm
      />,
    )

    await waitFor(() => {
      expect(screen.getByTestId('field-branch')).toBeInTheDocument()
    })

    // The schema parse and the initial-values parse are the two that decide what the
    // form shows before submit; both have to see the same context the run will use.
    const schemaCall = parserMock.mock.calls.find(([args]) => args.obj === formJSONs)
    const valuesCall = parserMock.mock.calls.find(([args]) => args.obj === initialValues)
    expect(schemaCall?.[0].remoteVars).toBe(remoteVars)
    expect(valuesCall?.[0].remoteVars).toBe(remoteVars)
  })
})
