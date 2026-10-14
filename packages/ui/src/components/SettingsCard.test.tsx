// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { CardHeader } from './Card'
import { SettingRow, SettingsCard, SettingsHeading } from './SettingsCard'

describe('heading levels', () => {
  it('puts a settings card and its group headings where the page outline needs them', () => {
    const { rerender } = render(
      <SettingsCard title="Notifications">
        <SettingsHeading>Email</SettingsHeading>
        <SettingRow label="Digest">on</SettingRow>
      </SettingsCard>,
    )
    expect(screen.getByRole('heading', { name: 'Notifications', level: 2 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Email', level: 3 })).toBeInTheDocument()
    rerender(
      <SettingsCard title="Notifications" headingLevel={3}>
        <SettingsHeading>Email</SettingsHeading>
      </SettingsCard>,
    )
    expect(screen.getByRole('heading', { name: 'Notifications', level: 3 })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Email', level: 4 })).toBeInTheDocument()
  })

  it("titles a card the page's heading unless it sits under one", () => {
    const { rerender } = render(<CardHeader title="Sign in" />)
    expect(screen.getByRole('heading', { name: 'Sign in', level: 1 })).toBeInTheDocument()
    rerender(<CardHeader title="In the cloud" headingLevel={3} />)
    expect(screen.getByRole('heading', { name: 'In the cloud', level: 3 })).toBeInTheDocument()
  })
})
