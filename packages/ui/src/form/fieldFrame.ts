import type { FieldProps } from '../components/Field'
import { resolvedFlag } from './lib'
import type { FieldComponentProps } from './types/fieldComponentTypes'

/** How a form field's props frame it: its label, help, description, required mark and error,
 *  laid out as the form lays out its fields. Spread on `Field`. */
export function fieldFrame(
  { field, label, labelPosition, error, disabled, spaceCompact, help }: FieldComponentProps,
  { group = false }: { group?: boolean } = {},
): Omit<FieldProps, 'children'> {
  return {
    label,
    help,
    description: field.description,
    group,
    required: !resolvedFlag(field.optional),
    error,
    disabled,
    layout: labelPosition === 'top' ? 'stacked' : 'inline',
    compact: spaceCompact,
  }
}
