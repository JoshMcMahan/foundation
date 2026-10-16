// A name's place in the theme's categorical palette (`--theme-category-*`), so the same name
// gets the same color on every page and in every session.

/** The fill and text of each palette entry, written out so the stylesheet build sees them. */
export const CATEGORY_CLASSES = [
  'bg-(--theme-category-1) text-(--theme-category-1-text)',
  'bg-(--theme-category-2) text-(--theme-category-2-text)',
  'bg-(--theme-category-3) text-(--theme-category-3-text)',
  'bg-(--theme-category-4) text-(--theme-category-4-text)',
  'bg-(--theme-category-5) text-(--theme-category-5-text)',
  'bg-(--theme-category-6) text-(--theme-category-6-text)',
  'bg-(--theme-category-7) text-(--theme-category-7-text)',
  'bg-(--theme-category-8) text-(--theme-category-8-text)',
] as const

const encoder = new TextEncoder()

/** 32-bit FNV-1a over a string's UTF-8 bytes: cheap, well spread, and the same in any language. */
export function fnv1a(text: string): number {
  let hash = 0x811c9dc5
  for (const byte of encoder.encode(text)) {
    hash = Math.imul(hash ^ byte, 0x01000193)
  }
  return hash >>> 0
}

/** The palette entry, 1–8, for a key. Case, surrounding space and Unicode composition don't
 *  change it, so "Ada Lovelace" and " ada lovelace" match. */
export function categoryOf(key: string): number {
  return (fnv1a(key.trim().normalize('NFC').toLowerCase()) % CATEGORY_CLASSES.length) + 1
}

/** The fill and text classes for a key. */
export function categoryClasses(key: string): string {
  return CATEGORY_CLASSES[categoryOf(key) - 1] as string
}
