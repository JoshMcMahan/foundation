// Classifies user-role messages that are really recorded artifacts of an
// agent session (recorded tool blocks and the compaction summary marker).
// Adapters replaying agent history
// call this and set ChatMessage.pseudo so the transcript hides them; a naive
// renderer would otherwise show them as the human speaking.

import type { PseudoUserKind } from '../types'

const COMPACTION_MARKER = '[Conversation summary from automatic compaction]'

export function classifyPseudoUserMessage(
  role: string,
  content: string | null | undefined,
): PseudoUserKind | null {
  if (role !== 'user' || !content) {
    return null
  }
  const t = content.trimStart()
  if (t.startsWith('<command-input>')) {
    return 'command-input'
  }
  if (t.startsWith('<shell-input>')) {
    return 'shell-input'
  }
  if (t.startsWith(COMPACTION_MARKER)) {
    return 'compaction'
  }
  return null
}
