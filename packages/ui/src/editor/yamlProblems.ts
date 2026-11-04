import type { CodedProblem, ProblemParams } from '../components/Provider'

/** A problem the YAML service reports, by its stable code: what its params are, in order. */
interface YamlProblem {
  code: string
  params: readonly string[]
  /** The params that are numbers, which a message formats in the reader's locale. */
  numbers?: readonly string[]
}

// Each schema problem's English template, as the YAML service words it, with the code and params
// it is shown by. The service has no codes of its own: it looks each template up in a translation
// bundle, which ui fills with these codes, so the problem arrives with its code and its params as
// the validator passed them, never parsed back out of its text.
const SCHEMA_PROBLEMS: Record<string, YamlProblem> = {
  'Missing property "{0}".': { code: 'yaml_missing_property', params: ['property'] },
  'Property {0} is not allowed.': { code: 'yaml_property_not_allowed', params: ['property'] },
  'Object is missing property {0} required by property {1}.': {
    code: 'yaml_dependent_required',
    params: ['property', 'requiredBy'],
  },
  'Incorrect type. Expected "{0}".': { code: 'yaml_wrong_type', params: ['type'] },
  'Incorrect type. Expected one of {0}.': { code: 'yaml_wrong_type_any', params: ['types'] },
  'Value must be {0}.': { code: 'yaml_const', params: ['value'] },
  'Value is not accepted. Valid values: {0}.': { code: 'yaml_enum', params: ['values'] },
  'String does not match the pattern of "{0}".': { code: 'yaml_pattern', params: ['pattern'] },
  'String is shorter than the minimum length of {0}.': {
    code: 'yaml_min_length',
    params: ['min'],
    numbers: ['min'],
  },
  'String is longer than the maximum length of {0}.': {
    code: 'yaml_max_length',
    params: ['max'],
    numbers: ['max'],
  },
  'Value is below the minimum of {0}.': { code: 'yaml_minimum', params: ['min'], numbers: ['min'] },
  'Value is above the maximum of {0}.': { code: 'yaml_maximum', params: ['max'], numbers: ['max'] },
  'Value is below the exclusive minimum of {0}.': {
    code: 'yaml_exclusive_minimum',
    params: ['min'],
    numbers: ['min'],
  },
  'Value is above the exclusive maximum of {0}.': {
    code: 'yaml_exclusive_maximum',
    params: ['max'],
    numbers: ['max'],
  },
  'Value is not divisible by {0}.': {
    code: 'yaml_multiple_of',
    params: ['divisor'],
    numbers: ['divisor'],
  },
  'Array has too few items. Expected {0} or more.': {
    code: 'yaml_min_items',
    params: ['min'],
    numbers: ['min'],
  },
  'Array has too many items. Expected {0} or fewer.': {
    code: 'yaml_max_items',
    params: ['max'],
    numbers: ['max'],
  },
  'Array has too many items according to schema. Expected {0} or fewer.': {
    code: 'yaml_extra_items',
    params: ['max'],
    numbers: ['max'],
  },
  'Array has duplicate items.': { code: 'yaml_duplicate_items', params: [] },
  'Array does not contain required item.': { code: 'yaml_contains', params: [] },
  'Array has too few items matching "contains". Expected {0} or more.': {
    code: 'yaml_min_contains',
    params: ['min'],
    numbers: ['min'],
  },
  'Array has too many items matching "contains". Expected {0} or fewer.': {
    code: 'yaml_max_contains',
    params: ['max'],
    numbers: ['max'],
  },
  'Object has more properties than limit of {0}.': {
    code: 'yaml_max_properties',
    params: ['max'],
    numbers: ['max'],
  },
  'Object has fewer properties than the required number of {0}': {
    code: 'yaml_min_properties',
    params: ['min'],
    numbers: ['min'],
  },
  'Matches a schema that is not allowed.': { code: 'yaml_not', params: [] },
  'Matches multiple schemas when only one must validate.': { code: 'yaml_one_of', params: [] },
  'Invalid color format. Use #RGB, #RGBA, #RRGGBB or #RRGGBBAA.': {
    code: 'yaml_format_color',
    params: [],
  },
  'String is not a RFC3339 date-time.': { code: 'yaml_format_date_time', params: [] },
  'String is not a RFC3339 date.': { code: 'yaml_format_date', params: [] },
  'String is not a RFC3339 time.': { code: 'yaml_format_time', params: [] },
  'String is not an e-mail address.': { code: 'yaml_format_email', params: [] },
  'String does not match IPv4 format.': { code: 'yaml_format_ipv4', params: [] },
  'String does not match IPv6 format.': { code: 'yaml_format_ipv6', params: [] },
  'Unused anchor "{0}"': { code: 'yaml_unused_anchor', params: ['anchor'] },
  'Unresolved alias "{0}"': { code: 'yaml_unresolved_alias', params: ['alias'] },
}

// The YAML parser's codes for syntax errors it always words the same way. Its other codes each
// cover several messages, so a message for the code alone would say less than the parser did; those
// keep the parser's text.
const SYNTAX_PROBLEMS: Record<string, YamlProblem> = {
  DUPLICATE_KEY: { code: 'yaml_duplicate_key', params: [] },
  TAB_AS_INDENT: { code: 'yaml_tab_indent', params: [] },
  MULTIPLE_ANCHORS: { code: 'yaml_multiple_anchors', params: [] },
  MULTIPLE_TAGS: { code: 'yaml_multiple_tags', params: [] },
  ALIAS_PROPS: { code: 'yaml_alias_props', params: [] },
}

/**
 * Every code the editor gives a YAML problem, with the params its message reads. A host words each
 * in the reader's language through `useProblemMessage`; one it has no message for keeps the YAML
 * service's English.
 */
export const YAML_PROBLEM_CODES: Readonly<Record<string, readonly string[]>> = Object.fromEntries(
  [...Object.values(SCHEMA_PROBLEMS), ...Object.values(SYNTAX_PROBLEMS)].map(({ code, params }) => [
    code,
    params,
  ]),
)

// Private-use characters, which no template has, around a code and its params.
const START = ''
const NEXT = ''
const END = ''

const byCode = new Map(
  Object.entries(SCHEMA_PROBLEMS).map(([template, problem]) => [
    problem.code,
    { template, problem },
  ]),
)

/** The translation bundle the YAML service starts with, which words each schema problem as its code
 *  and params. */
export function yamlProblemBundle(): Record<string, string> {
  return Object.fromEntries(
    Object.entries(SCHEMA_PROBLEMS).map(([template, { code, params }]) => [
      template,
      START + code + params.map((_, i) => `${NEXT}{${i}}`).join('') + END,
    ]),
  )
}

const fill = (template: string, args: string[]) =>
  template.replace(/\{(\d+)\}/g, (match, i: string) => args[Number(i)] ?? match)

function withParams(problem: YamlProblem, args: string[]): ProblemParams {
  const params: Record<string, string | number> = {}
  problem.params.forEach((name, i) => {
    const arg = args[i] ?? ''
    const number = problem.numbers?.includes(name) ? Number(arg) : Number.NaN
    params[name] = arg !== '' && Number.isFinite(number) ? number : arg
  })
  return params
}

/**
 * A diagnostic from the YAML service as a coded problem: its code and params, and the English the
 * service would have shown, which stays when the host has no message for the code. A diagnostic
 * with no code keeps its own text.
 */
export function yamlProblem(diagnostic: {
  message: string
  code?: number | string | undefined
  source?: string | undefined
}): CodedProblem {
  const { message } = diagnostic
  if (message.startsWith(START) && message.endsWith(END)) {
    const [code = '', ...args] = message.slice(START.length, -END.length).split(NEXT)
    const known = byCode.get(code)
    if (known && args.length === known.problem.params.length) {
      return {
        code,
        params: withParams(known.problem, args),
        message: fill(known.template, args),
      }
    }
    // A param held one of the marks, which no workflow should: the text without them.
    return { message: message.replace(/[-]/g, ' ').trim() }
  }
  const syntax = typeof diagnostic.code === 'string' ? SYNTAX_PROBLEMS[diagnostic.code] : undefined
  return syntax ? { code: syntax.code, params: {}, message } : { message }
}
