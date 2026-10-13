import { useCallback, useEffect, useRef, useState } from 'react'
import { useStrings } from './Provider'
import { toast } from './Toast'

export interface CopyOptions {
  /** Names what was copied in the toast, "Copied email address"; without it the
   *  toast says only that something was copied. */
  label?: string | undefined
  /** No toast on success, for a control that shows its own check. A failure
   *  still says so. */
  quiet?: boolean | undefined
}

const COPIED_FOR_MS = 2000

/** Copies text to the clipboard and says how it went. `copied` stays true for a
 *  moment after, for a button that turns into a check. */
export function useCopy(): {
  copy: (text: string, options?: CopyOptions) => Promise<boolean>
  copied: boolean
} {
  const { common: t } = useStrings()
  const [copied, setCopied] = useState(false)
  const reset = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(reset.current), [])

  const copy = useCallback(
    async (text: string, { label, quiet = false }: CopyOptions = {}) => {
      try {
        await navigator.clipboard.writeText(text)
      } catch {
        toast.error(label ? t.copyThingFailed(label) : t.copyFailed)
        return false
      }
      if (!quiet) {
        toast.success(label ? t.copiedThing(label) : t.copiedToClipboard)
      }
      setCopied(true)
      clearTimeout(reset.current)
      reset.current = setTimeout(() => setCopied(false), COPIED_FOR_MS)
      return true
    },
    [t],
  )
  return { copy, copied }
}
