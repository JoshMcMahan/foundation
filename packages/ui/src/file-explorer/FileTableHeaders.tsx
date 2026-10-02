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
          <input
            type="checkbox"
            aria-label={t.chrome.selectAll}
            className="h-4 w-4 cursor-pointer rounded border-(--theme-border) text-blue-500 focus:ring-blue-500 focus:ring-offset-0"
            ref={(el) => {
              if (el) {
                el.indeterminate = someSelected && !allSelected
              }
            }}
            onChange={onSelectAll}
            checked={allSelected}
          />
          <span>{t.chrome.name}</span>
        </div>
      </Table.Header>
      <Table.Header caps={false} className="w-[14%] py-2">
        Size
      </Table.Header>
      <Table.Header caps={false} className="w-[14%] py-2">
        Type
      </Table.Header>
      <Table.Header caps={false} className="w-[22%] py-2">
        Last Modified
      </Table.Header>
      <ListActionsHeader actionCount={1} />
    </>
  )
}

FileTableHeaders.isTableHeader = true
