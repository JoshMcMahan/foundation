import { describe, expect, it } from 'vitest'
import type { Conversation } from '../types'
import { conversationToMarkdown, exportFilename } from './exportConversation'

const base: Conversation = {
  id: 'c1',
  title: 'Slurm tuning',
  createdAt: '2026-08-16T12:00:00Z',
  messages: [
    { id: 'm1', role: 'user', content: 'How do I tune slurm?' },
    {
      id: 'm2',
      role: 'assistant',
      content: 'Start with:\n\n```bash\nscontrol show config\n```',
    },
    { id: 'm3', role: 'tool', content: '{"result": true}', toolCallId: 't1' },
    { id: 'm4', role: 'assistant', content: null, toolCalls: [] },
    {
      id: 'm5',
      role: 'user',
      content: 'See attached',
      attachments: [
        {
          id: 'a1',
          filename: 'slurm.conf',
          contentType: 'text/plain',
          size: 10,
          uploadedAt: '2026-08-16T12:01:00Z',
        },
      ],
    },
    { id: 'm6', role: 'assistant', content: '', error: 'provider exploded' },
  ],
}

describe('conversationToMarkdown', () => {
  const markdown = conversationToMarkdown(base)

  it('leads with the title and start date', () => {
    expect(markdown.startsWith('# Slurm tuning\n')).toBe(true)
    expect(markdown).toContain('> Started ')
  })

  it('labels user and assistant turns and keeps fenced code verbatim', () => {
    expect(markdown).toContain('## User\n\nHow do I tune slurm?')
    expect(markdown).toContain('```bash\nscontrol show config\n```')
  })

  it('omits tool messages and empty assistant turns', () => {
    expect(markdown).not.toContain('"result"')
    const assistantHeadings = markdown.match(/## Assistant/g) ?? []
    expect(assistantHeadings).toHaveLength(2)
  })

  it('lists attachments by filename and surfaces errors', () => {
    expect(markdown).toContain('> Attached: slurm.conf')
    expect(markdown).toContain('> Error: provider exploded')
  })

  it('falls back to a generic title', () => {
    expect(conversationToMarkdown({ ...base, title: null })).toMatch(/^# Conversation\n/)
  })
})

describe('exportFilename', () => {
  it('slugifies the title', () => {
    expect(exportFilename('Slurm: tuning & tips!')).toBe('slurm-tuning-tips.md')
  })

  it('falls back for empty titles', () => {
    expect(exportFilename(undefined)).toBe('conversation.md')
    expect(exportFilename('  ')).toBe('conversation.md')
  })

  it('caps very long titles', () => {
    expect(exportFilename('x'.repeat(200)).length).toBeLessThanOrEqual(67)
  })
})
