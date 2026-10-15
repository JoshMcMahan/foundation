// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { DynamicForm } from './Form'

vi.mock('../components/Provider', async (importOriginal) =>
  (await import('../test/engine')).mockEngineHooks(importOriginal),
)

describe('a field’s tooltip', () => {
  it('describes the field’s control, behind a ? hidden from assistive technology and Tab', async () => {
    render(
      <DynamicForm
        formJSONs={{
          name: { type: 'string', label: 'Name', tooltip: 'Lowercase letters\r\nand dashes' },
          size: { type: 'number', label: 'Size', tooltip: ['Nodes', ''] },
        }}
        initialValues={{}}
      />,
    )
    const name = await screen.findByRole('textbox', { name: 'Name' })
    expect(name).toHaveAccessibleDescription(/Lowercase letters\s*and dashes/)
    expect(screen.getByRole('textbox', { name: 'Size' })).toHaveAccessibleDescription('Nodes')
    expect(screen.queryByRole('button', { name: /More info/ })).toBeNull()
    const helps = document.querySelectorAll('button[aria-hidden="true"]')
    expect(helps).toHaveLength(2)
    for (const help of helps) {
      expect(help).toHaveAttribute('aria-hidden', 'true')
      expect(help).toHaveAttribute('tabindex', '-1')
    }
  })
})
