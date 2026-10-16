import { CATEGORY_COUNT } from '../theme/derive'
import { CATEGORY_CLASSES, categoryClasses, categoryOf, fnv1a } from './category'

describe('fnv1a', () => {
  it('matches the published 32-bit FNV-1a vectors, over UTF-8', () => {
    expect(fnv1a('')).toBe(0x811c9dc5)
    expect(fnv1a('a')).toBe(0xe40c292c)
    expect(fnv1a('foobar')).toBe(0xbf9cf968)
    // UTF-8 bytes, not UTF-16 code units, so another language hashing the same bytes agrees.
    expect(fnv1a('\u00e9')).toBe(0x1e9de8c1)
  })
})

describe('categoryOf', () => {
  it('gives a name the same entry every time, and these names the entries they always had', () => {
    // A change here recolors everyone's face in every host: never change these.
    expect(
      ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'research-team', 'data-eng'].map(categoryOf),
    ).toEqual([7, 4, 1, 3, 5])
  })

  it('ignores case, surrounding space and Unicode composition', () => {
    expect(categoryOf(' ada LOVELACE ')).toBe(categoryOf('Ada Lovelace'))
    expect(categoryOf('José')).toBe(categoryOf('José'))
  })

  it('spreads names across every entry', () => {
    const counts = new Array(CATEGORY_COUNT).fill(0)
    for (let i = 0; i < 800; i++) {
      counts[categoryOf(`person ${i}`) - 1]++
    }
    for (const count of counts) {
      expect(count).toBeGreaterThan(70)
    }
  })

  it('has a class for every palette entry the theme makes', () => {
    expect(CATEGORY_CLASSES).toHaveLength(CATEGORY_COUNT)
    expect(categoryClasses('Ada Lovelace')).toBe(
      'bg-(--theme-category-7) text-(--theme-category-7-text)',
    )
  })
})
