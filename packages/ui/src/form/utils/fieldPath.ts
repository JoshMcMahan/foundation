/**
 * A field's path as the form store names it, from any way a path to it is written: a workflow's
 * `hosts[0].cpus`, the store's own `hosts.0.cpus`, or a JSON Pointer such as `#/hosts/0/cpus`, as a
 * problem response locates a field. A workflow writes rows with brackets, but the store tells a field
 * of a change by a path it starts, so a row's fields hear a change to their list only when both name
 * it with dots.
 */
export function fieldPath(path: string): string {
  if (path.startsWith('#') || path.startsWith('/')) {
    return pointerPath(path)
  }
  return path.replace(/\[(\d+)\]/g, '.$1')
}

/** A JSON Pointer's path in the store, decoding a URI fragment's escapes and then the pointer's own. */
function pointerPath(pointer: string): string {
  const fragment = pointer.startsWith('#')
  const raw = fragment ? pointer.slice(1) : pointer
  return raw
    .split('/')
    .slice(1)
    .map((segment) =>
      (fragment ? safeDecode(segment) : segment).replaceAll('~1', '/').replaceAll('~0', '~'),
    )
    .join('.')
}

function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  } catch {
    return segment
  }
}

/** The index of the innermost row a path is in, or undefined outside every list. */
export function rowIndexOf(path: string): number | undefined {
  const index = fieldPath(path)
    .split('.')
    .findLast((segment) => /^\d+$/.test(segment))
  return index === undefined ? undefined : Number(index)
}

/** A list's `[index]` placeholder in a path, filled with the row a field is in. */
export function atIndex(path: string, index: number | undefined): string {
  return index === undefined ? path : path.replace('[index]', `[${index}]`)
}
