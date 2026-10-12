// Each open editor's way to show some of its lines, by model path, so callers need not load Monaco.
const revealers = new Map<string, (start: number, end: number) => void>()

/** Lets revealLines reach the editor showing `path`; returns the function that undoes it. */
export function registerRevealer(
  path: string,
  reveal: (start: number, end: number) => void,
): () => void {
  revealers.set(path, reveal)
  return () => {
    if (revealers.get(path) === reveal) {
      revealers.delete(path)
    }
  }
}

/** Scrolls the editor showing `path` to 1-based lines `start`–`end` and flashes them. */
export function revealLines(path: string, start: number, end: number): void {
  revealers.get(path)?.(start, end)
}
