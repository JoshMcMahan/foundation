import { type ComponentType, createContext, type ReactNode, useContext } from 'react'

/** Editing controls a form builder wraps around rendered fields. */
export interface FormEditing {
  /** Input path of the fields being rendered; empty at the top level. */
  parent: string[]
  Row: ComponentType<{
    path: string[]
    /** The field isn't drawn, such as one marked hidden. */
    hidden?: boolean
    /** The field's name in the form's values, which tells one input's copies in a list's rows apart. */
    instance?: string
    children?: ReactNode
  }>
  Add: ComponentType<{ parent: string[] }>
}

export const FormEditingContext = createContext<FormEditing | null>(null)

export function useFormEditing(): FormEditing | null {
  return useContext(FormEditingContext)
}

/** Fields rendered inside `children` belong to the input at `path`. */
export function EditingScope({
  editing,
  path,
  children,
}: {
  editing: FormEditing | null
  path: string[] | null
  children: ReactNode
}) {
  if (!editing) {
    return children
  }
  return (
    <FormEditingContext.Provider value={path ? { ...editing, parent: path } : null}>
      {children}
    </FormEditingContext.Provider>
  )
}
