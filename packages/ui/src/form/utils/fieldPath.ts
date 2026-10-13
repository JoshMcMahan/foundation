/**
 * A field's path as the form store names it: `hosts[0].cpus` becomes `hosts.0.cpus`. A workflow writes
 * rows with brackets, but the store tells a field of a change by a path it starts, so a row's fields
 * hear a change to their list only when both name it with dots.
 */
export function fieldPath(path: string): string {
  return path.replace(/\[(\d+)\]/g, '.$1')
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
