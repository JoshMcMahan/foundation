// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { UIProvider } from '../components/Provider'
import { EditorTextProvider } from './EditorTextProvider'
import { ProblemsButton } from './ProblemsButton'

afterEach(cleanup)

const problems = [
  { message: 'inputs.taget is read, but there is no input called taget.', line: 31 },
]

describe('EditorTextProvider', () => {
  it('words the editor in English without any host text', () => {
    render(<ProblemsButton problems={problems} />)
    expect(screen.getByRole('button', { name: '1 problem' })).toBeInTheDocument()
  })

  it('words the editor below it, over the app-wide text', () => {
    render(
      <UIProvider strings={{ graphEditor: { problemCount: (n) => `${n} app-wide` } }}>
        <EditorTextProvider graphEditor={{ problemCount: (n) => `${n} problema` }}>
          <ProblemsButton problems={problems} />
        </EditorTextProvider>
      </UIProvider>,
    )
    expect(screen.getByRole('button', { name: '1 problema' })).toBeInTheDocument()
  })

  it('keeps the app-wide text for what it leaves out', () => {
    render(
      <UIProvider strings={{ graphEditor: { problemCount: (n) => `${n} app-wide` } }}>
        <EditorTextProvider graphEditor={{ problemLine: (line) => `Línea ${line}` }}>
          <ProblemsButton problems={problems} />
        </EditorTextProvider>
      </UIProvider>,
    )
    expect(screen.getByRole('button', { name: '1 app-wide' })).toBeInTheDocument()
  })

  it('merges a nested provider over the one around it', () => {
    render(
      <EditorTextProvider graphEditor={{ problemCount: (n) => `${n} outer` }}>
        <EditorTextProvider graphEditor={{ problemLine: (line) => `Línea ${line}` }}>
          <ProblemsButton problems={problems} />
        </EditorTextProvider>
      </EditorTextProvider>,
    )
    expect(screen.getByRole('button', { name: '1 outer' })).toBeInTheDocument()
  })
})
