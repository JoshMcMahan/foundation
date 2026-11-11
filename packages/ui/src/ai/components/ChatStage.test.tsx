// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { hoverTooltip } from '../../test/tooltip'
import ChatStage, { StageList, StageListRowContent, stageListRowClassName } from './ChatStage'

describe('StageList', () => {
  it('lists rows with a mark, a label and what goes at the end', () => {
    render(
      <StageList testId="recent">
        <li>
          <a href="/s/1" className={stageListRowClassName}>
            <StageListRowContent
              leading={<span data-testid="dot" />}
              label="Rate limit retries"
              meta={<span>11m</span>}
            />
          </a>
        </li>
      </StageList>,
    )
    expect(screen.getByTestId('recent')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Rate limit retries/ })).toHaveAttribute('href', '/s/1')
    expect(screen.getByTestId('dot')).toBeInTheDocument()
    expect(screen.getByText('11m')).toBeInTheDocument()
  })

  it('shows a clipped label whole on hover', async () => {
    const name = 'Default title for sessions started from the composer'
    render(<StageListRowContent label={name} />)
    const label = screen.getByText(name)
    Object.defineProperty(label, 'scrollWidth', { configurable: true, value: 400 })
    Object.defineProperty(label, 'clientWidth', { configurable: true, value: 200 })
    expect(await hoverTooltip(label)).toHaveTextContent(name)
  })
})

describe('ChatStage', () => {
  it('marks itself so a composer on it drops the backdrop it docks with', () => {
    render(
      <ChatStage heading="Start">
        <div data-testid="composer" />
      </ChatStage>,
    )
    expect(screen.getByTestId('composer').closest('.chat-stage')).toBeInTheDocument()
  })
})
