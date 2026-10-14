// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { RadioGroup } from './Radio'
import { SettingModeOption } from './SettingModeOption'

describe('SettingModeOption', () => {
  it('is named by its label and described by its description', () => {
    render(
      <RadioGroup aria-label="Digest">
        <SettingModeOption value="daily" label="Daily" description="One digest every morning" />
      </RadioGroup>,
    )
    const radio = screen.getByRole('radio', { name: 'Daily' })
    expect(radio).toHaveAccessibleDescription('One digest every morning')
  })

  it('is picked by a press anywhere on it', () => {
    render(
      <RadioGroup aria-label="Digest">
        <SettingModeOption value="daily" label="Daily" description="One digest every morning" />
      </RadioGroup>,
    )
    fireEvent.click(screen.getByText('One digest every morning'))
    expect(screen.getByRole('radio', { name: 'Daily' })).toBeChecked()
  })
})
