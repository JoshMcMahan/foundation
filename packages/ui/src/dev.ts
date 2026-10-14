/**
 * Whether the host runs a development build, for checks that warn about misuse and cost too much
 * to run in production.
 *
 * It reads `process.env.NODE_ENV`, which the host's bundler replaces, so a production build drops
 * the checks and a development build keeps them. Vite's `DEV` flag would not do: this
 * package's own library build replaces it with `false`, so no host would ever see the warning.
 */
export function isDev(): boolean {
  return process.env.NODE_ENV !== 'production'
}
