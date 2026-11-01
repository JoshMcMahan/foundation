// One word of a key: an acronym with an optional plural `s` (`GPUs`), an acronym (`MPI`), a word
// (`nodes`, `Partition`), or a number with any letters after it (`2fa`). Digits stay with the
// letters before them, so `s3`, `ipv4` and `h100` read as written.
const WORD = /[A-Z]{2,}s(?![a-z])|[A-Z]+\d*(?![a-z])|[A-Z]?[a-z]+\d*|\d+[a-z]*/g

const isAcronym = (word: string) => /^[A-Z][A-Z\d]*$|^[A-Z]{2,}[A-Z\d]*s$/.test(word)

/**
 * A schema key as a sentence-case label, for a field that has no label of its own: `max_nodes` is
 * "Max nodes", `slurmPartition` "Slurm partition", `numGPUs` "Num GPUs". A path reads by its last
 * name (`jobs.0.name` is "Name"). Acronyms keep their capitals, unless the whole key is written in
 * capitals (`MAX_NODES` is "Max nodes"). A key with no letters or digits is returned as given.
 */
export function humanizeKey(key: string): string {
  const segment =
    key
      .split(/[.[\]]+/)
      .filter((part) => part !== '' && !/^\d+$/.test(part))
      .at(-1) ?? key
  const shouting = /[^A-Za-z0-9]/.test(segment) && segment === segment.toUpperCase()
  const words = segment
    .split(/[^A-Za-z0-9]+/)
    .flatMap((chunk) => (shouting ? [chunk.toLowerCase()] : (chunk.match(WORD) ?? [])))
    .filter(Boolean)
  if (words.length === 0) {
    return key
  }
  const label = words
    .map((word) => (!shouting && isAcronym(word) ? word : word.toLowerCase()))
    .join(' ')
  return label.charAt(0).toUpperCase() + label.slice(1)
}
