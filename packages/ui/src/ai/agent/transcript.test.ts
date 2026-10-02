import {
  hiddenTranscriptTool,
  parseSubagentNotice,
  subagentDeliveryLine,
  taskCallFromArgs,
} from './transcript'

describe('taskCallFromArgs', () => {
  it('prefers the description and drops the default agent type', () => {
    expect(
      taskCallFromArgs(
        '{"description":"Inventory routes","prompt":"long prompt","subagent_type":"default"}',
      ),
    ).toEqual({ description: 'Inventory routes', agentType: '' })
  })

  it('falls back to the clipped prompt', () => {
    const prompt = 'x'.repeat(60)
    expect(taskCallFromArgs(`{"prompt":"${prompt}"}`).description).toBe(`${'x'.repeat(37)}...`)
    expect(taskCallFromArgs('not json').description).toBe('')
  })
})

describe('parseSubagentNotice', () => {
  it('reads a completed report and clips its first line', () => {
    const n = parseSubagentNotice(
      '[Background subagent task-4 (Inventory (routes)) completed]\n\nKey finding: none.\n(pass task-4 as task_id to send it direction)',
    )
    expect(n).toEqual({
      id: 'task-4',
      description: 'Inventory (routes)',
      preview: 'Key finding: none.',
      body: 'Key finding: none.',
      interim: false,
      silent: false,
    })
    expect(subagentDeliveryLine(n!)).toBe(
      '↳ task-4 (Inventory (routes)) reported back: Key finding: none.',
    )
  })

  it('marks an interim message and an interrupted child', () => {
    const interim = parseSubagentNotice(
      '[Message from subagent task-3 (Coverage) — it is still working]\nHalf way.',
    )
    expect(interim?.interim).toBe(true)
    expect(subagentDeliveryLine(interim!)).toBe('↳ message from task-3 (Coverage): Half way.')
    expect(
      parseSubagentNotice(
        '[Background subagent task-1 (x) was interrupted by the user and returned no result]\n(pass task-1 as task_id to resume it)',
      )?.silent,
    ).toBe(true)
  })

  it('reads a background command exit and ignores other notices', () => {
    expect(
      parseSubagentNotice('[Background command bash-2 (npm test) exited with code 1]'),
    ).toMatchObject({ id: 'bash-2', preview: 'exited with code 1' })
    expect(parseSubagentNotice('Goal set: ship it')).toBeNull()
  })
})

describe('hiddenTranscriptTool', () => {
  it('hides the tools whose output has its own surface', () => {
    expect(hiddenTranscriptTool('TodoWrite')).toBe(true)
    expect(hiddenTranscriptTool('ExitPlanMode')).toBe(true)
    expect(hiddenTranscriptTool('Bash')).toBe(false)
  })
})
