import { createContext, useContext } from 'react'

export interface FieldContextValue {
  required: boolean
  id?: string | undefined
  labelId?: string | undefined
  descriptionId?: string | undefined
}

const FieldContext = createContext<FieldContextValue>({ required: false })

export const FieldProvider = FieldContext.Provider

/** True when the surrounding FieldWrapper is showing the required asterisk. */
export function useFieldRequired() {
  return useContext(FieldContext).required
}

/** Ties the single focusable control of a field to its FieldWrapper label. */
export function useFieldControlProps() {
  const { id, descriptionId } = useContext(FieldContext)
  return { id, 'aria-describedby': descriptionId }
}

/** For controls and groups that can only be named through aria-labelledby. */
export function useFieldLabelledByProps() {
  const { labelId, descriptionId } = useContext(FieldContext)
  return { 'aria-labelledby': labelId, 'aria-describedby': descriptionId }
}
