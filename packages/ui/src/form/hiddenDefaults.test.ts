// @vitest-environment jsdom
import { collectFieldsWithDefaults } from './Form'

// A hidden field marked `ignore` is stripped before save, so its default must never be written:
// the wizard only strips on render, and a collapsed section never renders, so the write would
// survive into the saved config (seen live as desktopSession.sifPath: "").
describe('collectFieldsWithDefaults and hidden fields', () => {
  const sifPath = (ignore: unknown) => ({
    desktopSession: {
      type: 'object',
      items: {
        useApptainer: { type: 'boolean', default: false },
        sifPath: { type: 'string', default: '', hidden: true, ignore },
      },
    },
  })

  it('collects a visible field with a default', () => {
    const names = collectFieldsWithDefaults(sifPath(true), {}).map((f) => f.name)
    expect(names).toContain('desktopSession.useApptainer')
  })

  it('skips a hidden field whose ignore is already resolved', () => {
    const names = collectFieldsWithDefaults(sifPath(true), {}).map((f) => f.name)
    expect(names).not.toContain('desktopSession.sifPath')
  })

  it('skips a hidden field whose ignore is the unresolved self-reference', () => {
    const names = collectFieldsWithDefaults(sifPath('${{ .hidden }}'), {}).map((f) => f.name)
    expect(names).not.toContain('desktopSession.sifPath')
  })

  it('still collects a hidden field that is not ignored', () => {
    const options = {
      keepMe: { type: 'string', default: 'x', hidden: true },
    }
    const names = collectFieldsWithDefaults(options, {}).map((f) => f.name)
    expect(names).toContain('keepMe')
  })
})
