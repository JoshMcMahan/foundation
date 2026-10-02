// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, render, waitFor } from '@testing-library/react'
import { Form, Formik, useFormikContext } from 'formik'
import { useEffect, useState } from 'react'
import FormikCustomDropdown, { Testables } from './FormikCustomDropdown'

const { toComparableOptions } = Testables

// Wrapper that provides required Formik context props to FormikCustomDropdown
function ConnectedDropdown({
  name,
  ...props
}: Omit<
  React.ComponentProps<typeof FormikCustomDropdown>,
  'currentValue' | 'setFieldValue' | 'setFieldTouched'
> & { name: string }) {
  const { setFieldValue, setFieldTouched, values } = useFormikContext<Record<string, unknown>>()
  return (
    <FormikCustomDropdown
      name={name}
      currentValue={values[name]}
      setFieldValue={setFieldValue}
      setFieldTouched={setFieldTouched}
      {...props}
    />
  )
}

// Mock ResizeObserver
global.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

describe('FormikCustomDropdown', () => {
  const mockSetFormDirty = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('object value stability with recreated options', () => {
    /**
     * This test verifies the fix for infinite re-render loops when:
     * 1. Options have object values (like compute cluster selections)
     * 2. Options are recreated on each render (new object references, same content)
     * 3. The dropdown auto-selects a value
     *
     * Without using deepEqual for value comparison (valueSame check), this causes an infinite loop:
     * - Render 1: handleChange sets field.value to objectA
     * - Render 2: prevValueRef.current=undefined, field.value=objectA, options recreated
     *   - valueSame: undefined === objectA → FALSE
     *   - handleChange called with objectB (new reference)
     *   - prevValueRef.current = objectA (captured before state update)
     * - Render 3: prevValueRef.current=objectA, field.value=objectB
     *   - valueSame: objectA === objectB → FALSE (different refs, same content!)
     *   - handleChange called with objectC
     * - Infinite loop!
     *
     * With deepEqual: objectA deepEqual objectB → TRUE → early return → no loop
     */
    it('should not cause infinite re-renders when options with object values are recreated', async () => {
      const onChangeMock = vi.fn()
      let dropdownRenderCount = 0

      // Component that observes Formik values and forces parent re-render
      // This simulates the real-world scenario where parent re-renders on data changes
      function OptionsProvider({
        children,
      }: {
        children: (
          options: React.ComponentProps<typeof FormikCustomDropdown>['options'],
        ) => React.ReactNode
      }) {
        // Force new options on every render (simulates formatClusters recreating objects)
        const options = [
          {
            category: 'My Clusters',
            options: [
              {
                label: 'Test Cluster',
                value: {
                  id: 'cluster-123',
                  type: 'google-slurm',
                  name: 'test-cluster',
                  ip: '10.0.0.1',
                },
              },
            ],
          },
        ]
        return <>{children(options)}</>
      }

      // Wrapper that tracks dropdown renders
      function DropdownWithTracking(props: React.ComponentProps<typeof ConnectedDropdown>) {
        dropdownRenderCount++
        return <ConnectedDropdown {...props} />
      }

      render(
        <Formik initialValues={{ cluster: undefined }} onSubmit={vi.fn()}>
          <Form>
            <OptionsProvider>
              {(options) => (
                <DropdownWithTracking
                  name="cluster"
                  options={options}
                  setFormDirty={mockSetFormDirty}
                  onChange={onChangeMock}
                  autoselect={true}
                />
              )}
            </OptionsProvider>
          </Form>
        </Formik>,
      )

      // Wait for renders to stabilize
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200))
      })

      // The key assertions:
      // 1. onChange should be called (autoselect works)
      expect(onChangeMock).toHaveBeenCalled()

      // 2. onChange call count should be bounded (not infinite)
      // The deepEqual fix for valueSame prevents infinite loops by detecting when
      // prevValueRef.current and field.value have the same content (different refs).
      // Without the fix, handleChange would be called indefinitely because:
      // - prevValueRef.current (objectA) !== field.value (objectB) even when A equals B by content
      // - This causes the effect to continue past the early return
      //
      // With the fix, the loop stops when valueSame = deepEqual(prevValue, currentValue) = TRUE
      expect(onChangeMock.mock.calls.length).toBeLessThanOrEqual(3)

      // 3. Dropdown render count should be bounded (not infinite)
      expect(dropdownRenderCount).toBeLessThan(10)
    })

    /**
     * This test directly targets the valueSame deepEqual fix.
     *
     * When the component re-renders and options are recreated (common pattern),
     * prevValueRef.current holds an OLD object reference while field.value
     * holds a DIFFERENT object reference (but same content).
     *
     * Without deepEqual: prevValueRef !== field.value → effect continues → potential loop
     * With deepEqual: deepEqual(prevValueRef, field.value) → true → early return
     */
    it('should detect value equality by content not reference when comparing previous value', async () => {
      const onChangeMock = vi.fn()

      // This component forces re-renders to trigger the bug
      function ReRenderingParent() {
        const [forceRender, setForceRender] = useState(0)

        // Force multiple re-renders after initial mount
        useEffect(() => {
          if (forceRender >= 5) {
            return
          }
          const timer = setTimeout(() => setForceRender((n) => n + 1), 10)
          return () => clearTimeout(timer)
        }, [forceRender])

        // Options recreated on every render with new object references
        const clusterValue = {
          id: 'test-cluster',
          type: 'aws-slurm',
          name: 'my-cluster',
        }

        const options = [
          {
            category: 'Clusters',
            options: [{ label: 'Cluster', value: clusterValue }],
          },
        ]

        return (
          <Formik
            // Start with an object that has the SAME CONTENT as the option value
            // but is a DIFFERENT reference
            initialValues={{
              resource: {
                id: 'test-cluster',
                type: 'aws-slurm',
                name: 'my-cluster',
              },
            }}
            onSubmit={vi.fn()}
          >
            <Form>
              <ConnectedDropdown
                name="resource"
                options={options}
                setFormDirty={mockSetFormDirty}
                onChange={onChangeMock}
              />
            </Form>
          </Formik>
        )
      }

      await act(async () => {
        render(<ReRenderingParent />)
      })

      // Wait for all the forced re-renders to complete
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 100))
      })

      // The key assertion: onChange should NOT be called because
      // the initial value already matches the option value BY CONTENT
      // Without deepEqual for valueSame, each re-render would trigger handleChange
      // because prevValueRef.current (old object) !== field.value (different old object)
      // even though they have the same content
      expect(onChangeMock).not.toHaveBeenCalled()
    })

    /**
     * This test specifically targets the valueSame check fix.
     * When field.value is an object and we compare it against prevValueRef.current,
     * we need deepEqual to properly detect that the value hasn't meaningfully changed.
     */
    it('should stabilize when field value is an object matching option value by content', async () => {
      const onChangeMock = vi.fn()
      let effectRunCount = 0

      function TestWrapper() {
        // Track how many times we're rendering
        effectRunCount++

        // Recreate options each render (simulating parent re-render)
        const clusterValue = {
          id: 'cluster-456',
          type: 'aws-slurm',
          name: 'aws-cluster',
        }

        const options = [
          {
            category: 'Clusters',
            options: [
              {
                label: 'AWS Cluster',
                value: clusterValue,
              },
            ],
          },
        ]

        return (
          <Formik
            initialValues={{
              // Start with an object value that matches the option content
              resource: {
                id: 'cluster-456',
                type: 'aws-slurm',
                name: 'aws-cluster',
              },
            }}
            onSubmit={vi.fn()}
          >
            <Form>
              <ConnectedDropdown
                name="resource"
                options={options}
                setFormDirty={mockSetFormDirty}
                onChange={onChangeMock}
              />
            </Form>
          </Formik>
        )
      }

      render(<TestWrapper />)

      // Wait a bit for any potential re-render loops to manifest
      await new Promise((resolve) => setTimeout(resolve, 100))

      // Should not trigger onChange because value already matches an option (by content)
      // Without deepEqual, it would see different object references and potentially re-trigger
      expect(onChangeMock).not.toHaveBeenCalled()

      // Render count should be minimal - just initial render, no loop
      expect(effectRunCount).toBeLessThan(5)
    })

    /**
     * Regression test: Simulates the exact scenario from the bug report where
     * a cluster transitions from "provisioning" to "active" and the form crashes.
     */
    it('should handle options changing when a cluster becomes active', async () => {
      const onChangeMock = vi.fn()
      let renderCount = 0

      function TestWrapper() {
        const [clusterActive, setClusterActive] = useState(false)
        renderCount++

        // Simulate the cluster data changing - initially not active, then becoming active
        const clusters = clusterActive
          ? [
              {
                category: 'My Clusters',
                options: [
                  {
                    label: 'My Active Cluster',
                    value: {
                      id: 'my-cluster',
                      type: 'google-slurm',
                      ip: '34.68.227.210',
                      user: 'testuser',
                      name: 'googlev3multi',
                      schedulerType: 'slurm',
                    },
                  },
                ],
              },
              {
                category: 'Shared Clusters',
                options: [],
              },
            ]
          : [
              {
                category: 'My Clusters',
                options: [], // No active clusters yet
              },
              {
                category: 'Shared Clusters',
                options: [],
              },
            ]

        return (
          <div>
            <button type="button" onClick={() => setClusterActive(true)}>
              Activate Cluster
            </button>
            <Formik initialValues={{ cluster: undefined }} onSubmit={vi.fn()}>
              <Form>
                <ConnectedDropdown
                  name="cluster"
                  options={clusters}
                  setFormDirty={mockSetFormDirty}
                  onChange={onChangeMock}
                />
              </Form>
            </Formik>
          </div>
        )
      }

      const { getByText } = render(<TestWrapper />)

      // Initially no clusters, no selection
      expect(onChangeMock).not.toHaveBeenCalled()
      const initialRenderCount = renderCount

      // Simulate cluster becoming active (like when SWR returns updated data)
      await act(async () => {
        getByText('Activate Cluster').click()
      })

      // Wait for the component to process the change
      await waitFor(
        () => {
          // Should auto-select the newly available cluster
          expect(onChangeMock).toHaveBeenCalled()
        },
        { timeout: 1000 },
      )

      // Critical: render count should be bounded, not infinite
      // The bug caused continuous re-renders - this would fail without the fix
      const rendersAfterActivation = renderCount - initialRenderCount
      expect(rendersAfterActivation).toBeLessThan(15)
    })
  })

  describe('autoselect with empty first category', () => {
    it('should autoselect from a later category when the first category is empty', async () => {
      const onChangeMock = vi.fn()

      const options = [
        {
          category: 'My Clusters',
          options: [],
        },
        {
          category: 'Shared Clusters',
          options: [
            {
              label: 'Managed Cluster',
              value: {
                id: 'managed-1',
                type: 'managed-cluster',
                name: 'shared-managed',
              },
            },
          ],
        },
      ]

      render(
        <Formik initialValues={{ cluster: undefined }} onSubmit={vi.fn()}>
          <Form>
            <ConnectedDropdown
              name="cluster"
              options={options}
              setFormDirty={mockSetFormDirty}
              onChange={onChangeMock}
            />
          </Form>
        </Formik>,
      )

      await waitFor(() => {
        expect(onChangeMock).toHaveBeenCalledWith(
          expect.objectContaining({
            id: 'managed-1',
            type: 'managed-cluster',
          }),
        )
      })
    })
  })

  describe('autoselect skips disabled options', () => {
    it('autoselects the first enabled option, not a leading disabled one', async () => {
      const onChangeMock = vi.fn()
      render(
        <Formik initialValues={{ gpu: undefined }} onSubmit={vi.fn()}>
          <Form>
            <ConnectedDropdown
              name="gpu"
              autoselect
              options={[
                { label: 'V100', value: 'v100', disabled: true },
                { label: 'T4', value: 't4' },
              ]}
              setFormDirty={mockSetFormDirty}
              onChange={onChangeMock}
            />
          </Form>
        </Formik>,
      )
      await waitFor(() => expect(onChangeMock).toHaveBeenCalledWith('t4'))
    })

    it('selects nothing when the only option is disabled', async () => {
      const onChangeMock = vi.fn()
      render(
        <Formik initialValues={{ gpu: undefined }} onSubmit={vi.fn()}>
          <Form>
            <ConnectedDropdown
              name="gpu"
              options={[{ label: 'V100', value: 'v100', disabled: true }]}
              setFormDirty={mockSetFormDirty}
              onChange={onChangeMock}
            />
          </Form>
        </Formik>,
      )
      await act(async () => {
        await new Promise((r) => setTimeout(r, 0))
      })
      expect(onChangeMock).not.toHaveBeenCalled()
    })
  })
})

describe('toComparableOptions', () => {
  it('keeps label, value, disabled and description; strips icon and unknown fields', () => {
    const icon = <span>icon</span>
    const options = [
      {
        label: 'A',
        value: 'a',
        icon,
        extra: 'x',
        disabled: true,
        description: 'da',
      },
      { label: 'B', value: 'b' },
    ]
    expect(toComparableOptions(options)).toEqual([
      { label: 'A', value: 'a', disabled: true, description: 'da' },
      { label: 'B', value: 'b' },
    ])
  })

  it('detects a disabled change so the dropdown re-renders', () => {
    const deepEqual = require('fast-deep-equal').default ?? require('fast-deep-equal')
    const enabled = [{ label: 'Flex-start', value: 'flex' }]
    const disabled = [{ label: 'Flex-start', value: 'flex', disabled: true }]
    expect(deepEqual(toComparableOptions(enabled), toComparableOptions(disabled))).toBe(false)
  })

  it('keeps disabled from categorized options, strips icon', () => {
    const icon = <span>icon</span>
    const options = [
      {
        category: 'My Clusters',
        options: [
          { label: 'A', value: 'a', icon, extra: 'x', disabled: true },
          { label: 'B', value: 'b' },
        ],
      },
    ]
    expect(toComparableOptions(options)).toEqual([
      {
        category: 'My Clusters',
        options: [
          { label: 'A', value: 'a', disabled: true },
          { label: 'B', value: 'b' },
        ],
      },
    ])
  })

  it('passes string options through unchanged', () => {
    const options = ['a', 'b', 'c']
    expect(toComparableOptions(options)).toEqual(['a', 'b', 'c'])
  })

  it('returns undefined for undefined input', () => {
    expect(toComparableOptions(undefined)).toBeUndefined()
  })

  it('two calls with equal data but different icon references produce equal results', () => {
    // This is the core property: deepEqual(toComparableOptions(a), toComparableOptions(b)) should be
    // true when a and b differ only in their icon references (e.g. inline JSX)
    const makeOptions = () => [
      {
        category: 'My Clusters',
        options: [
          {
            label: 'Cluster',
            value: { id: '1', type: 'gcp' },
            icon: (
              <img
                src="/icon.png"
                alt="cluster"
                onError={(e) => {
                  ;(e.currentTarget as HTMLImageElement).src = '/fallback.png'
                }}
              />
            ),
          },
        ],
      },
    ]
    const a = makeOptions()
    const b = makeOptions()
    // The icons are different object references (new arrow function each call)
    expect(a[0]!.options[0]!.icon).not.toBe(b[0]!.options[0]!.icon)
    // But after stripping icons the results are deeply equal
    const deepEqual = require('fast-deep-equal').default ?? require('fast-deep-equal')
    expect(deepEqual(toComparableOptions(a), toComparableOptions(b))).toBe(true)
  })
})

describe('FormikCustomDropdown icon stability', () => {
  const mockSetFormDirty = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should not cause infinite re-renders when options contain JSX icons with inline handlers', async () => {
    const onChangeMock = vi.fn()
    let renderCount = 0

    function TestWrapper() {
      const [tick, setTick] = useState(0)
      renderCount++

      // Options are recreated each render. The onError is a new arrow function
      // every time — this is the exact pattern from ComputeResourcesField.
      const options = [
        {
          category: 'My Clusters',
          options: [
            {
              label: 'Test Cluster',
              value: { id: 'cluster-1', type: 'gcp', name: 'test' },
              icon: (
                <img
                  src="/icon.png"
                  alt="cluster"
                  onError={(e) => {
                    ;(e.currentTarget as HTMLImageElement).src = '/fallback.png'
                  }}
                />
              ),
            },
          ],
        },
      ]

      // Force several re-renders to give an infinite loop room to manifest
      useEffect(() => {
        if (tick >= 5) {
          return
        }
        const t = setTimeout(() => setTick((n) => n + 1), 10)
        return () => clearTimeout(t)
      }, [tick])

      return (
        <Formik initialValues={{ cluster: undefined }} onSubmit={vi.fn()}>
          <Form>
            <ConnectedDropdown
              name="cluster"
              options={options}
              setFormDirty={mockSetFormDirty}
              onChange={onChangeMock}
              autoselect={true}
            />
          </Form>
        </Formik>
      )
    }

    await act(async () => {
      render(<TestWrapper />)
      await new Promise((resolve) => setTimeout(resolve, 200))
    })

    // autoselect should fire once for the single available option
    expect(onChangeMock).toHaveBeenCalledTimes(1)
    // render count should be bounded — not looping
    expect(renderCount).toBeLessThan(15)
  })
})
