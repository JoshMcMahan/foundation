// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { findPattern, findRanges, MAX_MATCHES, transcriptOf } from './transcriptFind'

function scope(html: string): HTMLElement {
  const el = document.createElement('div')
  el.innerHTML = html
  document.body.replaceChildren(el)
  return el
}

const found = (el: Element, query: string) => findRanges(el, query).map((r) => r.toString())

describe('findRanges', () => {
  it('finds a word that formatting splits across elements', () => {
    expect(found(scope('<p>The <code>time</code>out came</p>'), 'timeout')).toEqual(['timeout'])
  })

  it('ignores case and how much whitespace sits between words', () => {
    expect(found(scope('<p>Login   Test failed</p>'), 'login test')).toEqual(['Login   Test'])
  })

  it('does not run a word from one block into the next', () => {
    const el = scope('<p>time</p><p>out</p>')
    expect(found(el, 'timeout')).toEqual([])
    const [range] = findRanges(el, 'time out')
    expect(range?.startContainer.textContent).toBe('time')
    expect(range?.endContainer.textContent).toBe('out')
  })

  it('leaves out text a reader cannot see', () => {
    const el = scope(
      '<span class="sr-only">timeout</span><textarea>timeout</textarea><p>timeout</p>',
    )
    expect(findRanges(el, 'timeout')).toHaveLength(1)
  })

  it('reads the query as text, not a pattern', () => {
    expect(found(scope('<p>axb a.b</p>'), 'a.b')).toEqual(['a.b'])
  })

  it('finds nothing for a blank query', () => {
    expect(findPattern('   ')).toBeNull()
    expect(findRanges(scope('<p>anything</p>'), ' ')).toEqual([])
  })

  it(`stops at ${MAX_MATCHES} matches`, () => {
    expect(findRanges(scope(`<p>${'x '.repeat(MAX_MATCHES + 5)}</p>`), 'x')).toHaveLength(
      MAX_MATCHES,
    )
  })
})

describe('transcriptOf', () => {
  it('is the marked messages, without the composer docked under them', () => {
    const el = scope(
      '<div role="log"><div data-transcript id="messages"></div><div data-composer-dock></div></div>',
    )
    expect(transcriptOf(el)?.id).toBe('messages')
  })

  it('is nothing before there is a transcript', () => {
    expect(transcriptOf(scope('<div></div>'))).toBeNull()
  })
})
