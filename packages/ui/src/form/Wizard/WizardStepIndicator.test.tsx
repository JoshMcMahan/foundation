// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import type { StepFieldConfig } from './types'
import { WizardStepIndicator } from './WizardStepIndicator'

describe('WizardStepIndicator', () => {
  const stepOrder = Array.from({ length: 24 }, (_, index) => `site[${index}]`)
  const steps: Record<string, StepFieldConfig> = Object.fromEntries(
    stepOrder.map((key, index) => [
      key,
      { type: 'step', title: `Site ${index + 1}`, options: {} } satisfies StepFieldConfig,
    ]),
  )
  const indicator = (props: Partial<Parameters<typeof WizardStepIndicator>[0]> = {}) => (
    <WizardStepIndicator
      stepOrder={stepOrder}
      currentStep="site[2]"
      steps={steps}
      visitedSteps={new Set(stepOrder.slice(0, 3))}
      invalidSteps={new Set()}
      onStepClick={() => true}
      {...props}
    />
  )
  const openList = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'All steps' }))
    return within(await screen.findByRole('dialog', { name: 'Steps' }))
  }

  it('says where the wizard is, however many pages it has', () => {
    render(indicator())
    expect(screen.getByRole('navigation', { name: 'Steps' })).toHaveTextContent('Step 3 of 24')
  })

  it('lists every page, the current one marked', async () => {
    render(indicator())
    const list = await openList()
    expect(list.getAllByRole('listitem')).toHaveLength(24)
    expect(list.getByText('Step 3: Site 3').closest('li')).toHaveAttribute('aria-current', 'step')
    expect(list.getByText('Step 1: Site 1').closest('li')).toHaveTextContent('Done')
  })

  it('jumps to a page already seen, and to none ahead', async () => {
    const onStepClick = vi.fn(() => true)
    render(indicator({ allowJump: true, onStepClick }))
    const list = await openList()
    fireEvent.click(list.getByRole('button', { name: /Step 1: Site 1/ }))
    expect(onStepClick).toHaveBeenCalledWith('site[0]')
    expect(list.queryByRole('button', { name: /Step 9: Site 9/ })).toBeNull()
  })

  it('jumps nowhere unless the wizard allows it', async () => {
    render(indicator())
    const list = await openList()
    expect(list.queryAllByRole('button')).toHaveLength(0)
  })

  it('marks a page with a value to fix', async () => {
    render(indicator({ invalidSteps: new Set(['site[0]']) }))
    const list = await openList()
    expect(list.getByText('Step 1: Site 1').closest('li')).toHaveTextContent('Needs a fix')
  })
})
