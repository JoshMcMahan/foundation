import type { GraphEdit, InputPath, WorkflowEditing } from '../editing'
import { inputLayout } from './inputLayout'

type Json = Record<string, unknown>

const asRecord = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {}

const isStep = (definition: unknown) => asRecord(definition)['type'] === 'step'

const inputNames = (list: Json) => Object.keys(list).filter((name) => !name.startsWith('$'))

/**
 * The wizard settings a list split into pages gets: what it had, and otherwise pages that can be
 * jumped between and, for the form itself, a Submit button.
 */
export function wizardSettings(list: unknown, submitLabel?: string): Json {
  const wizard = asRecord(asRecord(asRecord(list)['$meta'])['wizard'])
  return {
    ...wizard,
    mode: 'wizard',
    navigation: { allowJump: true, ...asRecord(wizard['navigation']) },
    ...(submitLabel && wizard['submitLabel'] === undefined ? { submitLabel } : {}),
  }
}

/**
 * What splitting the form into pages adds besides its `$meta`: a wizard draws only its pages, so the
 * inputs outside one go into a first page, and a form with no pages gets one to show.
 */
export function firstPageEdits(
  editing: WorkflowEditing,
  inputs: unknown,
  title: string,
): GraphEdit[] {
  const names = inputNames(asRecord(inputs))
  const loose = names.filter((name) => !isStep(asRecord(inputs)[name]))
  if (loose.length === 0 && names.length > 0) {
    return []
  }
  const page = editing.nextName(names, 'step_1')
  const layout = asRecord(asRecord(inputs)['$meta'])['layout']
  return [
    { type: 'addInput', parent: [], index: 0, name: page, definition: newStep(title) },
    ...(loose.length > 0
      ? [
          {
            type: 'moveInputs' as const,
            paths: loose.map((name) => [name]),
            parent: [page],
            index: 0,
          },
        ]
      : []),
    ...(layout !== undefined
      ? [
          {
            type: 'updateInput' as const,
            path: [page],
            set: {
              options: {
                ...Object.fromEntries(loose.map((name) => [name, asRecord(inputs)[name]])),
                $meta: { layout },
              },
            },
          },
        ]
      : []),
  ]
}

/**
 * The edits that split a list of inputs into pages: the form's (`parent` is `[]`), or those the group
 * or list at `parent` holds under `childKey`. Only the form's `$meta` is edited on its own, so a group's
 * or list's inputs are written whole.
 */
export function splitIntoPagesEdits(
  editing: WorkflowEditing,
  list: unknown,
  parent: InputPath,
  childKey: string | undefined,
  title: string,
  submitLabel?: string,
): GraphEdit[] {
  if (parent.length === 0) {
    return [
      {
        type: 'updateWorkflow',
        inputsMeta: { set: { wizard: wizardSettings(list, submitLabel) }, unset: ['layout'] },
      },
      ...firstPageEdits(editing, list, title),
    ]
  }
  const record = asRecord(list)
  const names = inputNames(record)
  const loose = names.filter((name) => !isStep(record[name]))
  const pages = Object.fromEntries(
    names.filter((name) => isStep(record[name])).map((name) => [name, record[name]]),
  )
  const first =
    loose.length > 0 || names.length === 0
      ? {
          [editing.nextName(names, 'step_1')]: {
            ...newStep(title),
            options: {
              ...Object.fromEntries(loose.map((name) => [name, record[name]])),
              ...(asRecord(record['$meta'])['layout'] !== undefined
                ? { $meta: { layout: asRecord(record['$meta'])['layout'] } }
                : {}),
            },
          },
        }
      : {}
  const { layout: _layout, ...previousMeta } = asRecord(record['$meta'])
  const meta = { ...previousMeta, wizard: wizardSettings(record) }
  return [
    {
      type: 'updateInput',
      path: parent,
      set: { [childKey ?? 'items']: { $meta: meta, ...first, ...pages } },
    },
  ]
}

/** A page added after a wizard's last, titled by how many it then has. */
export function addPageEdit(
  editing: WorkflowEditing,
  list: unknown,
  parent: InputPath,
  title: (count: number) => string,
): GraphEdit {
  const names = inputNames(asRecord(list))
  const count = names.filter((name) => isStep(asRecord(list)[name])).length + 1
  return {
    type: 'addInput',
    parent,
    name: editing.nextName(names, `step_${count}`),
    definition: newStep(title(count)),
  }
}

/**
 * What undoing pages adds besides dropping the wizard from `$meta`: each page's inputs go back where
 * the page was, in order, and the pages go. Moving them one by one refuses a name two pages share.
 */
export function pagesBackEdits(list: unknown, parent: InputPath): GraphEdit[] {
  const record = asRecord(list)
  const order = inputNames(record)
  const edits: GraphEdit[] = []
  for (const page of order.filter((name) => isStep(record[name]))) {
    const fields = inputNames(asRecord(asRecord(record[page])['options']))
    const at = order.indexOf(page)
    if (fields.length > 0) {
      edits.push({
        type: 'moveInputs',
        paths: fields.map((name) => [...parent, page, name]),
        parent,
        index: at,
      })
    }
    order.splice(at, 1, ...fields)
    edits.push({ type: 'deleteInput', path: [...parent, page] })
  }
  return edits
}

/** The edits that turn a wizard back into a list of inputs drawn all at once. */
export function unsplitPagesEdits(
  list: unknown,
  parent: InputPath,
  childKey: string | undefined,
): GraphEdit[] {
  const record = asRecord(list)
  const pageLayouts = inputNames(record)
    .filter((name) => isStep(record[name]))
    .map((name) => asRecord(asRecord(record[name])['options']))
  const layout = pageLayouts.some((options) => asRecord(options['$meta'])['layout'] !== undefined)
    ? { type: 'stack', children: pageLayouts.map(inputLayout) }
    : undefined
  if (parent.length === 0) {
    return [
      ...pagesBackEdits(list, []),
      {
        type: 'updateWorkflow',
        inputsMeta: { unset: ['wizard'], ...(layout ? { set: { layout } } : {}) },
      },
    ]
  }
  const { wizard: _wizard, ...meta } = asRecord(record['$meta'])
  if (layout) meta['layout'] = layout
  const unpaged: Json = Object.keys(meta).length > 0 ? { $meta: meta } : {}
  for (const name of inputNames(record)) {
    if (isStep(record[name])) {
      const options = asRecord(asRecord(record[name])['options'])
      for (const field of inputNames(options)) {
        unpaged[field] = options[field]
      }
    } else {
      unpaged[name] = record[name]
    }
  }
  return [
    ...pagesBackEdits(list, parent),
    { type: 'updateInput', path: parent, set: { [childKey ?? 'items']: unpaged } },
  ]
}

/**
 * A wizard step added where the inputs aren't a wizard comes as a wizard of its own: a group whose
 * fields are read as the form's own, holding the step.
 */
export function wizardGroupDefinition(label: string, title: string): Json {
  return {
    type: 'group',
    label,
    flatten: true,
    items: { $meta: { wizard: wizardSettings(undefined) }, step_1: newStep(title) },
  }
}

function newStep(title: string): Json {
  return { type: 'step', title, options: {} }
}
