import { useEffect } from 'react'
import useSWR from 'swr'
import { Select } from '../../components/Select'
import { ChevronDownIcon } from '../../icons'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import { chipClassName } from '../ui/chip'
import { isOrgModel } from '../utils'

// Allocations are billed in US dollars; the amount reads in the reader's locale.
const dollars = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' })
const money = (amount: number) => dollars.format(amount)

/** Which allocation an organization model bills, with its spend so far. Shows
 *  only for an organization model, and picks the first allocation for it. */
export default function AllocationSelector() {
  const { adapter, selectedProvider, selectedAllocation, setSelectedAllocation } = useChat()
  const t = useChatConfig().strings.allocationPicker

  const isOrgProvider = isOrgModel(selectedProvider)
  const allocationsAdapter = adapter.allocations

  const { data: allocations } = useSWR(
    isOrgProvider && allocationsAdapter ? ['ai-chat-allocations'] : null,
    // The key is null without an adapter, so the fetcher only runs with one.
    () => allocationsAdapter?.list(),
  )

  const first = allocations?.[0]
  useEffect(() => {
    if (!isOrgProvider) {
      if (selectedAllocation) {
        setSelectedAllocation(null)
      }
    } else if (first && !selectedAllocation) {
      setSelectedAllocation(first.name)
    }
  }, [isOrgProvider, first, selectedAllocation, setSelectedAllocation])

  if (!isOrgProvider || !allocations?.length) {
    return null
  }

  const selected = allocations.find((a) => a.name === selectedAllocation)
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Select
        aria-label={t.choose}
        items={allocations.map((a) => ({ value: a.name, label: a.name }))}
        value={selectedAllocation}
        onValueChange={setSelectedAllocation}
        trigger={
          <button type="button" className={chipClassName}>
            <span className="truncate">{selected?.name ?? t.placeholder}</span>
            <ChevronDownIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
          </button>
        }
      />
      {selected && (
        <span className="text-xs tabular-nums theme-muted-text whitespace-nowrap">
          {t.usage(money(selected.used ?? 0), money(selected.total))}
        </span>
      )}
    </div>
  )
}
