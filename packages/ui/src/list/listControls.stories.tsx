import type { Meta, StoryObj } from '@storybook/react-vite'
import { ListPager } from './ListPager'
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

function ControlsDemo() {
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
    ],
  })
  const search = useListSearch(true, 'storybook-demo-search')
  const rows = view.applyOrder(view.applyFilters(ROWS))
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="flex items-center gap-2">
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
      <ListPager page={0} pageSize={rows.length || 1} total={ROWS.length} onPageChange={() => {}} />
    </div>
  )
}

export const Controls: StoryObj = {
  render: () => <ControlsDemo />,
}
