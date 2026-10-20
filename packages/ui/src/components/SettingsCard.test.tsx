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

describe('a setting row error', () => {
  function Row({ error }: { error?: string }) {
    return (
      <SettingsCard title="Workspace">
        <SettingRow label="Name" htmlFor="workspace-name" error={error}>
          <input id="workspace-name" aria-describedby="name-help" />
          <span id="name-help">Shown to members.</span>
        </SettingRow>
      </SettingsCard>
    )
  }

  it('shows under the control, announced, and describes the control while it lasts', () => {
    const { rerender } = render(<Row error="Couldn't save the name. Try again." />)
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent("Couldn't save the name. Try again.")
    // Inside the row rather than a row of its own, so no rule sits above it.
    expect(alert.closest('[role="none"]')).toBe(screen.getByText('Name').closest('[role="none"]'))
    const input = screen.getByRole('textbox', { name: 'Name' })
    expect(input).toHaveAccessibleDescription(
      "Shown to members. Couldn't save the name. Try again.",
    )
    rerender(<Row />)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(input).toHaveAttribute('aria-describedby', 'name-help')
  })

  it('renders nothing without one', () => {
    render(<Row />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('a settings card error', () => {
  it('shows inside the card above its rows, announced, and nothing without one', () => {
    const { rerender } = render(
      <SettingsCard title="Single sign-on" error="Couldn't save single sign-on.">
        <SettingRow label="Issuer URL">x</SettingRow>
      </SettingsCard>,
    )
    const alert = screen.getByRole('alert')
    expect(alert).toHaveTextContent("Couldn't save single sign-on.")
    const panel = alert.parentElement as HTMLElement
    // Above the rows and outside their rules.
    expect(panel.firstElementChild).toBe(alert)
    expect(alert).not.toHaveClass('border-t')
    expect(screen.getByText('Issuer URL').closest('.divide-y')).not.toContainElement(alert)
    rerender(
      <SettingsCard title="Single sign-on">
        <SettingRow label="Issuer URL">x</SettingRow>
      </SettingsCard>,
    )
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it("puts a compact row's error under the whole row, and a full-width row's under its control", () => {
    render(
      <SettingsCard>
        <SettingRow label="Cycles" error="Something went wrong on our side.">
          <span>switch</span>
        </SettingRow>
        <SettingRow label="Issuer" fill error="Not a URL.">
          <span>field</span>
        </SettingRow>
      </SettingsCard>,
    )
    const [compact, full] = screen.getAllByRole('alert')
    expect(compact).toHaveClass('basis-full', 'md:col-span-2')
    expect(full).toHaveClass('basis-full', 'md:col-start-2', 'md:min-w-full')
  })
})
