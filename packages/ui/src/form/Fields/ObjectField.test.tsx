// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { DynamicForm } from '../Form'

vi.mock('../../components/Provider', async (importOriginal) =>
  (await import('../../test/engine')).mockEngineHooks(importOriginal),
)

describe('ObjectField', () => {
  it('shows its description under its title, and its toggle reads it', async () => {
    render(
      <DynamicForm
        formJSONs={{
          storage: {
            type: 'object',
            label: 'Storage',
            description: 'Where the run reads and writes files.',
            options: { scratch: { type: 'number', label: 'Scratch (GB)' } },
          },
        }}
        initialValues={{}}
      />,
    )
    const toggle = await screen.findByRole('button', { name: 'Storage' })
    expect(toggle).toHaveAccessibleDescription('Where the run reads and writes files.')
    expect(screen.getByText('Where the run reads and writes files.')).toBeVisible()
  })
})
