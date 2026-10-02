import { useEffect } from 'react'
import useSWR from 'swr'
import { useChat } from '../core/ChatProvider'
import Dropdown from '../ui/Dropdown'
import { isOrgModel } from '../utils'

export default function AllocationSelector({
  variant = 'default',
}: {
  /** 'bare' drops the border, for a toolbar that reads as text. */
  variant?: 'default' | 'bare'
} = {}) {
  const bare = variant === 'bare'
  const { adapter, selectedProvider, selectedAllocation, setSelectedAllocation } = useChat()

  const isOrgProvider = isOrgModel(selectedProvider)
  const allocationsAdapter = adapter.allocations

  const { data: allocations } = useSWR(
    isOrgProvider && allocationsAdapter ? ['ai-chat-allocations'] : null,
    () => allocationsAdapter!.list(),
  )

  // Auto-select first allocation if none selected
  useEffect(() => {
    if (isOrgProvider && allocations?.length && !selectedAllocation) {
      setSelectedAllocation(allocations[0]!.name)
    }
  }, [isOrgProvider, allocations, selectedAllocation, setSelectedAllocation])

  // Clear allocation when switching away from org provider
  useEffect(() => {
    if (!isOrgProvider && selectedAllocation) {
      setSelectedAllocation(null)
    }
  }, [isOrgProvider, selectedAllocation, setSelectedAllocation])

  if (!isOrgProvider || !allocations?.length) {
    return null
  }

  const options = allocations.map((alloc) => ({
    label: alloc.name,
    value: alloc.name,
  }))

  const selected = allocations.find((a) => a.name === selectedAllocation)

  return (
    <div className="flex items-center gap-2">
      <Dropdown
        options={options}
        value={selectedAllocation ?? ''}
        onChange={(v) => setSelectedAllocation(v || null)}
        variant={variant}
        textBoxClassName={
          bare
            ? 'rounded-md px-1.5 py-0.5 text-[11px] hover:theme-muted-panel'
            : 'h-8 rounded-lg border theme-border text-xs px-2'
        }
        placeholder="Select allocation"
      />
      {selected && (
        <span className="text-[10px] theme-muted-text whitespace-nowrap">
          ${(selected.used ?? 0).toFixed(2)} / ${selected.total.toFixed(2)}
        </span>
      )}
    </div>
  )
}
