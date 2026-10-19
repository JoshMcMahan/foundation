import { DateTime } from 'luxon'
import { groupConversationsByDate } from './conversationActions'

const daysAgo = (days: number) => ({
  id: String(days),
  createdAt: DateTime.now().minus({ days }).toISO() ?? '',
})

describe('groupConversationsByDate', () => {
  it('groups by age newest first and leaves out empty groups', () => {
    const groups = groupConversationsByDate([daysAgo(0), daysAgo(40), daysAgo(1.5), daysAgo(3)])
    expect(groups.map((g) => [g.key, g.items.map((c) => c.id)])).toEqual([
      ['groupToday', ['0']],
      ['groupYesterday', ['1.5']],
      ['groupThisWeek', ['3']],
      ['groupOlder', ['40']],
    ])
  })
})

describe('groupConversationsByDate by last activity', () => {
  it('files a conversation by when it last changed, the time its row shows', () => {
    const revived = {
      id: 'old-but-active',
      createdAt: DateTime.now().minus({ days: 40 }).toISO() ?? '',
      updatedAt: DateTime.now().toISO() ?? '',
    }
    const groups = groupConversationsByDate([revived])
    expect(groups.map((g) => g.key)).toEqual(['groupToday'])
  })
})
