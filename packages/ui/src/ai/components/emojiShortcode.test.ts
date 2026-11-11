import { closeShortcode } from './emojiShortcode'

const typeColon = (text: string, caret = text.length) =>
  closeShortcode(text, `${text.slice(0, caret)}:${text.slice(caret)}`, caret + 1)

describe('closeShortcode', () => {
  it.each([
    [':eyes', '👀'],
    ['look :eyes', 'look 👀'],
    ['look\n:eyes', 'look\n👀'],
    ['look\t:eyes', 'look\t👀'],
    [':EYES', '👀'],
    [':x', '❌'],
    [':+1', '👍'],
    [':thumbsup', '👍'],
    [':woman_technologist', '👩‍💻'],
    ['👀 :heart', '👀 ❤️'],
  ])('replaces %j and its closing colon with the emoji', (typed, want) => {
    expect(typeColon(typed)).toEqual({ text: want, caret: want.length })
  })

  it('keeps the text after the caret and puts the caret after the emoji', () => {
    expect(typeColon('你好 :eyes later', '你好 :eyes'.length)).toEqual({
      text: '你好 👀 later',
      caret: '你好 👀'.length,
    })
  })

  it.each([
    [':ey'],
    [':notanemoji'],
    ['note'],
    [':'],
    [''],
    ['https://example.com/:eyes'],
    ['::eyes'],
    ['10:eyes'],
    [':constructor'],
    [':__proto__'],
  ])('leaves %j as typed', (typed) => {
    expect(typeColon(typed)).toBeNull()
  })

  it('leaves a shortcode that did not end at the typed colon', () => {
    expect(typeColon(':eyes later', ':eyes later'.length)).toBeNull()
  })

  it('leaves a whole shortcode that arrived at once, such as a paste', () => {
    expect(closeShortcode('look ', 'look :eyes:', 'look :eyes:'.length)).toBeNull()
    expect(closeShortcode(':eyes:', ':eyes:', ':eyes:'.length)).toBeNull()
  })

  it('leaves a colon that replaced a selection', () => {
    expect(closeShortcode(':eyesX', ':eyes:', ':eyes:'.length)).toBeNull()
  })
})
