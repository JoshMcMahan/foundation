// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import DescriptionList, { DescriptionListGroup, DescriptionListItem } from './DescriptionList'
import { Section } from './Section'
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

  it('lets a path or URL wrap after its slashes, in plain text or a link', async () => {
    const writeText = setClipboard()
    const { container } = render(
      <DescriptionList>
        <DescriptionListItem label="Path" mono copy>
          /mnt/shared/runs
        </DescriptionListItem>
        <DescriptionListItem label="URL">
          <a href="https://example.com/u/ada">https://example.com/u/ada</a>
        </DescriptionListItem>
        <DescriptionListItem label="Owner">ada</DescriptionListItem>
      </DescriptionList>,
    )
    const [path, url, owner] = [...container.querySelectorAll('[data-value]')].map(
      (value) => value.innerHTML,
    )
    expect(path).toBe('/<wbr>mnt/<wbr>shared/<wbr>runs')
    expect(url).toBe(
      '<a href="https://example.com/u/ada">https://<wbr>example.com/<wbr>u/<wbr>ada</a>',
    )
    expect(owner).toBe('ada')
    // The breaks add nothing to the text the copy takes or a reader hears.
    expect(screen.getByRole('link')).toHaveAccessibleName('https://example.com/u/ada')
    fireEvent.click(screen.getByRole('button', { name: 'Copy Path' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('/mnt/shared/runs'))
  })

  it('names a titled list by its title', () => {
    render(
      <DescriptionList title="Actor" headingLevel={4}>
        <DescriptionListItem label="User">ada</DescriptionListItem>
      </DescriptionList>,
    )
    expect(screen.getByRole('heading', { name: 'Actor', level: 4 })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Actor' })).toHaveTextContent('Userada')
  })
})

describe('DescriptionListGroup', () => {
  it('lays every list and row out on its one pair of columns', () => {
    const { container } = render(
      <DescriptionListGroup>
        <DescriptionList title="Overview">
          <DescriptionListItem label="Event">session.create</DescriptionListItem>
        </DescriptionList>
        <DescriptionList title="Target" variant="card">
          <DescriptionListItem label="Resource type">Session</DescriptionListItem>
        </DescriptionList>
      </DescriptionListGroup>,
    )
    const grid = container.querySelector('.\\@container\\/dl > div') as HTMLElement
    expect(grid).toHaveClass('@sm/dl:grid-cols-[fit-content(40%)_minmax(0,1fr)]')
    // Lists, and their rows, take the group's columns rather than sizing their own,
    // so the longest label anywhere sets the one label column.
    const lists = [...container.querySelectorAll('dl')]
    expect(lists).toHaveLength(2)
    for (const list of lists) {
      expect(list).toHaveClass('grid-cols-subgrid')
      expect(list.parentElement).toHaveClass('grid-cols-subgrid')
      expect(list.parentElement?.parentElement).toBe(grid)
    }
    expect(container.querySelectorAll('.\\@container\\/dl')).toHaveLength(1)
    expect(screen.getByRole('group', { name: 'Target' })).toHaveTextContent('Session')
  })

  it('passes its columns through a section, so a list under a heading shares them', () => {
    const { container } = render(
      <DescriptionListGroup>
        <DescriptionList variant="divided">
          <DescriptionListItem label="Name">scratch-lustre</DescriptionListItem>
        </DescriptionList>
        <Section title="Managed Lustre settings">
          <DescriptionList variant="divided">
            <DescriptionListItem label="Storage size (TiB)">18</DescriptionListItem>
          </DescriptionList>
        </Section>
        <Section variant="card" collapsible={false} title="Maintenance">
          <DescriptionList>
            <DescriptionListItem label="Window">Sunday 02:00</DescriptionListItem>
          </DescriptionList>
        </Section>
      </DescriptionListGroup>,
    )
    const grid = container.querySelector('.\\@container\\/dl > div') as HTMLElement
    // Every box from the group down to each list's rows lays out on the group's columns.
    for (const value of ['scratch-lustre', '18', 'Sunday 02:00']) {
      let box = screen.getByText(value).closest('dl') as HTMLElement | null
      while (box && box !== grid) {
        expect(box).toHaveClass('col-span-full', 'grid-cols-subgrid')
        box = box.parentElement
      }
      expect(box).toBe(grid)
    }
    // The heading spans both columns over its list.
    const heading = screen.getByRole('heading', { name: 'Managed Lustre settings' })
    expect(heading.closest('[data-section-header]')).toHaveClass('col-span-full')
  })

  it('keeps a section out of the group laid out as before', () => {
    const { container } = render(
      <Section title="Storage definition">
        <DescriptionList>
          <DescriptionListItem label="Name">scratch-lustre</DescriptionListItem>
        </DescriptionList>
      </Section>,
    )
    expect(container.firstElementChild).toHaveClass('flex', 'flex-col')
    expect(container.querySelector('.grid-cols-subgrid:not(dl *, dl)')).toBeNull()
  })
})

describe('DescriptionList size and truncation', () => {
  it('sets small type, and cuts a long value to a line', () => {
    render(
      <DescriptionList size="xs">
        <DescriptionListItem label="Nodes" mono truncate>
          node-0001,node-0002,node-0003
        </DescriptionListItem>
      </DescriptionList>,
    )
    const value = screen.getByText('node-0001,node-0002,node-0003')
    expect(value).toHaveClass('text-ellipsis', 'whitespace-nowrap', 'font-mono', 'text-[0.75rem]')
    expect(value.closest('dl')).toHaveClass('text-xs')
  })

  it('lets a group set the size of every list in it', () => {
    render(
      <DescriptionListGroup size="xs">
        <DescriptionList title="Actor">
          <DescriptionListItem label="Name">Ada</DescriptionListItem>
        </DescriptionList>
      </DescriptionListGroup>,
    )
    expect(screen.getByText('Ada').closest('dl')).toHaveClass('text-xs')
  })
})
