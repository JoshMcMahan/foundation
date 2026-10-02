import { unstable_serialize } from 'swr/infinite'
import type { AttachmentPage } from '../adapter/types'

export const ATTACHMENTS_PAGE_SIZE = 24

// Shared by the attachments page (useSWRInfinite) and the chat-input uploader,
// which revalidates the page's infinite cache entry after an upload. A plain
// key-filter mutate cannot do that: SWR's filter mutate skips `$inf$` keys.
export function attachmentsPageKey(
  index: number,
  previousPage: AttachmentPage | null,
): [string, string] | null {
  if (index === 0) {
    return ['ai-chat-attachments', '']
  }
  if (!previousPage?.hasMore || !previousPage.nextCursor) {
    return null
  }
  return ['ai-chat-attachments', previousPage.nextCursor]
}

export const ATTACHMENTS_INFINITE_KEY = unstable_serialize(attachmentsPageKey)
