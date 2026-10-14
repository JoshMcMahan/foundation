// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import DescriptionList, { DescriptionListItem } from './DescriptionList'
import { toast } from './Toast'

const notifySuccess = vi.spyOn(toast, 'success')

function setClipboard() {
  const writeText = vi.fn(async (_text: string) => {})
  Object.assign(navigator, { clipboard: { writeText } })
  return writeText
}

beforeEach(() => {
  notifySuccess.mockClear()
})

describe('DescriptionList', () => {
  it('groups each label and value as a term and its definition', () => {
    const { container } = render(
      <DescriptionList>
        <DescriptionListItem label="Owner">ada</DescriptionListItem>
        <DescriptionListItem
          label={
            <>
              Region <em>(primary)</em>
            </>
          }
        >
          <a href="/regions/east">east</a>
        </DescriptionListItem>
      </DescriptionList>,
    )
    const list = container.querySelector('dl') as HTMLElement
    const rows = [...list.children]
    expect(rows).toHaveLength(2)
    expect(rows.map((row) => [...row.children].map((child) => child.tagName))).toEqual([
      ['DT', 'DD'],
      ['DT', 'DD'],
    ])
    expect(rows[1]?.querySelector('dt')).toHaveTextContent('Region (primary)')
    expect(screen.getByRole('link', { name: 'east' }).closest('dd')).toBe(
      rows[1]?.querySelector('dd'),
    )
  })

  it('shows the empty mark, read as a word, for a missing value', () => {
    const { container } = render(
      <DescriptionList>
        <DescriptionListItem label="Stopped at">{null}</DescriptionListItem>
        <DescriptionListItem label="Domain">{''}</DescriptionListItem>
        <DescriptionListItem label="Error" copy />
        <DescriptionListItem label="Retries">{0}</DescriptionListItem>
      </DescriptionList>,
    )
    const values = [...container.querySelectorAll('dd')]
    expect(values.map((dd) => dd.textContent)).toEqual(['—None', '—None', '—None', '0'])
    expect(values[0]?.querySelector('[aria-hidden="true"]')).toHaveTextContent('—')
    // Nothing to copy, so no copy button.
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('copies the value as shown, named by its label', async () => {
    const writeText = setClipboard()
    render(
      <DescriptionList>
        <DescriptionListItem label="Session ID" mono copy>
          <span>01J9ZK3V</span>
        </DescriptionListItem>
      </DescriptionList>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Copy Session ID' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('01J9ZK3V'))
    expect(notifySuccess).toHaveBeenCalledWith('Copied Session ID')
    expect(await screen.findByRole('button', { name: 'Copied Session ID' })).toBeInTheDocument()
  })

  it('copies the text it is given in place of what is shown', async () => {
    const writeText = setClipboard()
    render(
      <DescriptionList>
        <DescriptionListItem label={<strong>Commit</strong>} copy="8f3c2a91b7d4e6f0">
          8f3c2a9
        </DescriptionListItem>
      </DescriptionList>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Copy Commit' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('8f3c2a91b7d4e6f0'))
    // A label that isn't plain text can't name the copy.
    expect(notifySuccess).toHaveBeenCalledWith('Copied to clipboard')
  })

  it('leaves the info button out of the copy button name', () => {
    setClipboard()
    render(
      <DescriptionList>
        <DescriptionListItem label="Token" tooltip="Expires in an hour." copy>
          abc
        </DescriptionListItem>
      </DescriptionList>,
    )
    expect(screen.getByRole('button', { name: 'Copy Token' })).toBeInTheDocument()
  })
})
