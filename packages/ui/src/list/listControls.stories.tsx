import type { Meta, StoryObj } from '@storybook/react-vite'
import { IconButton } from '../components/IconButton'
import { Pagination } from '../components/Pagination'
import { Popover } from '../components/Popover'
import { InfoIcon } from '../icons'
import { ListDisplayMenu, ListFilterMenu } from './ListViewControls'
import { ListCount, ListSearchControl, useListSearch } from './listSearch'
import { useListView } from './listView'

const meta: Meta = {
  title: 'UI/List/Controls',
}
export default meta

interface DemoRow {
  id: string
  name: string
  status: string
  owner: string
}

const ROWS: DemoRow[] = [
  { id: '1', name: 'gpu-cluster', status: 'active', owner: 'alice' },
  { id: '2', name: 'awsv3', status: 'off', owner: 'alice' },
  { id: '3', name: 'azv3', status: 'off', owner: 'qa' },
  { id: '4', name: 'googleflex', status: 'active', owner: 'bob' },
]

function ControlsDemo({ searchable }: { searchable: boolean }) {
  const view = useListView<DemoRow>({
    storageKey: 'storybook-demo-list',
    columns: [
      { key: 'name', label: 'Name', alwaysVisible: true },
      { key: 'status', label: 'Status' },
      { key: 'owner', label: 'Owner' },
    ],
    orderBys: [
      {
        value: 'name',
        label: 'Name',
        compare: (a, b) => a.name.localeCompare(b.name),
      },
      {
        value: 'status',
        label: 'Status',
        compare: (a, b) => a.status.localeCompare(b.status),
      },
    ],
    facets: [
      {
        key: 'status',
        label: 'Status',
        options: [
          { value: 'active', label: 'Active' },
          { value: 'off', label: 'Off' },
        ],
        matches: (row, selected) => selected.includes(row.status),
      },
      {
        key: 'owner',
        label: 'Owner',
        searchable,
        options: [...new Set(ROWS.map((row) => row.owner))].map((owner) => ({
          value: owner,
          label: owner,
        })),
        matches: (row, selected) => selected.includes(row.owner),
      },
    ],
  })
  const search = useListSearch(true, 'storybook-demo-search')
  const rows = view.applyOrder(view.applyFilters(ROWS))
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      {/* At the end, as in a host toolbar: facet flyouts open to the left. */}
      <div className="flex items-center justify-end gap-2">
        <ListSearchControl search={search} placeholder="Search clusters" />
        <ListFilterMenu view={view} />
        <ListDisplayMenu view={view} />
      </div>
      <ListCount
        total={ROWS.length}
        matches={rows.length}
        filterActive={view.activeFilterCount > 0}
        noun="cluster"
        nounPlural="clusters"
      />
      <ul className="text-sm">
        {rows.map((r) => (
          <li key={r.id}>
            {r.name} · {r.status} · {r.owner}
          </li>
        ))}
      </ul>
      <Pagination
        page={0}
        pageSize={rows.length || 1}
        total={ROWS.length}
        onPageChange={() => {}}
      />
    </div>
  )
}

export const Controls: StoryObj<{ searchable: boolean }> = {
  args: { searchable: true },
  render: (args) => <ControlsDemo searchable={args.searchable} />,
}

export const CappedPager: StoryObj = {
  render: () => (
    <div className="max-w-2xl">
      <Pagination page={200} pageSize={50} total={10000} hasNext onPageChange={() => {}} />
    </div>
  ),
}

// A panel that explains rather than offers choices, opened from an outline icon
// button like the strip's own Filter and Display. The play opens it.
export const HelpPopover: StoryObj = {
  render: () => (
    <div className="flex justify-end">
      <Popover
        aria-label="How items appear"
        align="end"
        className="w-80 p-4"
        trigger={<IconButton variant="outline" icon={<InfoIcon />} label="How items appear" />}
      >
        <p className="text-sm theme-text">Items you create show up here within a few seconds.</p>
      </Popover>
    </div>
  ),
  play: async ({ canvasElement }) => {
    canvasElement.querySelector<HTMLButtonElement>('button[aria-label="How items appear"]')?.click()
  },
}
