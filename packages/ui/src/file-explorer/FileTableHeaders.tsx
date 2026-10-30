import { Checkbox } from '../components/Checkbox'
import { useStrings } from '../components/Provider'
import { Table } from '../components/Table'
import { ListActionsHeader } from '../list/index'

interface FileTableHeadersProps {
  allSelected: boolean
  someSelected: boolean
  /** Takes no event: the box is indeterminate-but-unchecked while pages remain. */
  onSelectAll: () => void
}

/** Carries `isTableHeader` so `Table` hoists these into `<thead>`; a bare fragment
 *  would land in `<tbody>`, since Children.toArray only flattens arrays. */
export function FileTableHeaders({
  allSelected,
  someSelected,
  onSelectAll,
}: FileTableHeadersProps) {
  const t = useStrings().fileExplorer
  return (
    <>
      <Table.Header caps={false} className="py-2" style={{ minWidth: 200 }}>
        <div className="flex items-center gap-2.5">
          <Checkbox
            aria-label={t.chrome.selectAll}
            checked={allSelected}
            indeterminate={someSelected && !allSelected}
            onCheckedChange={() => onSelectAll()}
          />
          <span>{t.chrome.name}</span>
        </div>
      </Table.Header>
      <Table.Header
        caps={false}
        className="w-16 px-2 py-2 @min-[40rem]/files:w-[14%] @min-[40rem]/files:px-4"
      >
        {t.chrome.size}
      </Table.Header>
      <Table.Header caps={false} className="hidden w-[14%] py-2 @min-[40rem]/files:table-cell">
        {t.chrome.type}
      </Table.Header>
      <Table.Header caps={false} className="hidden w-[22%] py-2 @min-[40rem]/files:table-cell">
        {t.chrome.lastModified}
      </Table.Header>
      <ListActionsHeader actionCount={2} />
    </>
  )
}

FileTableHeaders.isTableHeader = true
