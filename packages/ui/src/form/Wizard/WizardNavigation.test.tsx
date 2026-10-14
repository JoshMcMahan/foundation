// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { WizardNavigation } from './WizardNavigation'

describe('WizardNavigation', () => {
  it('names its buttons by the labels they show, as a voice command speaks them', () => {
    render(
      <WizardNavigation
        isLastStep={false}
        canGoBack
        isCurrentStepValid
        nextLabel="Review"
        prevLabel="Back to compute"
        onNext={async () => true}
        onPrevious={() => {}}
      />,
    )
    expect(screen.getByRole('button', { name: 'Review' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Back to compute' })).toBeInTheDocument()
  })
})
