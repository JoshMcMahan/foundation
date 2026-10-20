import type { Meta, StoryObj } from '@storybook/react-vite'
import { expect, userEvent, waitFor, within } from 'storybook/test'
import DescriptionList, {
  DescriptionListGroup,
  DescriptionListItem,
  type DescriptionListVariant,
} from './DescriptionList'
import { ExternalLink } from './ExternalLink'
import { StatusBadge } from './StatusBadge'

const meta: Meta = {
  title: 'UI/Description list',
}
export default meta

const SESSION_ID = '01J9ZK3V7Q8M2X4N6P0R5T1W3Y'
const URL = 'https://sessions.example.com/u/ada/notebook-gpu-8f3c2a91b7d4e6f0/lab/tree/work'

// Stands in for the clipboard, which a story may not be granted, and reports what
// was written to it.
function stubClipboard() {
  const written: string[] = []
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        written.push(text)
      },
    },
  })
  return written
}

interface DetailsArgs {
  variant: DescriptionListVariant
  stacked: boolean
  width: number
}

// A record's details as a drawer shows them: a badge, a link, IDs to copy, dates,
// and values the record doesn't have.
function SessionDetails({ variant, stacked }: Omit<DetailsArgs, 'width'>) {
  return (
    <DescriptionList variant={variant} stacked={stacked}>
      <DescriptionListItem label="Name">notebook-gpu</DescriptionListItem>
      <DescriptionListItem label="Status">
        <StatusBadge variant="success" dot>
          Running
        </StatusBadge>
      </DescriptionListItem>
      <DescriptionListItem label="Owner">ada</DescriptionListItem>
      <DescriptionListItem label="Impersonated by" />
      <DescriptionListItem
        label="Last health check"
        tooltip="When the session last answered on its port."
      >
        Oct 14, 2026, 9:41:07 AM
      </DescriptionListItem>
      <DescriptionListItem label="Session ID" mono copy>
        {SESSION_ID}
      </DescriptionListItem>
      <DescriptionListItem label="URL" copy={URL}>
        <ExternalLink href={URL} className="text-(--theme-link) hover:underline">
          {URL}
        </ExternalLink>
      </DescriptionListItem>
      <DescriptionListItem label="Custom domain" copy>
        {''}
      </DescriptionListItem>
    </DescriptionList>
  )
}

const frame = (width: number, children: React.ReactNode) => (
  <div
    style={{ width, maxWidth: '100%' }}
    className="border border-dashed border-(--theme-border) p-4"
  >
    {children}
  </div>
)

/** The width of a drawer beside the page. Every control a host sets is here. */
export const Drawer: StoryObj<DetailsArgs> = {
  name: 'Drawer width',
  args: { variant: 'divided', stacked: false, width: 520 },
  argTypes: {
    variant: { control: 'inline-radio', options: ['plain', 'divided', 'card'] },
    width: { control: { type: 'range', min: 240, max: 1200, step: 10 } },
  },
  render: ({ width, ...args }) => frame(width, <SessionDetails {...args} />),
  play: async ({ canvasElement }) => {
    const list = canvasElement.querySelector('dl') as HTMLElement
    // Each row groups a term and its definition, and a missing value reads as a word.
    await expect(list.querySelectorAll(':scope > div > dt')).toHaveLength(8)
    await expect(list.querySelectorAll(':scope > div > dd')).toHaveLength(8)
    await expect(within(list).getAllByText('None')).toHaveLength(2)
    // Side by side at this width: the label column is as wide as the longest label.
    const name = within(list).getByText('Name').closest('dt') as HTMLElement
    const value = within(list).getByText('notebook-gpu').closest('dd') as HTMLElement
    await expect(name.getBoundingClientRect().top).toBe(value.getBoundingClientRect().top)
  },
}

/** Copying an ID says what was copied; a link copies the address it was given. */
export const Copyable: StoryObj = {
  render: () => frame(520, <SessionDetails variant="divided" stacked={false} />),
  play: async ({ canvasElement }) => {
    const written = stubClipboard()
    const canvas = within(canvasElement)
    await userEvent.click(canvas.getByRole('button', { name: 'Copy Session ID' }))
    await waitFor(() => expect(written).toEqual([SESSION_ID]))
    await expect(canvas.getByRole('button', { name: 'Copied Session ID' })).toBeVisible()
    await userEvent.click(canvas.getByRole('button', { name: 'Copy URL' }))
    await waitFor(() => expect(written).toEqual([SESSION_ID, URL]))
    // A missing value has nothing to copy.
    await expect(canvas.queryByRole('button', { name: 'Copy Custom domain' })).toBeNull()
  },
}

/** A framed panel, such as a card of a machine's details on its page. */
export const Card: StoryObj = {
  render: () =>
    frame(
      520,
      <DescriptionList variant="card">
        <DescriptionListItem label="Operating system">Ubuntu 24.04.1 LTS</DescriptionListItem>
        <DescriptionListItem label="Architecture" mono>
          x86_64
        </DescriptionListItem>
        <DescriptionListItem label="CPU model">AMD EPYC 9654 96-Core Processor</DescriptionListItem>
        <DescriptionListItem label="Memory" mono>
          1.5 TiB
        </DescriptionListItem>
        <DescriptionListItem label="IP addresses" mono copy>
          <div>10.0.12.41</div>
          <div>fd00:12::41</div>
        </DescriptionListItem>
      </DescriptionList>,
    ),
  play: async ({ canvasElement }) => {
    const written = stubClipboard()
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Copy IP addresses' }))
    // Copied as shown: one address a line.
    await waitFor(() => expect(written).toEqual(['10.0.12.41\nfd00:12::41']))
  },
}

/** A long label wraps within two fifths of the list rather than squeezing the
 *  values; a long value without spaces breaks rather than overflowing. */
export const LongLabelsAndValues: StoryObj = {
  name: 'Long labels and values',
  render: () =>
    frame(
      520,
      <DescriptionList variant="divided">
        <DescriptionListItem label="ID">7</DescriptionListItem>
        <DescriptionListItem label="Maximum time a request may wait in the queue before it is dropped">
          30 seconds
        </DescriptionListItem>
        <DescriptionListItem label="Storage path" mono copy>
          /mnt/shared/projects/simulation-runs/2026-10-14/ensemble-member-0042/output/checkpoints
        </DescriptionListItem>
        <DescriptionListItem label="Description">
          Nightly ensemble run of the regional model, kept for thirty days so the morning report can
          compare it with the day before.
        </DescriptionListItem>
      </DescriptionList>,
    ),
  play: async ({ canvasElement }) => {
    const list = canvasElement.querySelector('dl') as HTMLElement
    const label = within(list)
      .getByText(/Maximum time/)
      .closest('dt') as HTMLElement
    await expect(label.getBoundingClientRect().width).toBeLessThanOrEqual(
      list.getBoundingClientRect().width * 0.4 + 1,
    )
    await expect(list.scrollWidth).toBeLessThanOrEqual(list.clientWidth)
  },
}

/** Values a record doesn't have show the library's empty mark. */
export const Empty: StoryObj = {
  render: () =>
    frame(
      520,
      <DescriptionList>
        <DescriptionListItem label="Owner">ada</DescriptionListItem>
        <DescriptionListItem label="Stopped at">{null}</DescriptionListItem>
        <DescriptionListItem label="Custom domain">{''}</DescriptionListItem>
        <DescriptionListItem label="Error" />
      </DescriptionList>,
    ),
  play: async ({ canvasElement }) => {
    const dds = canvasElement.querySelectorAll('dd')
    await expect([...dds].map((dd) => dd.textContent)).toEqual(['ada', '—None', '—None', '—None'])
  },
}

/** Too narrow for both side by side, each label sits over its value. */
export const Narrow: StoryObj = {
  name: 'Narrow stacking',
  render: () => frame(300, <SessionDetails variant="divided" stacked={false} />),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const name = canvas.getByText('Name').closest('dt') as HTMLElement
    const value = canvas.getByText('notebook-gpu').closest('dd') as HTMLElement
    await expect(value.getBoundingClientRect().top).toBeGreaterThan(
      name.getBoundingClientRect().top,
    )
  },
}

/** On a wide page the label column stays as wide as its labels. */
export const Wide: StoryObj = {
  name: 'Wide page',
  render: () => frame(1100, <SessionDetails variant="plain" stacked={false} />),
}

type EventArgs = { grouped: boolean; variant: DescriptionListVariant; width: number }

// An audit event's details as a drawer shows them: three titled lists, each with
// labels of different lengths.
function EventLists({ variant }: { variant: DescriptionListVariant }) {
  return (
    <>
      <DescriptionList title="Overview" variant={variant}>
        <DescriptionListItem label="Event">session.create</DescriptionListItem>
        <DescriptionListItem label="Time">Oct 14, 2026, 9:41:07 AM</DescriptionListItem>
        <DescriptionListItem label="Result">Allowed</DescriptionListItem>
      </DescriptionList>
      <DescriptionList title="Actor" variant={variant}>
        <DescriptionListItem label="User">ada</DescriptionListItem>
        <DescriptionListItem label="IP">203.0.113.7</DescriptionListItem>
      </DescriptionList>
      <DescriptionList title="Target" variant={variant}>
        <DescriptionListItem label="Resource type">Session</DescriptionListItem>
        <DescriptionListItem label="Resource ID" mono copy>
          {SESSION_ID}
        </DescriptionListItem>
      </DescriptionList>
    </>
  )
}

/** Titled lists side by side in one panel share one label column in a
 *  `DescriptionListGroup`, so every value starts at the same edge. Ungrouped, each list
 *  sizes its column to its own labels. */
export const Grouped: StoryObj<EventArgs> = {
  args: { grouped: true, variant: 'divided', width: 520 },
  argTypes: {
    grouped: { description: 'In a DescriptionListGroup, sharing one label column.' },
    variant: { control: 'inline-radio', options: ['plain', 'divided', 'card'] },
    width: { control: { type: 'range', min: 240, max: 1200, step: 10 } },
  },
  render: ({ grouped, variant, width }) =>
    frame(
      width,
      grouped ? (
        <DescriptionListGroup>
          <EventLists variant={variant} />
        </DescriptionListGroup>
      ) : (
        <div className="flex flex-col gap-6">
          <EventLists variant={variant} />
        </div>
      ),
    ),
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement)
    // Each list is named by its title.
    await expect(canvas.getByRole('group', { name: 'Actor' })).toHaveTextContent('ada')
    const starts = ['session.create', 'ada', 'Session'].map(
      (text) => (canvas.getByText(text).closest('dd') as HTMLElement).getBoundingClientRect().left,
    )
    if (args.grouped) {
      await expect(new Set(starts).size).toBe(1)
    }
  },
}

/** A job's details, dense: `size="xs"` sets small type, and `truncate` keeps a
 *  long value to one line with all of it on hover, while `copy` still copies
 *  the whole value. */
export const DenseAndTruncated: StoryObj<{ size: 'sm' | 'xs'; truncate: boolean }> = {
  args: { size: 'xs', truncate: true },
  argTypes: {
    size: { control: 'inline-radio', options: ['sm', 'xs'] },
    truncate: { description: 'DescriptionListItem: one line, cut off with an ellipsis' },
  },
  render: ({ size, truncate }) =>
    frame(
      360,
      <DescriptionList variant="divided" size={size}>
        <DescriptionListItem label="Job ID" mono copy truncate={truncate}>
          {SESSION_ID}
        </DescriptionListItem>
        <DescriptionListItem label="Partition">gpu-a100</DescriptionListItem>
        <DescriptionListItem label="Nodes" mono truncate={truncate}>
          gpu-a100-[0001-0016],gpu-a100-[0040-0048],gpu-a100-0101
        </DescriptionListItem>
        <DescriptionListItem label="Working directory" mono truncate={truncate}>
          /home/ada/projects/vision/experiments/2026-10-14/run-17
        </DescriptionListItem>
      </DescriptionList>,
    ),
  play: async ({ canvasElement, args }) => {
    const nodes = within(canvasElement).getByText(/gpu-a100-\[0001/)
    await expect(nodes.classList.contains('truncate')).toBe(args.truncate)
  },
}
