// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

if (typeof structuredClone === 'undefined') {
  ;(global as Record<string, unknown>)['structuredClone'] = (obj: unknown): unknown =>
    JSON.parse(JSON.stringify(obj))
}

vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)

vi.mock('./Editor', () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <textarea data-testid="editor" value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}))

import Code from './FormCodePanel'

const editorValue = () => JSON.parse((screen.getByTestId('editor') as HTMLTextAreaElement).value)

describe('Code show-hidden toggle', () => {
  const formJSON = {
    name: { type: 'string', label: 'Name', sensitive: true },
    region: { type: 'string', label: 'Region' },
  }
  const data = { name: 'mycluster', region: 'us-east-1' }

  it('hides sensitive fields by default and reveals them when toggled on', () => {
    render(<Code formJSON={formJSON} data={data} mutate={() => {}} />)

    expect(editorValue()).toEqual({ region: 'us-east-1' })

    fireEvent.click(screen.getByRole('switch'))

    expect(editorValue()).toEqual({ name: 'mycluster', region: 'us-east-1' })
  })

  it('re-injects original sensitive values on edit when toggle is off', () => {
    const mutate = vi.fn()
    render(<Code formJSON={formJSON} data={data} mutate={mutate} />)

    fireEvent.change(screen.getByTestId('editor'), {
      target: { value: JSON.stringify({ region: 'eu-west-1' }) },
    })

    expect(mutate).toHaveBeenCalledWith({
      region: 'eu-west-1',
      name: 'mycluster',
    })
  })

  it('keeps edited sensitive values when toggle is on', () => {
    const mutate = vi.fn()
    render(<Code formJSON={formJSON} data={data} mutate={mutate} />)

    fireEvent.click(screen.getByRole('switch'))
    fireEvent.change(screen.getByTestId('editor'), {
      target: {
        value: JSON.stringify({ name: 'renamed', region: 'us-east-1' }),
      },
    })

    expect(mutate).toHaveBeenCalledWith({
      name: 'renamed',
      region: 'us-east-1',
    })
  })

  it('does not render the toggle when there are no hidden fields', () => {
    render(
      <Code
        formJSON={{ region: { type: 'string' } }}
        data={{ region: 'us-east-1' }}
        mutate={() => {}}
      />,
    )

    expect(screen.queryByRole('switch')).not.toBeInTheDocument()
  })

  it('copies the visible (filtered) JSON to the clipboard by default', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<Code formJSON={formJSON} data={data} mutate={() => {}} />)

    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(JSON.stringify({ region: 'us-east-1' }, null, 2)),
    )
  })

  it('copies the complete JSON including hidden fields when toggled on', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    render(<Code formJSON={formJSON} data={data} mutate={() => {}} />)

    fireEvent.click(screen.getByRole('switch'))
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }))

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(
        JSON.stringify({ region: 'us-east-1', name: 'mycluster' }, null, 2),
      ),
    )
  })
})
