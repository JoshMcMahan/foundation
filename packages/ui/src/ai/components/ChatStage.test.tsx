// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { render, screen } from '@testing-library/react'
import { StageList, StageListRowContent, stageListRowClassName } from './ChatStage'

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
})
