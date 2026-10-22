import { useEffect } from 'react'
import useSWR from 'swr'
import { Combobox } from '../../components/Combobox'
import { ChevronDownIcon } from '../../icons'
import { useChat } from '../core/ChatProvider'
import { useChatConfig } from '../core/config'
import type { BoundSetting } from '../types'
import { chipClassName } from '../ui/chip'
import { isOrgModel } from '../utils'

// Allocations are billed in US dollars; the amount reads in the reader's locale.
const dollars = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD' })
const money = (amount: number) => dollars.format(amount)

/** Which allocation an organization model bills, with its spend so far. Shows
 *  only for an organization model, and picks the first allocation it can charge. */
export default function AllocationSelector({
  model,
  allocation,
}: {
  /** The model a session owns, which decides whether it bills an allocation. */
  model?: string | null | undefined
  /** The allocation a session owns, in place of the chat's own selection. */
  allocation?: BoundSetting | undefined
} = {}) {
  const chat = useChat()
  const t = useChatConfig().strings.allocationPicker
  const { adapter } = chat
  const bound = allocation !== undefined
  const selectedProvider = bound ? (model ?? null) : chat.selectedProvider
  const selectedAllocation = bound ? (allocation.value ?? null) : chat.selectedAllocation

  const isOrgProvider = isOrgModel(selectedProvider)
  const allocationsAdapter = adapter.allocations

  const { data: allocations } = useSWR(
    isOrgProvider && allocationsAdapter ? ['ai-chat-allocations'] : null,
    // The key is null without an adapter, so the fetcher only runs with one.
    () => allocationsAdapter?.list(),
  )

  const first = allocations?.find((a) => !a.disabled)
  // A session keeps the allocation it has; only the chat's own selection follows the model.
  useEffect(() => {
    if (bound) {
      return
    }
    if (!isOrgProvider) {
      if (selectedAllocation) {
        chat.setSelectedAllocation(null)
      }
    } else if (first && !selectedAllocation) {
      chat.setSelectedAllocation(first.name)
    }
  }, [bound, isOrgProvider, first, selectedAllocation, chat.setSelectedAllocation])

  if (!isOrgProvider || !allocations?.length) {
    return null
  }

  const selected = allocations.find((a) => a.name === selectedAllocation)
  return (
    <div className="flex min-w-0 shrink-[3] items-center gap-2">
      <Combobox<string>
        aria-label={t.choose}
        placeholder={t.search}
        items={allocations.map((a) => ({
          value: a.name,
          label: a.name,
          description: a.description,
          disabled: a.disabled,
        }))}
        value={selectedAllocation}
        disabled={!!allocation?.disabled}
        onValueChange={(name) =>
          bound ? name && allocation.onChange(name) : chat.setSelectedAllocation(name)
        }
        trigger={
          <button type="button" className={chipClassName}>
            <span className="truncate">{selected?.name ?? t.placeholder}</span>
            <ChevronDownIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
          </button>
        }
      />
      {selected && (
        <span className="hidden text-xs tabular-nums theme-muted-text whitespace-nowrap @md:inline">
          {t.usage(money(selected.used ?? 0), money(selected.total))}
        </span>
      )}
    </div>
  )
}
