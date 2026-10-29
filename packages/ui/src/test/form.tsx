import { type RenderResult, render } from '@testing-library/react'
import { cloneElement, type ReactElement, type ReactNode } from 'react'
import { FormProvider, type UseFormReturn, useForm } from 'react-hook-form'
import type { DynamicFormProps, FormValues } from '../form/Form'

/** Renders `ui` inside a form that starts with `values`, as DynamicForm renders its fields, and hands
 * back that form to read and drive. */
export function renderInForm(
  ui: ReactElement,
  values: FormValues = {},
): RenderResult & { form: UseFormReturn<FormValues> } {
  let form: UseFormReturn<FormValues> | undefined
  // biome-ignore lint/correctness/noComponentHookFactories: created once for this render result, whose rerenders reuse it
  function Harness({ children }: { children: ReactNode }) {
    form = useForm<FormValues>({ defaultValues: values })
    return <FormProvider {...form}>{children}</FormProvider>
  }
  const result = render(ui, { wrapper: Harness })
  if (!form) {
    throw new Error('The form did not render')
  }
  return { ...result, form }
}

/** Renders a DynamicForm into a form of the test's own, as a host that reads and drives it does. */
export function renderDynamicForm(ui: ReactElement<DynamicFormProps>): Omit<
  RenderResult,
  'rerender'
> & {
  form: UseFormReturn<FormValues>
  rerender: (next: ReactElement<DynamicFormProps>) => void
} {
  let form: UseFormReturn<FormValues> | undefined
  // biome-ignore lint/correctness/noComponentHookFactories: created once for this render result, whose rerenders reuse it
  function Host({ element }: { element: ReactElement<DynamicFormProps> }) {
    form = useForm<FormValues>()
    return cloneElement(element, { form })
  }
  const result = render(<Host element={ui} />)
  if (!form) {
    throw new Error('The form did not render')
  }
  return { ...result, form, rerender: (next) => result.rerender(<Host element={next} />) }
}
