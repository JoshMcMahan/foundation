import { DateTime } from 'luxon'
import type { Conversation } from '../types'

// Reasoning is intentionally omitted: it is model working memory, not part of
// the conversation record a user shares.
export function conversationToMarkdown(conversation: Conversation): string {
  const lines: string[] = []
  lines.push(`# ${conversation.title?.trim() || 'Conversation'}`)
  if (conversation.createdAt) {
    const dt = DateTime.fromISO(conversation.createdAt)
    if (dt.isValid) {
      lines.push('')
      lines.push(`> Started ${dt.toLocaleString(DateTime.DATETIME_MED)}`)
    }
  }

  for (const message of conversation.messages) {
    if (message.role !== 'user' && message.role !== 'assistant') {
      continue
    }
    const hasAttachments = (message.attachments?.length ?? 0) > 0
    if (!message.content?.trim() && !hasAttachments && !message.error) {
      continue
    }
    lines.push('')
    lines.push(message.role === 'user' ? '## User' : '## Assistant')
    lines.push('')
    if (message.content?.trim()) {
      lines.push(message.content.trim())
    }
    for (const attachment of message.attachments ?? []) {
      lines.push(`> Attached: ${attachment.filename}`)
    }
    if (message.error) {
      lines.push(`> Error: ${message.error}`)
    }
  }

  lines.push('')
  return lines.join('\n')
}

export function exportFilename(title?: string | null): string {
  const slug = (title ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return `${slug || 'conversation'}.md`
}

export function downloadText(filename: string, text: string) {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}
