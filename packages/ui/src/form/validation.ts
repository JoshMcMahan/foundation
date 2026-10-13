import { createContext } from 'react'

/** A field the server rejected. */
export interface ServerError {
  /** The field's path, written any way: a workflow's `hosts[0].cpus`, a problem response's JSON
   *  Pointer `#/hosts/0/cpus`, or `hosts.0.cpus`. */
  path: string
  /** Why, in the reader's language; without one the field says to check its value. */
  message?: string | undefined
}

/** The field a form renders and needs a value in, and what it says while it has none. Its input's
 *  `useFieldValue` gives the form's store the rule, because the store keeps only the rules the
 *  field's own controller registers. */
export interface RequiredField {
  name: string
  message: string
}

export const RequiredFieldContext = createContext<RequiredField | null>(null)

/** Whether a field holds a value: an empty string or list, like none at all, does not. */
export function filled(value: unknown): boolean {
  return !(
    value === undefined ||
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  )
}

export interface FormChecks {
  /** The server's errors the person hasn't yet answered, by store path. */
  serverErrors: ReadonlySet<string>
  /** Changes each time the host reports a new set, so a wizard turns to the first once. */
  serverErrorsKey: string
  /** Runs a check of the form, a `trigger` or `handleSubmit`. The server's errors never hold the
   *  person back, since the server checks again, so they step aside while it runs and come back on
   *  the fields where it found nothing. */
  check: <T>(run: () => Promise<T>) => Promise<T>
}

export const FormChecksContext = createContext<FormChecks>({
  serverErrors: new Set(),
  serverErrorsKey: '',
  check: (run) => run(),
})
