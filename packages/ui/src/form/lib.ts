import type { DynamicFormSchema } from './types/fieldTypes'
import { applySecondaryField, findSecondaryOption } from './utils/secondaryField'

interface SchemaEntry {
  type?: string
  options?: unknown
  secondaryField?: string | string[]
  optional?: unknown
  default?: unknown
  autoselect?: unknown
  prefillDefault?: unknown
  wizard?: { flatten?: boolean }
}

const EMPTY_ENTRY: SchemaEntry = {}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/**
 * Drops a schema flag the expression parser could not resolve. workflow.schema.json types
 * `optional`/`hidden`/`ignore` as ["string", "boolean"], so a flag whose expression depends
 * on something unavailable at form-render time (a list `[index]` outside a row, `needs.`,
 * `env.`, a secret `var.`) arrives as the raw `${{…}}` string. That string is truthy, which
 * inverts each flag's documented `false` default. Returning undefined lets the caller apply
 * that default instead of reading an expression it never evaluated as "yes".
 */
export function resolvedFlag<T>(value: T): T | undefined {
  return typeof value === 'string' && value.includes('${{') ? undefined : value
}

export function enforceOneMustBeTrue(
  items: Array<Record<string, unknown>>,
  options: DynamicFormSchema,
  promoteIndex: number,
): Array<Record<string, unknown>> {
  if (items.length === 0) {
    return items
  }
  const clampedIndex = Math.max(0, Math.min(promoteIndex, items.length - 1))
  const oneMustBeTrueFields = Object.keys(options).filter(
    (key) =>
      typeof options[key] === 'object' &&
      options[key] !== null &&
      'one_must_be_true' in options[key] &&
      options[key].one_must_be_true,
  )
  for (const fieldKey of oneMustBeTrueFields) {
    const fieldSchema = options[fieldKey]
    // `options` only decides which value counts as "true"; a field without it is still promotable.
    const opts =
      typeof fieldSchema === 'object' && fieldSchema && 'options' in fieldSchema
        ? fieldSchema.options
        : undefined
    const trueOption =
      typeof opts === 'object' && opts && !Array.isArray(opts) && 'onOption' in opts
        ? opts.onOption || true
        : true
    const hasTrue = items.some((item) => item[fieldKey] === trueOption)
    const promoted = items[clampedIndex]
    if (!hasTrue && promoted) {
      promoted[fieldKey] = trueOption
    }
  }
  return items
}

export function flattenGroups(schema: unknown): Record<string, unknown> {
  if (!schema || typeof schema !== 'object') {
    return {}
  }
  const flattened: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(schema as Record<string, SchemaEntry | undefined>)) {
    if (entry?.type === 'group') {
      Object.assign(flattened, flattenGroups(entry.options))
    } else if (entry?.type === 'object') {
      flattened[key] = flattenGroups(entry.options)
    } else {
      flattened[key] = entry
    }
  }
  return flattened
}

/**Not a pure function. Edits 'obj' passed into function */
export function impureSetValueFromPath(obj: Record<string, unknown>, path: string, value: unknown) {
  const parents = path.split('.')
  // split always yields at least one segment
  const leaf = parents.pop() ?? ''

  let current = obj
  for (const segment of parents) {
    const arrayMatch = segment.match(/^(.+)\[(\d+)\]$/)
    if (arrayMatch) {
      const [, key = '', indexText] = arrayMatch
      const index = Number(indexText)
      if (!current[key]) {
        current[key] = []
      }
      const list = current[key] as Record<string, unknown>[]
      let item = list[index]
      if (!item) {
        item = {}
        list[index] = item
      }
      current = item
    } else {
      if (!current[segment]) {
        current[segment] = {}
      }
      current = current[segment] as Record<string, unknown>
    }
  }
  current[leaf] = value
}

export function initializeValues(
  options: unknown,
  srcData: object = {},
  /** Fields whose schema default the host wants left blank. */
  blankDefault?: (field: { type?: string; default?: unknown }) => boolean,
): Record<string, unknown> | undefined {
  if (!options || typeof options !== 'object') {
    return undefined
  }
  const schema = options as Record<string, SchemaEntry | undefined>
  const source = srcData as Record<string, unknown>
  // Copy to avoid mutating the original values
  const data = structuredClone(source)

  const returnObj: Record<string, unknown> = Object.keys(schema).reduce<Record<string, unknown>>(
    (acc, field) => {
      if (field.startsWith('$')) {
        return acc
      }
      const fieldSchema = schema[field] ?? EMPTY_ENTRY
      // A group's fields, and a wizard step's unless the wizard keeps steps nested,
      // live at the level that holds the group.
      const flattenStep = fieldSchema.type === 'step' && schema['$meta']?.wizard?.flatten !== false
      if (fieldSchema.type === 'group' || flattenStep) {
        const values = initializeValues(fieldSchema.options, data)
        for (const key of Object.keys(values ?? {})) {
          acc[key] = data[key] ?? values?.[key]
        }
        return acc
      }
      if (fieldSchema.type === 'step' || fieldSchema.type === 'object') {
        acc[field] = initializeValues(fieldSchema.options, asRecord(data[field]))
        return acc
      }
      if (fieldSchema.type === 'list') {
        // String-list shorthand (options: 'string') stores raw strings,
        // so pass them through without recursing into each character.
        const listData = data[field]
        if (fieldSchema.options === 'string') {
          acc[field] = Array.isArray(listData) ? [...listData] : []
          return acc
        }
        acc[field] = Array.isArray(listData)
          ? listData.map((item) => initializeValues(fieldSchema.options, asRecord(item)))
          : []
        return acc
      }
      if (data[field] !== undefined) {
        acc[field] = data[field]
        if (
          (fieldSchema.type === 'dropdown' || fieldSchema.type === 'storage') &&
          fieldSchema.secondaryField &&
          Array.isArray(fieldSchema.options)
        ) {
          const option = findSecondaryOption(fieldSchema.options, data[field])
          applySecondaryField(
            fieldSchema.secondaryField,
            option?.secondaryValue,
            (secondaryField, secondaryValue) => {
              const preserveInitialValue =
                fieldSchema.type === 'storage' &&
                Object.hasOwn(options, secondaryField) &&
                source[secondaryField] !== undefined
              if (!preserveInitialValue) {
                impureSetValueFromPath(acc, secondaryField, secondaryValue)
              }
            },
          )
        }
        return acc
      }
      if (fieldSchema.type === 'label') {
        return acc
      }
      if (fieldSchema.optional && fieldSchema.default === undefined) {
        return acc
      }

      acc[field] = ''
      if (fieldSchema.autoselect) {
        // Dynamic form will handle auto selecting the first option
        acc[field] = undefined
      }
      if (fieldSchema.type === 'boolean') {
        const boolOptions = asRecord(fieldSchema.options)
        if (boolOptions['offOption'] && boolOptions['onOption']) {
          acc[field] = boolOptions['offOption']
        } else {
          acc[field] = false
        }
      }
      if (fieldSchema.type === 'dropdown') {
        if (Array.isArray(fieldSchema.options) && fieldSchema.options.length > 0) {
          acc[field] = fieldSchema.options[0].value
        }

        if (fieldSchema.secondaryField && Array.isArray(fieldSchema.options)) {
          // Setting value if it's a dropdown with a secondary field
          const option = fieldSchema.options.find(
            (option: { value?: unknown; secondaryValue?: unknown }) => option.value === data[field],
          )
          const secondaryField = Array.isArray(fieldSchema.secondaryField)
            ? fieldSchema.secondaryField
            : [fieldSchema.secondaryField]
          const secondaryValue = Array.isArray(option?.secondaryValue)
            ? option?.secondaryValue
            : [option?.secondaryValue]
          secondaryField.forEach((field: string, index: number) => {
            // set value that hasn't been set yet
            impureSetValueFromPath(data, field, secondaryValue[index])
            // set value that has already been set
            impureSetValueFromPath(acc, field, secondaryValue[index])
          })
        }
      }
      if (fieldSchema.type === 'multi-dropdown' || fieldSchema.type === 'checkbox-group') {
        acc[field] = []
      }

      if (fieldSchema.default !== undefined) {
        acc[field] =
          // String types handle defaults separately (in StringField.tsx)
          fieldSchema.type === 'string' || blankDefault?.(fieldSchema) ? '' : fieldSchema.default
      }
      if (fieldSchema.prefillDefault && fieldSchema.default !== undefined) {
        acc[field] = fieldSchema.default
      }
      return acc
    },
    data,
  )
  return returnObj
}
