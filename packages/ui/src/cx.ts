import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Joins class names, letting a later utility replace an earlier one it conflicts
 *  with, so a caller's `className` wins over a component's own defaults: `w-20`
 *  narrows a field box that is `w-full` by default. */
export function cx(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
